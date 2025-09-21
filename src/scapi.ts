import fs from "fs";

import * as util from "./util";
import {ConfigFile} from "../config";

export class SoundCloudClient {
   static API_BASE = "https://api-v2.soundcloud.com/";
   static FETCH_CACHE = "cache"

   constructor (
      public Authorization: string,
      public client_id: string,
      public userID: string,
      public config: ConfigFile,
   ) {}

   async *trackLikes(limit = 24) {
      let nextHref = `${SoundCloudClient.API_BASE}users/${this.userID}/track_likes?client_id=${this.client_id}&limit=${limit}&offset=0`;
      while (true) {
         const res = await this.fetch(nextHref, "json");
         yield res;
         if (res.next_href) {
            nextHref = res.next_href;
         }
      }
   }

   /**
    * Fetch with a cache and some deserialization.
    */
   async fetch(url: string, expectedFormat: null):                                     Promise<any>;
   async fetch(url: string, expectedFormat: "binary"):                                 Promise<Buffer>;
   async fetch(url: string, expectedFormat: "text"):                                   Promise<string>;
   async fetch(url: string, expectedFormat: "json"):                                   Promise<any>;
   async fetch(url: string, expectedFormat: null | "binary" | "text" | "json" = null): Promise<any> {
      if (!url.startsWith(SoundCloudClient.API_BASE)) {
         throw new Error("Cannot cetch this url!")
      }

      const endpoint = url.slice(SoundCloudClient.API_BASE.length);
      const cacheFile = SoundCloudClient.FETCH_CACHE + "/" + Buffer.from(endpoint).toString("base64url");

      cached: {
         let buf: Buffer;
         try {
            buf = fs.readFileSync(cacheFile);
            util.Log.info("Cached " + endpoint);
         } catch (e) {
            break cached;
         }

         util.Log.startGroup();
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

      util.Log.info("Fetching " + endpoint);
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
