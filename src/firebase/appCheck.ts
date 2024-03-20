/**
 * Firebase App Check.
 * @see {@link https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider | Firebase · Get started using App Check with reCAPTCHA Enterprise}
 */

import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

import app from "./app.js";
import { recaptchaSiteKey } from "./config.js";

if (process.env.NODE_ENV === "development") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
    process.env.FIREBASE_APPCHECK_DEBUG_TOKEN ?? true;
}

/**
 * Firebase App Check initialization options.
 */
const opts = recaptchaSiteKey == null ? null : {
  provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey as string),
  isTokenAutoRefreshEnabled: true,
};

/**
 * Firebase App Check.
 */
export default opts == null ? null : initializeAppCheck(app, opts);
