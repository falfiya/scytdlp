import fs from "fs";

import * as util from "./util";
import * as ffmpeg from "./ffmpeg";

import {Progress} from "./progress";
import {Log, colors} from "./util";
import {SoundCloudClient, Track, Transcoding} from "./scapi";


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
      const usernameLength = trackLike.track.user.permalink.length;
      if (usernameLength > maxUsername) {
         maxUsername = usernameLength;
      }
   }
}

trackLikes.sort((a, b) => new Date(a.created_at) < new Date(b.created_at) ? -1 : 1);

const progress = new Progress(trackLikes.length);
for (const trackLike of trackLikes) {
   const {track} = trackLike;

   Log.info(`${colors.yellow}${trackLike.created_at} ${colors.blue}${track.user.permalink.padStart(maxUsername)} - ${colors.cyan}${track.title}`);
   Log.startGroup();

   const outdir = `archive/tracks/${track.id}`;
   fs.mkdirSync(outdir, {recursive: true});

   const startProgress = progress.startProfile();

   let networkActivity = false;
   let downloadSuccessful = false;
   for (const trans of client.rankTranscodings(track)) {
      try {
         const cached = await downloadTranscoding(trans, track);
         networkActivity = !cached;
         downloadSuccessful = true;
         break;
      } catch (e) {
         Log.warn(`Failed:`);
         Log.startGroup();
         Log.error(e);
         Log.endGroup();
      }
   }

   if (!downloadSuccessful) {
      Log.error("Failed to download track!");
   }

   const outmeta = `${outdir}/track.json`;
   if (!fs.existsSync(outmeta)) {
      util.write(outmeta, util.dump(track));
   }

   const outart = `${outdir}/artwork.jpg`;
   if (!fs.existsSync(outart)){
      Log.info("Fetching album art");
      Log.startGroup();
      try {
         util.write(outart, await client.fetchArtwork(track));
         if (!networkActivity) {
            // We perform debouncing in the download path, but if we cached the
            // file, then it's a good idea to wait.
            await util.debounce();
         }
         networkActivity = true;
      } catch (e) {
         Log.error(e);
      }
      Log.endGroup();
   }

   if (networkActivity) {
      progress.endProfile(startProgress);
      Log.info(`Time remaining: ${progress}`);
   } else {
      // not an accurate estimate of how long it will take
      progress.bump();
   }
   Log.endGroup();
}

/**
 * @returns true if the file was cached.
 * @throws If there was an error downloading that transcoding
 */
async function downloadTranscoding(trans: Transcoding, track: Track): Promise<boolean> {
   if (trans.preset === "aac_256k") {
      Log.info(`${colors.purple}G${colors.magenta}o${colors.orange}+${colors.reset} Activated!`);
   }

   const ext = util.codecName(trans.preset);
   const outfile = `archive/tracks/${track.id}/${trans.preset}.${ext}`;

   if (fs.existsSync(outfile)) {
      Log.info(`${colors.grey}Cached at ${colors.reset}${outfile}`);
      return true;
   }

   Log.info(`Streaming ${colors.green}${trans.preset}!${colors.reset}`);
   const m3u8path = `tmp/m3u8/${trans.preset}-${track.id}.m3u8`;
   util.write(m3u8path, await client.m3u8Of(trans));
   Log.debug(`${trans.preset} -> ${m3u8path}`);

   await util.debounce();
   await ffmpeg.stream(m3u8path, outfile);

   Log.info(`Done.`);
   return false;
}
