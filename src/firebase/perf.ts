/**
 * Firebase Performance Monitoring.
 * @see {@link https://firebase.google.com/docs/perf-mon/get-started-web | Firebase · Get started with Performance Monitoring}
 */

import { getPerformance } from "firebase/performance";

import app from "./app.js";

/**
 * Firebase Performance Monitoring.
 */
export default process.env.NODE_ENV === "production"
  ? getPerformance(app)
  : null;
