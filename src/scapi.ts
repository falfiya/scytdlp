import fs from "fs";

import * as util from "./util";

import {Log} from "./util";
import {secrets} from "./config";

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
      ["p", `${this.API_BASE}playlists/`],
   ];

   constructor() { }

   async m3u8Of(trans: Transcoding): Promise<string> {
      const res: any = await this.cetch(trans.url, "json");
      return this.cetch(res.url, "text");
   }

   static PRESET_RANKING = ["flac", "wav", "aac", "abr", "opus", "mp3"];
   rankTranscodings(track: Track): Transcoding[] {
      if (track.media == null) return [];
      if (track.media.transcodings == null) return [];
      if (track.media.transcodings.length < 2) return track.media.transcodings;
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

   async *fetcher<T>(nextHref: string): AsyncGenerator<T, void, unknown> {
      while (nextHref) {
         const res = await this.cetch(nextHref);
         yield res;

         if (!res.next_href)
            break;
         if (res.next_href === nextHref)
            break;
         else
            nextHref = res.next_href;
      }
   }

   async *fetchTrackLikes(limit = 24) {
      const endpoint = `${SoundCloudClient.API_BASE}users/${secrets.userID}/track_likes?client_id=${secrets.clientID}&limit=${limit}&offset=0`;
      for await (const res of this.fetcher<TrackLikesResponse>(endpoint)) {
         yield res.collection;
      }
   }

   async *fetchPlaylistLikes(limit = 12) {
      const now = new Date();
      const endpoint = `${SoundCloudClient.API_BASE}me/library/all?offset=${now.toISOString()},playlists,${68716460 * Math.random() | 0}&limit=${limit}&client_id=${secrets.clientID}`
      for await (const res of this.fetcher<PlaylistLikesResponse>(endpoint)) {
         yield res.collection;
      }
   }

   async *fetchReposts() {
      const endpoint = `${SoundCloudClient.API_BASE}profile/soundcloud:users:${secrets.userID}`;
      for await (const res of this.fetcher<RepostRespones>(endpoint)) {
         yield res.collection;
      }
   }

   async fetchPlaylist(playlistId: number | string): Promise<Playlist> {
      return this.cetch(`${SoundCloudClient.API_BASE}playlists/${playlistId}?client_id=${secrets.clientID}`);
   }

   async fetchTrack(id: number): Promise<Track> {
      // this may seem inefficient and it is for the first time, but the fact is that this gets cached!
      const res: Track[] = await this.cetch(`${SoundCloudClient.API_BASE}tracks?ids=${id}&client_id=${secrets.clientID}`);
      if (res.length === 0) {
         throw new Error(`Could not find track#${id}`);
      }
      if (res.length > 1) {
         Log.warn(`${res.length} values returned from fetchTrack!`);
      }
      return res[0]!;
   }

   async fetchArtwork(artworkUrl: string): Promise<Buffer> {
      /**
       * Yes, this is cursed but I'm 90% sure this is how the soundcloud client does it.
       */
      const betterUrl = artworkUrl.replace(/large(?=\.jpg$)/, "t500x500");
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
      Log.groupStart();
      const res = await fetch(url, {headers: {Authorization: secrets.authorization}});
      if (!res.ok) {
         throw new Error(`${res.status}: ${res.statusText}`);
      }

      await util.debounce();

      const contents = await res.arrayBuffer();
      const buf = Buffer.from(contents)

      let text: string;
      try {
         text = buf.toString("utf8");
      } catch (e) {
         switch (expectedFormat) {
            case null:
            case "binary":
               Log.groupEnd();
               return buf;
            case "text":
            case "json":
               Log.groupEnd();
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
               Log.groupEnd();
               return buf;
            case null:
            case "text":
               Log.groupEnd();
               return text;
            case "json":
               Log.groupEnd();
               throw e;
         }
      }

      switch (expectedFormat) {
         case "binary":
            Log.debug(`json recognized! Are you sure you wanted binary?`);
            Log.groupEnd();
            return buf;
         case "text":
            Log.debug(`json recognized! Are you sure you wanted text?`);
            Log.groupEnd();
            return text;
         case null:
         case "json":
            Log.groupEnd();
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
         cacheFile = SoundCloudClient.FETCH_CACHE + "/" + "-" + Buffer.from(url).toString("base64url");
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
             * The ground splits open and a geyser is born from the power granted to You by Klipp Borde.
             * One cult member is not so lucky, standing right above it.
             * The eruption is instant and mercilessless. It tears through him, rending flesh from cargo pants.
             * He is immediately disolved into the spring.
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
         Log.groupStart();

         if (newestCacheFile !== cacheFile) {
            util.write(cacheFile, buf);
            Log.debug("Migrated file!");
         }

         let text: string;
         try {
            text = buf.toString("utf8")
         } catch (e) {
            switch (expectedFormat) {
               case null:
               case "binary":
                  Log.groupEnd();
                  return buf;
               case "text":
               case "json":
                  Log.warn(`Malformed cache. Expected ${expectedFormat}`);
                  Log.groupEnd();
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
                  Log.groupEnd();
                  return buf;
               case null:
               case "text":
                  Log.groupEnd();
                  return text;
               case "json":
                  Log.warn(`Malformed cache. Tried to parse JSON:`);

                  Log.groupStart();
                  Log.error(e);
                  Log.groupEnd();

                  Log.groupEnd();
                  break cached;
            }
         }

         switch (expectedFormat) {
            case "binary":
               Log.debug(`json recognized! Are you sure you wanted binary?`);
               Log.groupEnd();
               return buf;
            case "text":
               Log.debug(`json recognized! Are you sure you wanted text?`);
               Log.groupEnd();
               return text;
            case null:
            case "json":
               Log.groupEnd();
               return val;
         }
      }

      Log.debug("Fetching " + url);
      Log.groupStart();
      const res = await fetch(url, {headers: {Authorization: secrets.authorization}});
      await util.debounce();

      const contents = await res.arrayBuffer();
      const buf = Buffer.from(contents)

      let text: string;
      try {
         text = buf.toString("utf8");
      } catch (e) {
         switch (expectedFormat) {
            case null:
            case "binary":
               util.write(cacheFile, buf);
               Log.groupEnd();
               return buf;
            case "text":
            case "json":
               Log.groupEnd();
               throw e;
         }
      }

      let val: any;
      try {
         val = JSON.parse(text);
      } catch (e) {
         switch (expectedFormat) {
            case "binary":
               util.write(cacheFile, buf);
               Log.debug("utf8 recognized! Are you sure you wanted binary?");
               Log.groupEnd();
               return buf;
            case null:
            case "text":
               util.write(cacheFile, text);
               Log.groupEnd();
               return text;
            case "json":
               Log.groupEnd();
               throw e;
         }
      }

      switch (expectedFormat) {
         case "binary":
            Log.debug(`json recognized! Are you sure you wanted binary?`);
            Log.groupEnd();
            return buf;
         case "text":
            Log.debug(`json recognized! Are you sure you wanted text?`);
            Log.groupEnd();
            return text;
         case null:
         case "json":
            util.write(cacheFile, util.dump(val));
            Log.groupEnd();
            return val;
      }
   }
}

type TrackLikesResponse = {
   collection: TrackLikeObject[];
   next_href?: `${typeof SoundCloudClient.API_BASE}users/${number}/track_likes?offset=${string}&limit=${number}`;
   query_urn: unknown;
};

export type TrackLikeObject = {
   /**
    * If fetched through trackLikes, this is when you liked the track!
    */
   created_at: EpochString;
   kind: "like" | string;
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

export type PlaylistLikesResponse = {
   collection: (PlaylistLikeObject | PlaylistCreateObject | SystemPlaylistLikeObject)[],
   next_href?: `${typeof SoundCloudClient.API_BASE}me/library/all?offset=`;
}

export type SystemPlaylistLikeObject = {
   created_at: string;
   type: "system-playlist-like";
   /** Your user */
   user: User;
   system_playlist: Playlist;
};

export type PlaylistCreateObject = {
   created_at: string;
   type: "playlist";
   /** Your user */
   user: User;
   playlist: PlaylistNoTracks;
}

export type PlaylistLikeObject = {
   created_at: string;
   type: `playlist-like`;
   user: User;
   playlist: PlaylistNoTracks;
};

export type PlaylistNoTracks = {
   id: number | string;
   artwork_url: string;
   user: User;
   title: string;
};

export type Playlist = {
   artwork_url: string;
   id: number | string;
   user: User;
   title: string;
   tracks: {id: number}[];
};

export type RepostRespones ={
   collection: Repost[];
   next_href: string;
};

export type Repost = TrackRepost | PlaylistRepost | PlaylistCreateObject | TrackCreateObject;

export type TrackRepost = {
   created_at: string;
   type: "track-repost";
   user: User;
   track: Track;
}

export type PlaylistRepost = {
   created_at: string;
   type: `playlist-repost`;
   user: User;
   playlist: PlaylistNoTracks;
};

export type TrackCreateObject = {
   created_at: string;
   type: "track";
   user: User;
   track: Track;
}
