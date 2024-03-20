/**
 * Firebase analytics.
 * @see {@link https://firebase.google.com/docs/analytics/get-started?platform=web | Firebase · Get started with Google Analytics}
 */

import { getAnalytics, logEvent } from "firebase/analytics";

import { Shift } from "../types.js";
import app from "./app.js";

/**
 * Firebase analytics.
 */
const analytics = process.env.NODE_ENV === "production"
  ? getAnalytics(app)
  : null;
export default analytics;

/**
 * Log an analytics event.
 * @param args - Event arguments.
 */
function logEvent_(...args: Shift<Parameters<typeof logEvent>>) {
  if (analytics) {
    logEvent(analytics, ...args);
  } else {
    console.log("Analytics event:", ...args);
  }
}
export { logEvent_ as logEvent };
