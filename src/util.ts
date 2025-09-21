import {inspect} from "util";

export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
export const dump = (a: any) => JSON.stringify(a, null, 3);

export const colors = {
   reset: "\x1b[0m",
   red: "\x1b[91m",
   yellow: "\x1b[33m",
   cyan: "\x1b[96m",
   blue: "\x1b[34m",
};

if (!process.stdout.isTTY) {
   for (let color in colors) {
      // @ts-expect-error
      colors[color] = "";
   }
}

/**
 * Horrible utility function.
 *
 * Calls inspect on the object and then prefixes each line with the provided prefix.
 */
function inspectPrefix(v: any, prefix: string): string {
   let msg: string;
   if (typeof v === "string") {
      msg = v;
   } else {
      msg = inspect(v, {colors: process.stdout.isTTY});
   }
   return msg.split("\n").map(line => prefix + " " + line).join("\n") + "\n";
}

export class Log {
   private static indent = 0;
   private static getIndent(): string {
      return " | ".repeat(Log.indent);
   }

   static startGroup() {
      Log.indent++;
   }

   static endGroup() {
      Log.indent--;
      if (Log.indent < 0) {
         Log.indent = 0;
      }
   }

   static info(v: any) {
      process.stderr.write(inspectPrefix(v, colors.blue + "INF" + colors.reset + Log.getIndent()));
   }

   static warn(v: any) {
      process.stderr.write(inspectPrefix(v, colors.yellow + "WRN" + colors.reset + Log.getIndent()));
   }

   static error(v: any) {
      process.stderr.write(inspectPrefix(v, colors.red + "ERR" + colors.reset + Log.getIndent()));
   }
}
