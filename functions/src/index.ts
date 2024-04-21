import * as Admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as Logger from "firebase-functions/logger";
import * as Params from "firebase-functions/params";

import { Mail, MailtrapClient } from "mailtrap";

Admin.initializeApp();

const mailtrapToken = Params.defineSecret("MAILTRAP_PASS");
const sender = Params.defineString("SENDER");
const to = Params.defineString("TO");

/**
 * Send an email from the contact form.
 * @param name - The sender's name.
 * @param email - The sender's email address.
 * @param subject - The message subject.
 * @param body - The message body.
 */
export const sendContactFormEmail = onCall(
  {
    cors: true,
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    secrets: [mailtrapToken],
  },
  async (request) => {
    Logger.info(
      `Received request to send message from ${request.data.name} <${request.data.email}>:`,
      request.data.subject,
    );

    const client = (() => {
      try {
        return new MailtrapClient({
          token: mailtrapToken.value(),
        });
      } catch (err) {
        if (err) {
          throw new HttpsError("unknown", err.toString(), err);
        } else {
          throw new HttpsError("unknown", "Failed to create mail transport");
        }
      }
    })();

    // RFC 4021 §2.1.2–3 and RFC 822 §4.4.1–2 clearly state that, if `From`
    // and `Sender` are both present, then `From` identifies the author
    // (the agent who composed the message and wishes it to be sent),
    // whereas `Sender` identifies the sender (the authenticated agent
    // responsible for transmitting the message to the receiver).
    // In other words, according to the standards, we should set
    // the `From` address to `request.data.email` and the `Sender` address
    // to `sender.value()`.
    //
    // However, Mailtrap apparently ignores the `Sender` header and rejects
    // the message with an `Unauthorized` response if the `From` address
    // doesn't match the Mailtrap account's sending domain.  That is,
    // it apparently treats the `From` identity as the sender
    // even if a `Sender` is explicitly specified.
    //
    // Therefore, contrary to the standard, we set the `From` address
    // to the sender's address (because Mailtrap demands it) and omit
    // the `Sender` altogether (because Mailtrap ignores it).  In order
    // to ensure that replies are addressed to the author rather than
    // to the sender, we include the author's name and address in `Reply-To`.
    const message: Mail = {
      from: { name: request.data.name, email: sender.value() },
      to: [{ email: to.value() }],
      headers: { "Reply-To": `${request.data.name} <${request.data.email}>` },
      subject: request.data.subject,
      text: request.data.body,
    };

    try {
      await client.send(message);
    } catch (err) {
      if (err) {
        throw new HttpsError("unknown", err.toString(), err);
      } else {
        throw new HttpsError("unknown", "Failed to send mail");
      }
    }

    Logger.info(
      `Sent message from ${request.data.name} <${request.data.email}>:`,
      request.data.subject,
    );
  },
);
