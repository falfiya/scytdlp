import fs from "fs";
import path from "path";
import child_process from "child_process";

import ffmpeg from "@ffmpeg-installer/ffmpeg";

import {Log} from "./util";
import * as util from "./util";
import {secrets} from "./config";

export async function stream(m3u8Path: string, output: string) {
   util.mkdir("tmp/download");
   const filename = path.basename(output);
   const tempDownload = `tmp/download/${filename}`;

   util.unlink(tempDownload);

   Log.debug(`ffmpeg stream ${m3u8Path} -> ${tempDownload}`);
   const stderr: string[] = [];
   const ffmpegProcess = child_process.spawn(ffmpeg.path, [
      // Do not add the headers flag. It does not work.
      "-protocol_whitelist", "file,http,https,tcp,tls",
      "-i", m3u8Path,
      "-c:a", "copy",
      tempDownload,
   ]);
   ffmpegProcess.stderr.setEncoding("utf8");
   ffmpegProcess.stderr.on("data", data => stderr.push(data));
   await new Promise((res, rej) =>
      ffmpegProcess.on("close", code => {
         if (code === 0) {
            res(0);
         } else {
            Log.groupStart();
            Log.error(stderr.join(""));
            Log.groupEnd();
            rej(`Process exited with code ${code}`);
         }
      })
   );

   fs.renameSync(tempDownload, output);
   Log.debug(`${tempDownload} -> ${output}`);
}
