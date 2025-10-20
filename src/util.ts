import fs from "fs";
import path from "path";
import {inspect} from "util";

import {config} from "./config";

export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
export const dump = (a: any) => JSON.stringify(a, null, 3);
export const debounce = () => sleep(config.DEBOUNCE_MS);

export function mkdir(path: string) {
   fs.mkdirSync(path, {recursive: true});
}

export function unlink(path: string) {
   try {
      fs.unlinkSync(path);
   } catch (e) { }
}

export function write(dest: string, data: Parameters<typeof fs.writeFileSync>[1]) {
   const dirname = path.dirname(dest);
   mkdir(dirname);
   fs.writeFileSync(dest, data);
}

export const colors = {
   reset: "\x1b[0m",
   red: "\x1b[91m",
   orange: "\x1b[33m",
   yellow: "\x1b[93m",
   cyan: "\x1b[96m",
   blue: "\x1b[34m",
   purple: "\x1b[35m",
   magenta: "\x1b[95m",
   grey: "\x1b[90m",
   green: "\x1b[32m",
};

if (!process.stdout.isTTY) {
   for (let color in colors) {
      // @ts-expect-error
      colors[color] = "";
   }
}

export class Log {
   private static indent = 0;
   private static getIndent(): string {
      return " | ".repeat(Log.indent);
   }

   /**
    * Horrible utility function.
    *
    * Calls inspect on the object and then prefixes each line with the provided prefix.
    */
   private static inspectPrefix(v: any, prefix: string): string {
      let msg: string;
      if (typeof v === "string") {
         msg = v;
      } else {
         msg = inspect(v, {colors: process.stdout.isTTY});
      }
      return msg.split("\n").map(line => prefix + colors.reset + Log.getIndent() + " " + line).join("\n") + "\n";
   }

   static groupStart() {
      Log.indent++;
   }

   static groupEnd() {
      Log.indent--;
      if (Log.indent < 0) {
         Log.indent = 0;
      }
   }

   static debug(v: any) {
      if (config.LOG_LEVEL < 1) {
         process.stderr.write(Log.inspectPrefix(v, colors.grey + "DBG"));
      }
   }

   static info(v: any) {
      process.stderr.write(Log.inspectPrefix(v, colors.blue + "INF"));
   }

   static warn(v: any) {
      process.stderr.write(Log.inspectPrefix(v, colors.orange + "WRN"));
   }

   static error(v: any) {
      process.stderr.write(Log.inspectPrefix(v, colors.red + "ERR"));
   }
}

export const codecName = (encoding: string) => encoding.replace(/([^_]*)_.*/, "$1");
