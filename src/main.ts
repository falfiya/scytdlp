import fs from "fs";
import {spawn} from "child_process";

import ffmpeg from "@ffmpeg-installer/ffmpeg";
import wcwidth from "wcwidth";

import * as util from "./util";
import {Log, colors} from "./util";
import {SoundCloudClient, Transcoding} from "./scapi";


// If it wasn't clear, I expect working directory to be the repository root
if (!process.cwd().toLowerCase().endsWith("scarchive")) {
   throw new Error("Checking that I am being run in the repo root!");
}


const client = new SoundCloudClient();

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

let downloads = 0;
let downloadTime = 0;

async function downloadTranscoding(t: Transcoding, trackId: number): Promise<boolean> {
   if (t.preset === "aac_256k") {
      Log.info(`${colors.purple}G${colors.magenta}o${colors.orange}+${colors.reset} Activated!`);
   }

   const ext = util.codecName(t.preset);
   const outfile = `archive/tracks/${trackId}/${t.preset}.${ext}`;

   if (fs.existsSync(outfile)) {
      Log.info(`${colors.grey}Cached at ${colors.reset}${outfile}`);
      return false;
   } else {
      Log.info(`Streaming ${colors.green}${t.preset}!${colors.reset}`);
      fs.mkdirSync("tmp/download", {recursive: true});
      const tempDownload = `tmp/download/${trackId}.${ext}`;
      try {
         fs.unlinkSync(tempDownload);
      } catch (e) { };
      const m3u8filename = `tmp/m3u8/${t.preset}-${trackId}.m3u8`;

      fs.mkdirSync("tmp/m3u8", {recursive: true});
      fs.writeFileSync(m3u8filename, await client.m3u8Of(t));
      Log.debug(`${t.preset} -> ${m3u8filename}`);

      await util.debounce();
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
      return true;
   }
}

for (const [i, trackLike] of trackLikes.entries()) {
   const start = process.hrtime()[0];
   const {track} = trackLike;

   Log.info(`${colors.yellow}${trackLike.created_at} ${colors.blue}${track.user.permalink.padStart(maxUsername)} - ${colors.cyan}${track.title}`);
   Log.startGroup();

   const outdir = `archive/tracks/${track.id}`;
   fs.mkdirSync(outdir, {recursive: true});

   let done = false;
   for (const ranking of client.rankTranscodings(track)) {
      if (done) break;

      try {
         const downloaded = await downloadTranscoding(ranking, track.id);
         if (downloaded) {
            downloads += 1;
            downloadTime += process.hrtime()[0] - start;
            const averageTimePerDownload = downloadTime / downloads;
            const downloadsLeft = trackLikes.length - i;
            const secondsLeft = averageTimePerDownload * downloadsLeft;
            Log.info(`About ${secondsLeft / 3600 | 0}:${(secondsLeft % 3600) / 60 | 0} remaining.`)
         }
         done = true;
      } catch (e) {
         Log.warn(`Failed:`);
         Log.startGroup();
         Log.error(e);
         Log.endGroup();
      }
   }

   if (!done) {
      Log.error("Failed to download track!");
   }

   const outmeta = `${outdir}/track.json`;
   if (!fs.existsSync(outmeta)) {
      fs.writeFileSync(outmeta, util.dump(track));
   }

   Log.endGroup();
}
