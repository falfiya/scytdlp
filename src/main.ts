import fs from "fs";

import * as util from "./util";
import * as ffmpeg from "./ffmpeg";

import {Progress} from "./progress";
import {Log, colors} from "./util";
import * as sc from "./scapi";
import {config} from "./config";


// If it wasn't clear, I expect working directory to be the repository root
if (!process.cwd().toLowerCase().endsWith("scarchive")) {
   throw new Error("Checking that I am being run in the repo root!");
}

const client = new sc.SoundCloudClient();
const tracksToProcess: {[id in string]: sc.Track} = {};
const playlistsToProcess: {[id in string]: sc.Playlist} = {};

Log.info("Track Likes");
let maxUsernameTracks = 0;
Log.groupStart();
{
   const likes: sc.TrackLikeObject[] = [];
   for await (const _likes of client.fetchTrackLikes()) {
      for (const like of _likes) {
         likes.push(like);
         const usernameLength = like.track.user.permalink.length;
         if (usernameLength > maxUsernameTracks) {
            maxUsernameTracks = usernameLength;
         }
      }
   }
   likes.sort((a, b) => new Date(a.created_at) < new Date(b.created_at) ? -1 : 1);
   for (const like of likes) {
      const {track} = like;
      Log.info(`${colors.yellow}${like.created_at} ${colors.blue}${track.user.permalink.padStart(maxUsernameTracks)} - ${colors.cyan}${track.title}`);
      if (!tracksToProcess[track.id]) {
         tracksToProcess[track.id] = track;
      }
   }

   util.write(`${config.OUTPUT}/likes.json`, util.dump(likes));
}
Log.groupEnd();

Log.info("Playlist Likes");
Log.groupStart();
let maxPlaylistUsername = 0;
{
   const likes = [];
   for await (const _likes of client.fetchPlaylistLikes()) {
      for (const like of _likes) {
         likes.push(like);
         let usernameLength;
         if (like.type === "system-playlist-like") {
            usernameLength = like.system_playlist.user.permalink.length;
         } else if (like.type.startsWith("playlist") ) {
            usernameLength = like.playlist.user.permalink.length;
         } else {
            Log.error("Unrecognized Playlist Like Type!");
            Log.error(like);
            continue;
         }
         if (usernameLength > maxPlaylistUsername) {
            maxPlaylistUsername = usernameLength;
         }
      }
   }

   likes.sort((a, b) => new Date(a.created_at) < new Date(b.created_at) ? -1 : 1);
   for (const like of likes) {
      let playlist: sc.PlaylistNoTracks;
      if (like.type === "system-playlist-like") {
         playlist = like.system_playlist;
      } else {
         playlist = like.playlist;
      }
      Log.info(`${colors.yellow}${like.created_at} ${colors.blue}${playlist.user.permalink.padStart(maxPlaylistUsername)} - ${colors.cyan}${playlist.title}`);
      const fullPlaylist = await client.fetchPlaylist(playlist.id);
      if (fullPlaylist != null && typeof fullPlaylist === "object") {
         if (!playlistsToProcess[playlist.id]) {
            playlistsToProcess[playlist.id] = fullPlaylist;
         }
      } else {
         Log.error(`Error fetching playlist ${playlist.title}#${playlist.id}!`);
         Log.error(fullPlaylist);
         if (!playlistsToProcess[playlist.id]) {
            // @ts-shut-the-fuck-up
            playlistsToProcess[playlist.id] = playlist;
         }
      }
   }
   util.write("archive/playlist.json", util.dump(likes));
}
Log.groupEnd();

Log.info("Reposts");
let maxRepostUsername = 0;
Log.groupStart();
{
   const reposts: sc.Repost[] = [];
   for await (const _reposts of client.fetchReposts()) {
      for (const repost of _reposts) {
         let obj;
         switch (repost.type) {
         case "track":
         case "track-repost":
            obj = repost.track;
            break;
         case "playlist":
         case "playlist-repost":
            obj = repost.playlist;
         default:
            // This should be impossible because of a branch above.
            Log.error("Unrecognized Repost Type!");
            Log.error(repost);
            continue;
         }
         reposts.push(repost);
         const usernameLength = obj.user.permalink.length;
         if (usernameLength > maxRepostUsername) {
            maxRepostUsername = usernameLength;
         }
      }
   }

   reposts.sort((a, b) => new Date(a.created_at) < new Date(b.created_at) ? -1 : 1);
   util.write("archive/reposts.json", util.dump(reposts));

   for (const repost of reposts) {
      let obj;
      switch (repost.type) {
      case "track":
      case "track-repost":
         obj = repost.track;
         break;
      case "playlist":
      case "playlist-repost":
         obj = repost.playlist;
      default:
         // This should be impossible because of a branch above.
         Log.error("Unrecognized Repost Type!");
         Log.error(repost);
         continue;
      }
      Log.info(`${colors.yellow}${repost.created_at} ${colors.blue}${obj.user.permalink.padStart(maxRepostUsername)} - ${colors.cyan}${obj.title}`);
   }
}
Log.groupEnd();

Log.info("Processing Playlists");
Log.groupStart();
for (const playlist of Object.values(playlistsToProcess)) {
   Log.debug(typeof playlist);
   Log.info(`${colors.blue}${playlist.user.permalink.padEnd(maxPlaylistUsername)} - ${colors.cyan}${playlist.title}`);
   Log.groupStart();
   for (const partial of playlist.tracks) {
      try {
         const track = await client.fetchTrack(partial.id);
         const usernameLength = track.user.permalink.length;
         if (usernameLength > maxUsernameTracks) {
            maxUsernameTracks = usernameLength;
         }
         tracksToProcess[track.id] = track;
      } catch (e) {
         Log.error(e);
      }
   }

   let outdir: string;
   if (typeof playlist.id === "string" && playlist.id.startsWith("soundcloud:system-playlists:")) {
      outdir = `archive/playlists/${playlist.title.replace(/\s/g, "_")}`;
   } else {
      outdir = `archive/playlists/${playlist.id}`;
   }

   fs.mkdirSync(outdir, {recursive: true});
   if (playlist.artwork_url) {
      await downloadArt(playlist.artwork_url, `${outdir}/artwork.jpg`);
   }
   util.write(`${outdir}/playlist.json`, util.dump(playlist));
   Log.groupEnd();
}
Log.groupEnd();

Log.info("Streaming Tracks");
Log.groupStart();
const tracksToProcess2 = Object.values(tracksToProcess);
const progress = new Progress(tracksToProcess2.length);
for (const track of tracksToProcess2) {
   const startProgress = progress.startProfile();

   const whatHappened = await downloadTrack(track);
   if (whatHappened === "downloaded") {
      progress.endProfile(startProgress);
      Log.info(`Time remaining: ${progress}`);
   } else {
      // not an accurate estimate of how long it will take
      progress.bump();
   }
}
Log.groupEnd();

async function downloadTrack(track: sc.Track): Promise<"downloaded" | "cached" | "failure"> {
   const outdir = `archive/tracks/${track.id}`;
   fs.mkdirSync(outdir, {recursive: true});

   Log.info(`${colors.blue}${track.user.permalink.padEnd(maxUsernameTracks)} - ${colors.cyan}${track.title}`)
   Log.groupStart();

   let cached;
   let success = false;
   for (const trans of client.rankTranscodings(track)) {
      try {
         cached = await downloadTranscoding(trans, track);
         success = true;
         break;
      } catch (e) {
         Log.warn(`Failed:`);
         Log.groupStart();
         Log.error(e);
         Log.groupEnd();
      }
   }

   if (!success) {
      Log.error("Failed to download track!");
   }

   const outmeta = `${outdir}/track.json`;
   if (!fs.existsSync(outmeta)) {
      util.write(outmeta, util.dump(track));
   }

   if (track.artwork_url) {
      await downloadArt(track.artwork_url, `${outdir}/artwork.jpg`);
   }
   Log.groupEnd();

   if (success) {
      if (cached) {
         return "cached"
      } else {
         return "downloaded";
      }
   }

   return "failure";
}

/**
 * @returns true if the file was cached.
 * @throws If there was an error downloading that transcoding
 */
async function downloadTranscoding(trans: sc.Transcoding, track: sc.Track): Promise<boolean> {
   if (trans.preset === "aac_256k") {
      Log.info(`${colors.purple}G${colors.magenta}o${colors.orange}+${colors.reset} Activated!`);
   }

   const ext = util.codecName(trans.preset);
   const outfile = `archive/tracks/${track.id}/${trans.preset}.${ext}`;

   if (fs.existsSync(outfile)) {
      Log.info(`${colors.grey}Already present at ${outfile}${colors.reset}`);
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

async function downloadArt(artworkUrl: string, outart: string): Promise<void> {
   if (!fs.existsSync(outart)){
      Log.info("Fetching album art");
      Log.groupStart();
      try {
         util.write(outart, await client.fetchArtwork(artworkUrl));
      } catch (e) {
         Log.error(e);
      }
      Log.groupEnd();
   }
}
