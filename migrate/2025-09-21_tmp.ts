/**************************************************************************************************
New Version:               0.0.3
Last Compatible Commit:    4fd27684f88d9e54b16b7a1d1d685eae26db974e
Last Compatible Version:   0.0.2
Rollbackable:              Yes

Reason:
   I'd like to centralize all temporary files into one spot. Turns out there's more than just stuff
   from the fetch API.
***************************************************************************************************/
import fs from "fs";

try {
   fs.renameSync("cache", "tmp/cache");
} catch (e) {}
try {
   fs.renameSync("out", "tmp/js");
} catch (e) {}
