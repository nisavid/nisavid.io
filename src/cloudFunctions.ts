/**
 * Cloud functions.
 */

import * as Analytics from "./firebase/analytics.js";

/**
 * Parameters for the `sendContactFormEmail` cloud function.
 */
export interface ContactFormEmailParams {
  /**
   * The name of the sender.
   */
  name: string;

  /**
   * The email address of the sender.
   */
  email: string;

  /**
   * The message subject.
   */
  subject: string;

  /**
   * The message body.
   */
  body: string;
}

/**
 * Call the `sendContactFormEmail` cloud function.
 * @param params - The parameters for the function call.
 */
export function callSendContactFormEmail(
  params: ContactFormEmailParams,
): Promise<void> {
  return new Promise((resolve, reject) => {
    import("./firebase/functions.js").then(
      ({ cloudFunction }) => {
        const sendContactFormEmail = cloudFunction("sendContactFormEmail");
        sendContactFormEmail(params).then(() => {
          Analytics.logEvent("generateLead");
          resolve();
        }).catch((error) => {
          reject(error);
        });
      },
    );
  });
}
