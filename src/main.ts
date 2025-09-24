import fs from "fs";

import ffmpeg from "@ffmpeg-installer/ffmpeg";
import wcwidth from "wcwidth";

import {Log, colors} from "./util";
import {SoundCloudClient} from "./scapi";
import * as config from "../config";
import {spawn} from "child_process";

import * as util from "./util";


// If it wasn't clear, I expect working directory to be the repository root
if (!process.cwd().toLowerCase().endsWith("scarchive")) {
   throw new Error("Checking that I am being run in the repo root!");
}

// TODO: Some sort of verification for the config files.
const secretsFile: config.SecretsFile = JSON.parse(fs.readFileSync("config/secrets.json", "utf8"));
const configFile: config.ConfigFile = JSON.parse(fs.readFileSync("config/config.json", "utf8"));

const client = new SoundCloudClient(
   secretsFile.Authorization,
   secretsFile.client_id,
   secretsFile.userID,
   configFile,
);

const trackLikes = [];
let maxUsername = 0;

for await (const trackLikesResponse of client.trackLikes()) {
   for (const trackLike of trackLikesResponse.collection) {
      trackLikes.push(trackLike);
      const usernameLength = wcwidth(trackLike.track.user.permalink);
      if (usernameLength > maxUsername) {
         maxUsername = usernameLength;
      }
   }
}

trackLikes.sort((a, b) => new Date(a.created_at) < new Date(b.created_at) ? -1 : 1);

for (const trackLike of trackLikes) {
   const {track} = trackLike;

   Log.info(`${colors.yellow}${trackLike.created_at} ${colors.blue}${track.user.permalink.padStart(maxUsername)} - ${colors.cyan}${track.title}`);
   Log.startGroup();

   const rankings = client.rankTranscodings(track);
   const best = rankings[0]!;

   if (best.preset === "aac_256k") {
      Log.info(`${colors.purple}G${colors.magenta}o${colors.orange}+${colors.reset} Activated!`);
   }

   const ext = util.codecName(best.preset);
   const outdir = `archive/tracks/${track.id}`;
   fs.mkdirSync(outdir, {recursive: true});
   const outfile = `${outdir}/${best.preset}.${ext}`;

   if (fs.existsSync(outfile)) {
      Log.info(`${colors.grey}Cached at ${colors.reset}${outfile}`);
   } else {
      Log.info(`Streaming ${colors.green}${best.preset}!`);
      const tempDownload = `tmp/download/${track.id}.${ext}`;
      try {
         fs.unlinkSync(tempDownload);
      } catch (e) { };
      const m3u8filename = `tmp/m3u8/${best.preset}-${track.id}.m3u8`;

      fs.mkdirSync("tmp/m3u8", {recursive: true});
      fs.writeFileSync(m3u8filename, await client.m3u8Of(best));
      Log.debug(`${best.preset} -> ${m3u8filename}`);

      await util.sleep(3 * configFile.DEBOUNCE_MS);
      Log.debug(`ffmpeg stream ${m3u8filename} -> ${tempDownload}`);
      const ffmpegProcess = spawn(ffmpeg.path, [
         "-protocol_whitelist", "file,http,https,tcp,tls",
         "-i", m3u8filename,
         "-c:a", "copy",
         tempDownload,
      ]);
      ffmpegProcess.stderr.setEncoding("utf8");
      const stderr: string[] = [];
      ffmpegProcess.stderr.on("data", data => stderr.push(data));
      await new Promise((res, rej) =>
         ffmpegProcess.on("close", code => {
            if (code === 0) {
               res(0);
            } else {
               Log.startGroup();
               Log.error(stderr.join(""));
               Log.endGroup();
               rej(`Process exited with code ${code}`);
            }
         })
      );
      fs.renameSync(tempDownload, outfile);
      Log.debug(`${tempDownload} -> ${outfile}`);
      Log.info(`Done.`);
   }

   const outmeta = `archive/tracks/track.json`;
   if (!fs.existsSync(outmeta)) {
      fs.writeFileSync(outmeta, util.dump(track));
   }

   Log.endGroup();
}
