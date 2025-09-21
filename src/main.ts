import fs from "fs";

import wcwidth from "wcwidth";

import {Log} from "./util";
import {SoundCloudClient} from "./scapi";
import * as config from "../config";

// If it wasn't clear, I expect working directory to be the repository root
if (!process.cwd().endsWith("scytdlp")) {
   throw new Error("Checking that I am being run in the repo root!");
}

// TODO: Some sort of verification for the config files.
const secretsFile: config.SecretsFile = JSON.parse(fs.readFileSync("config/secrets.json", "utf8"));
const configFile: config.ConfigFile = JSON.parse(fs.readFileSync("config/config.json", "utf8"));

const client = new SoundCloudClient(
   secretsFile.Authorization,
   secretsFile.client_id,
   secretsFile.userID,
   configFile,
);

const trackLikes = [];
let maxUsername = 0;

for await (const trackLikesResponse of client.trackLikes()) {
   for (const trackLike of trackLikesResponse.collection) {
      trackLikes.push(trackLike);
      const usernameLength = wcwidth(trackLike.track.user.permalink);
      if (usernameLength > maxUsername) {
         maxUsername = usernameLength;
      }
   }
}

trackLikes.sort((a, b) => new Date(a.created_at) < new Date(b.created_at) ? -1 : 1);

Log.info("Likes:")
Log.startGroup();
for (const trackLike of trackLikes) {
   Log.info(`${trackLike.created_at} ${trackLike.track.user.permalink.padStart(maxUsername)} - ${trackLike.track.title}`);
}
