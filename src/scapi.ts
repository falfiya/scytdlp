import fs from "fs";

import * as util from "./util";
import {ConfigFile} from "../config";

export class SoundCloudClient {
   static API_BASE = "https://api-v2.soundcloud.com/" as const;
   static CDN_BASE = "https://i1.sndcdn.com/" as const;
   private static FETCH_CACHE = "cache"

   /** Priority list of shortenings. Lower is higher priority. */
   private static KNOWN_URL_BASES: [key: string, base: string][] = [
      ["h", "https://"],
      ["0", this.API_BASE],
      ["u", `${this.API_BASE}users/`],
   ];

   constructor (
      public Authorization: string,
      public client_id: string,
      public userID: string,
      public config: ConfigFile,
   ) {}

   async *trackLikes(limit = 24) {
      let nextHref = `${SoundCloudClient.API_BASE}users/${this.userID}/track_likes?client_id=${this.client_id}&limit=${limit}&offset=0`;
      while (true) {
         // @ts-expect-error
         const res: TrackLikesResponse = await this.fetch(nextHref, "json");
         yield res;

         if (!res.next_href)
            break;
         if (res.next_href === nextHref)
            break;
         else
            nextHref = res.next_href;
      }
   }

   /**
    * Fetch with a cache and some deserialization.
    */
   async fetch(url: string, expectedFormat: null):                                     Promise<unknown>;
   async fetch(url: string, expectedFormat: "binary"):                                 Promise<Buffer>;
   async fetch(url: string, expectedFormat: "text"):                                   Promise<string>;
   async fetch(url: string, expectedFormat: "json"):                                   Promise<unknown>;
   async fetch(url: string, expectedFormat: null | "binary" | "text" | "json" = null): Promise<unknown> {
      if (!url.startsWith(SoundCloudClient.API_BASE)) {
         throw new Error("Cannot cetch this url!")
      }

      let cacheFile: string | null = null;
      for (const base of SoundCloudClient.KNOWN_URL_BASES) {
         if (url.startsWith(base[1])) {
            cacheFile = SoundCloudClient.FETCH_CACHE + "/" + base[0] + Buffer.from(url.slice(base[1].length)).toString("base64url");
         }
      }
      if (cacheFile == null) {
         cacheFile = "-" +  Buffer.from(url).toString("base64url");
      }

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
               } catch (e) {}
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

         util.Log.info("Cached " + url);
         util.Log.startGroup();

         if (newestCacheFile !== cacheFile) {
            fs.writeFileSync(cacheFile, buf);
            util.Log.info("Migrated file!");
         }

         let text: string;
         try {
            text = buf.toString("utf8")
         } catch (e) {
            switch (expectedFormat) {
               case null:
               case "binary":
                  util.Log.endGroup();
                  return buf;
               case "text":
               case "json":
                  util.Log.warn(`Malformed cache. Expected ${expectedFormat}`);
                  util.Log.endGroup();
                  break cached;
            }
         }

         let val: any;
         try {
            val = JSON.parse(text);
         } catch (e) {
            switch (expectedFormat) {
               case "binary":
                  util.Log.warn("utf8 recognized! Are you sure you wanted binary?");
                  util.Log.endGroup();
                  return buf;
               case null:
               case "text":
                  util.Log.endGroup();
                  return text;
               case "json":
                  util.Log.warn(`Malformed cache. Tried to parse JSON:`);

                  util.Log.startGroup();
                  util.Log.error(e);
                  util.Log.endGroup();

                  util.Log.endGroup();
                  break cached;
            }
         }

         util.Log.endGroup();
         switch (expectedFormat) {
            case "binary":
               util.Log.warn(`json recognized! Are you sure you wanted binary?`);
               return buf;
            case "text":
               util.Log.warn(`json recognized! Are you sure you wanted text?`);
               return text;
            case null:
            case "json":
               return val;
         }
      }

      util.Log.info("Fetching " + url);
      util.Log.startGroup();
      const res = await fetch(url, {headers: {Authorization: this.Authorization}});
      await util.sleep(this.config.DEBOUNCE_MS);

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
               util.Log.endGroup();
               return buf;
            case "text":
            case "json":
               util.Log.endGroup();
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
               util.Log.warn("utf8 recognized! Are you sure you wanted binary?");
               util.Log.endGroup();
               return buf;
            case null:
            case "text":
               fs.writeFileSync(cacheFile, text);
               util.Log.endGroup();
               return text;
            case "json":
               util.Log.endGroup();
               throw e;
         }
      }

      util.Log.endGroup();
      switch (expectedFormat) {
         case "binary":
            util.Log.warn(`json recognized! Are you sure you wanted binary?`);
            return buf;
         case "text":
            util.Log.warn(`json recognized! Are you sure you wanted text?`);
            return text;
         case null:
         case "json":
            fs.writeFileSync(cacheFile, util.dump(val));
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

type Track = {
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

type EpochString = `${number}-${number}-${number}T${number}:${number}:${number}Z`;
