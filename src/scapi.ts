import fs from "fs";

import * as util from "./util";

import {Log} from "./util";
import {config, secrets} from "./config";

export class SoundCloudClient {
   static API_BASE = "https://api-v2.soundcloud.com/" as const;
   static CDN_BASE = "https://i1.sndcdn.com/" as const;
   private static FETCH_CACHE = "tmp/cache"

   /** Priority list of shortenings. Lower is higher priority. */
   private static KNOWN_URL_BASES: [key: string, base: string][] = [
      ["h", "https://"],
      ["0", this.API_BASE],
      ["u", `${this.API_BASE}users/`],
      ["s", `${this.API_BASE}media/soundcloud:tracks:`],
   ];

   constructor() { }

   async m3u8Of(trans: Transcoding): Promise<string> {
      const res: any = await this.cetch(trans.url, "json");
      return this.cetch(res.url, "text");
   }

   static PRESET_RANKING = ["flac", "wav", "aac", "abr", "opus", "mp3"];
   rankTranscodings(track: Track): Transcoding[] {
      /**
       * This is the stream picking logic.
       */
      const lt = (a: Transcoding, b: Transcoding) =>
         (a.quality === "hq" && a.quality !== "hq")
         || (a.preset === "aac_256k" && b.preset !== "aac_256k")
         || (SoundCloudClient.PRESET_RANKING.indexOf(util.codecName(a.preset)) < SoundCloudClient.PRESET_RANKING.indexOf(util.codecName(b.preset)))
         || (!a.is_legacy_transcoding && b.is_legacy_transcoding)
         || (a.format.protocol === "hls" && b.format.protocol !== "hls");
      const sortTranscoding = (a: Transcoding, b: Transcoding) => lt(a, b) ? -1 : lt(b, a) ? 1 : 0;

      return track.media.transcodings.sort(sortTranscoding);
   }

   async *trackLikes(limit = 24) {
      const firstPage = `${SoundCloudClient.API_BASE}users/${secrets.userID}/track_likes?client_id=${secrets.clientID}&limit=${limit}&offset=0`;
      const firstRes: TrackLikesResponse = await this.cetch(firstPage);
      let nextHref = firstRes.next_href;
      while (true) {
         // @ts-expect-error
         const res: TrackLikesResponse = await this.cetch(nextHref, "json");
         yield res;

         if (!res.next_href)
            break;
         if (res.next_href === nextHref)
            break;
         else
            nextHref = res.next_href;
      }
   }

   async fetchArtwork(track: Track): Promise<Buffer> {
      /**
       * Yes, this is cursed but I'm 90% sure this is how the soundcloud client does it.
       */
      const betterUrl = track.artwork_url.replace(/large(?=\.jpg$)/, "t500x500");
      return this.cetch(betterUrl, "binary");
   }

   /** Fetch with deserialization */
   async fetch(url: string, expectedFormat?: null): Promise<any>;
   async fetch(url: string, expectedFormat: "binary"): Promise<Buffer>;
   async fetch(url: string, expectedFormat: "text"): Promise<string>;
   async fetch(url: string, expectedFormat: "json"): Promise<unknown>;
   async fetch(url: string, expectedFormat: null | "binary" | "text" | "json" = null): Promise<unknown> {
      if (typeof url !== "string") {
         throw new TypeError(`url must be type string, was instead type ${typeof url}!`);
      }

      Log.debug("Fetching " + url);
      Log.startGroup();
      const res = await fetch(url, {headers: {Authorization: secrets.authorization}});
      if (!res.ok) {
         throw new Error(`${res.status}: ${res.statusText}`);
      }

      await util.sleep(config.debounceMS);


      const contents = await res.arrayBuffer();
      const buf = Buffer.from(contents)

      let text: string;
      try {
         text = buf.toString("utf8");
      } catch (e) {
         switch (expectedFormat) {
            case null:
            case "binary":
               Log.endGroup();
               return buf;
            case "text":
            case "json":
               Log.endGroup();
               throw e;
         }
      }

      let val: any;
      try {
         val = JSON.parse(text);
      } catch (e) {
         switch (expectedFormat) {
            case "binary":
               Log.debug("utf8 recognized! Are you sure you wanted binary?");
               Log.endGroup();
               return buf;
            case null:
            case "text":
               Log.endGroup();
               return text;
            case "json":
               Log.endGroup();
               throw e;
         }
      }

      switch (expectedFormat) {
         case "binary":
            Log.debug(`json recognized! Are you sure you wanted binary?`);
            Log.endGroup();
            return buf;
         case "text":
            Log.debug(`json recognized! Are you sure you wanted text?`);
            Log.endGroup();
            return text;
         case null:
         case "json":
            Log.endGroup();
            return val;
      }
   }

   /** Fetch with a cache and some deserialization. */
   async cetch(url: string, expectedFormat?: null): Promise<any>;
   async cetch(url: string, expectedFormat: "binary"): Promise<Buffer>;
   async cetch(url: string, expectedFormat: "text"): Promise<string>;
   async cetch(url: string, expectedFormat: "json"): Promise<unknown>;
   async cetch(url: string, expectedFormat: null | "binary" | "text" | "json" = null): Promise<unknown> {
      if (typeof url !== "string") {
         throw new TypeError(`url must be type string, was instead type ${typeof url}!`);
      }

      let cacheFile: string | null = null;
      for (const base of SoundCloudClient.KNOWN_URL_BASES) {
         if (url.startsWith(base[1])) {
            cacheFile = SoundCloudClient.FETCH_CACHE + "/" + base[0] + Buffer.from(url.slice(base[1].length)).toString("base64url");
         }
      }
      if (cacheFile == null) {
         cacheFile = "-" + Buffer.from(url).toString("base64url");
      }

      if (cacheFile.length > 200) {
         // @ts-ignore
         return this.fetch(url, expectedFormat);
      }

      fs.mkdirSync(SoundCloudClient.FETCH_CACHE, {recursive: true});

      cached: {
         let buf: Buffer | null = null;
         // Walk through potential cache files and read the newest one deleting
         // the one before it.
         let prevOldCacheFile: string | null = null;
         let newestMtime: Date | null = null;
         let newestCacheFile: string | null = null;
         for (const base of SoundCloudClient.KNOWN_URL_BASES) {
            if (!url.startsWith(base[1])) continue;
            /**
             * The cult chanted "Don't repeat yourself! Don't repeat yourself!"
             *
             * It echoed across the walls and into your mind.
             *
             * Think. THINK. THINK..
             * You inhale, trying in vain to clear your mind.
             * It's impossible, it's way too loud and they're already closing in on you.
             * "What God do you worship!?", you scream out. The chanting continues.
             * Even in the darkness of the cave, they're now close enough to see.
             * A-a... a person covered from head to toe in cargo pants??
             * Is that even possible? There's no sign of flesh, no sign of a mouth, yet the chanting
             * continues. Oh if only the great cardinal were here. He would know what to do!
             *
             * But it's too late. They have activated the dehydrator. You will not be their first
             * victim.
             *
             * -SILENCE-
             *
             * The chanting stops.
             * Wait no, it hasn't stopped...?
             *
             * It's just extremely low pitched.
             * It's almost like... time is moving slower??
             *
             * You remember what the cardinal said to you:
             * "Accept the holy power of our lord and savior Klipp Borde".
             * It seemed so obvious. It seemed like second nature.
             *
             * You look around, the cult members are hardly moving now.
             *
             * The first command of power: "CTRL+V" ---
             * Your body feels light, you can feel a tingling sensation rise up through your nose
             * and into your sinuses.
             *
             * The second command of power: "CTRL+C"
             * You close your eyes and a single tear rolls down your cheek, hesitating on your chin-
             * before falling unceremoniously to the ground.
             *
             * A geyser was born from the holy matrimony of the power granted to You by Klipp Borde,
             * erupting in a magnificant fashion. One cult member is not so lucky, standing right
             * above it, and is immediately disolved into the spring.
             *
             * Thank you, Klipp Borde! And let your powers reign forevermore!
             */
            const oldCacheFile =
               SoundCloudClient.FETCH_CACHE + "/" + base[0] + Buffer.from(url.slice(base[1].length)).toString("base64url");

            // Delete the one before this one if we can.
            if (prevOldCacheFile != null) {
               try {
                  fs.unlinkSync(prevOldCacheFile);
               } catch (e) { }
            }
            prevOldCacheFile = oldCacheFile;

            // Only read this file if it's newer.
            try {
               const {mtime} = fs.statSync(oldCacheFile);
               if (newestMtime == null || mtime > newestMtime) {
                  buf = fs.readFileSync(oldCacheFile)
                  newestCacheFile = oldCacheFile;
                  newestMtime = mtime;
               }
            } catch (e) {
               continue;
            }
         }

         if (buf == null) {
            break cached;
         }

         Log.debug("Cached " + url);
         Log.startGroup();

         if (newestCacheFile !== cacheFile) {
            fs.writeFileSync(cacheFile, buf);
            Log.debug("Migrated file!");
         }

         let text: string;
         try {
            text = buf.toString("utf8")
         } catch (e) {
            switch (expectedFormat) {
               case null:
               case "binary":
                  Log.endGroup();
                  return buf;
               case "text":
               case "json":
                  Log.warn(`Malformed cache. Expected ${expectedFormat}`);
                  Log.endGroup();
                  break cached;
            }
         }

         let val: any;
         try {
            val = JSON.parse(text);
         } catch (e) {
            switch (expectedFormat) {
               case "binary":
                  Log.debug("utf8 recognized! Are you sure you wanted binary?");
                  Log.endGroup();
                  return buf;
               case null:
               case "text":
                  Log.endGroup();
                  return text;
               case "json":
                  Log.warn(`Malformed cache. Tried to parse JSON:`);

                  Log.startGroup();
                  Log.error(e);
                  Log.endGroup();

                  Log.endGroup();
                  break cached;
            }
         }

         switch (expectedFormat) {
            case "binary":
               Log.debug(`json recognized! Are you sure you wanted binary?`);
               Log.endGroup();
               return buf;
            case "text":
               Log.debug(`json recognized! Are you sure you wanted text?`);
               Log.endGroup();
               return text;
            case null:
            case "json":
               Log.endGroup();
               return val;
         }
      }

      Log.debug("Fetching " + url);
      Log.startGroup();
      const res = await fetch(url, {headers: {Authorization: secrets.authorization}});
      await util.sleep(config.debounceMS);

      const contents = await res.arrayBuffer();
      const buf = Buffer.from(contents)

      let text: string;
      try {
         text = buf.toString("utf8");
      } catch (e) {
         switch (expectedFormat) {
            case null:
            case "binary":
               fs.writeFileSync(cacheFile, buf);
               Log.endGroup();
               return buf;
            case "text":
            case "json":
               Log.endGroup();
               throw e;
         }
      }

      let val: any;
      try {
         val = JSON.parse(text);
      } catch (e) {
         switch (expectedFormat) {
            case "binary":
               fs.writeFileSync(cacheFile, buf);
               Log.debug("utf8 recognized! Are you sure you wanted binary?");
               Log.endGroup();
               return buf;
            case null:
            case "text":
               fs.writeFileSync(cacheFile, text);
               Log.endGroup();
               return text;
            case "json":
               Log.endGroup();
               throw e;
         }
      }

      switch (expectedFormat) {
         case "binary":
            Log.debug(`json recognized! Are you sure you wanted binary?`);
            Log.endGroup();
            return buf;
         case "text":
            Log.debug(`json recognized! Are you sure you wanted text?`);
            Log.endGroup();
            return text;
         case null:
         case "json":
            fs.writeFileSync(cacheFile, util.dump(val));
            Log.endGroup();
            return val;
      }
   }
}

type TrackLikesResponse = {
   collection: TrackLikeObject[];
   next_href: `${typeof SoundCloudClient.API_BASE}users/${number}/track_likes?offset=${string}&limit=${number}`;
   query_urn: unknown;
};

type TrackLikeObject = {
   /**
    * If fetched through trackLikes, this is when you liked the track!
    */
   created_at: EpochString;
   kind: "like" | string,
   track: Track;
};

export type Track = {
   id: number;
   artwork_url: string;
   caption: string | null;
   commentable: boolean;
   comment_count: number;
   created_at: EpochString;
   description: string;
   /**
    * Oh yeah?
    */
   downloadable: boolean;
   download_count: number;
   duration: number;
   full_duration: number;
   media: {
      transcodings: Transcoding[];
   };
   // You know, there are many more but I have just realized that I don't care.
   publisher_metadata: Publisher;
   title: string;
   user: User;
};

type Publisher = {
   artist: string;
   album_title?: string;
};

type User = {
   avatar_url: string;
   /**
    * Username basically.
    */
   permalink: string;
};

export type Transcoding = {
   url: `${typeof SoundCloudClient.API_BASE}media/soundcloud:${number}/${string}/stream/hls`;
   preset: string;
   quality: "hq" | "sq";
   format: {
      protocol: string;
   };
   is_legacy_transcoding: boolean;
};

type EpochString = `${number}-${number}-${number}T${number}:${number}:${number}Z`;
