import fs from "fs";
import * as util from "./util";

export class SoundCloudClient {
   static API_BASE = "https://api-v2.soundcloud.com/";
   static FETCH_CACHE = "cache"

   constructor (
      public Authorization: string,
      public client_id: string,
      public userID: string,
   ) {}

   async *trackLikes(limit = 24) {
      let nextHref = `${SoundCloudClient.API_BASE}users/${this.userID}/track_likes?client_id=${this.client_id}&limit=${limit}&offset=0`;
      while (true) {
         const res = await this.fetch(nextHref);
         yield res;
         if (res.next_href) {
            nextHref = res.next_href;
         }
      }
   }

   /**
    * Fetch with a cache
    */
   async fetch(url: string): Promise<any> {
      if (!url.startsWith(SoundCloudClient.API_BASE)) {
         throw new Error("Cannot cetch this url!")
      }

      const endpoint = url.slice(SoundCloudClient.API_BASE.length);
      const cacheFile = SoundCloudClient.FETCH_CACHE + "/" + Buffer.from(endpoint).toString("base64url");

      cached: {
         let buf: Buffer;
         try {
            buf = fs.readFileSync(cacheFile);
         } catch (e) {
            break cached;
         }

         let text: string;
         try {
            text = buf.toString("utf8")
         } catch (e) {
            return buf;
         }

         try {
            return JSON.parse(text);
         } catch (e) {
            return text;
         }
      }

      const res = await fetch(url, {headers: {Authorization: this.Authorization}});
      await util.sleep(333);

      let text: string;
      try {
         text = await res.text();
      } catch (e) {
         // let's just ignore this and store it as binary
         const contents = await res.arrayBuffer();
         const buf = Buffer.from(contents)
         fs.writeFileSync(cacheFile, buf);
         return buf;
      }

      let value: any;
      try {
         value = JSON.parse(text);
      } catch (e) {
         // it was just text and not json
         fs.writeFileSync(cacheFile, text);
         return text;
      }

      fs.writeFileSync(cacheFile, util.dump(value));
      return value;
   }
}
