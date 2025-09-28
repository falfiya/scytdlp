import fs from "fs";
import {Config, Secrets} from "../config";

export const config: Config = JSON.parse(fs.readFileSync("config/config.json", "utf8"));

// TODO: Some sort of verification for the config files.
export const secrets: Secrets = JSON.parse(fs.readFileSync("config/secrets.json", "utf8"));
