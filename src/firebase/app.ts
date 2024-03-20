/**
 * Firebase application.
 * @see {@link https://firebase.google.com/docs/web/setup | Firebase · Add Firebase}
 */

import { initializeApp } from "firebase/app";

import { siteName } from "../config.js";
import config from "./config.js";

/**
 * Firebase application.
 */
export default initializeApp(config, siteName);
