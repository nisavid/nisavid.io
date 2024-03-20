/**
 * Firebase Cloud Functions.
 * @see {@link https://firebase.google.com/docs/functions/callable?gen=2nd#call_the_function | Firebase · Call functions from your app}
 */

import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";

import { Shift } from "../types.js";
import app from "./app.js";
import "./appCheck.js";

/**
 * Firebase Cloud Functions.
 */
const functions = getFunctions(app);
if (process.env.NODE_ENV === "development") {
  connectFunctionsEmulator(functions, "localhost", 5001);
}
export default functions;

// eslint-disable-next-line jsdoc/require-param,jsdoc/require-returns
/**
 * {@inheritDoc httpsCallable}
 */
export function cloudFunction(
  ...args: Shift<Parameters<typeof httpsCallable>>
): ReturnType<typeof httpsCallable> {
  args[1] = {
    limitedUseAppCheckTokens: true,
    ...args[1],
  };
  return httpsCallable(functions, ...args);
}
