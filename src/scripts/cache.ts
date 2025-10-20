import fs from "fs";

function clear_all() {
   fs.rmSync("tmp/cache", {recursive: true, force: true});
}

function clear_m3u8() {
   for (const cacheFile of fs.readdirSync("tmp/cache")) {
      if (cacheFile[0] === "s") {
         fs.unlinkSync(`tmp/cache/${cacheFile}`);
      }
   }
   fs.rmSync("tmp/m3u8", {recursive: true, force: true});
}

switch (process.argv[2]) {
case "clear_all":
   clear_all();
   break;
case "clear_m3u8":
   clear_m3u8();
   break;
}
