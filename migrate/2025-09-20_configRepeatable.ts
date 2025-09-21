/**************************************************************************************************
New Version:               0.0.2
Last Compatible Commit:    4e1963b69ad5b9e5cd9c2aa39b56f1d120dd89d2
Last Compatible Version:   0.0.1
Rollbackable:              No

Reason:
   SoundCloudClient#fetch base64 encodes the URL to create a friendly filename when it caches
   response data. I didn't want filenames to get too long so it first checks to see if the url that
   it's fetching starts with "https://api-v2.soundcloud.com/" as all requests currently start with
   that. Then it slices that off the URL before base64 encoding it.

   The problem is that I now want to support other URL bases, and this current scheme cannot
   accomodate that.

   This new scheme will have a set of append-only known base URLs, such as
   - https://api-v2.soundcloud.com/
   - https://i1.sndcdn.com/
   which will be used to still shorten the base64 filename, starting with -, for no match found.
   All filenames starting with 0 will be for https://api-v2.soundcloud.com/
***************************************************************************************************/
import fs from "fs";

for (let filename of fs.readdirSync("cache")) {
   fs.renameSync("cache/" + filename, "cache/0" + filename);
}
