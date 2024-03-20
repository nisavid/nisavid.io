import * as Admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as Logger from "firebase-functions/logger";
import * as Params from "firebase-functions/params";

import * as Nodemailer from "nodemailer";
import { MailtrapTransport as mailtrapTransport } from "mailtrap";

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
    cors: ["nisavid.io"],
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    secrets: [mailtrapToken],
  },
  async (request) => {
    const transport = Nodemailer.createTransport(mailtrapTransport({
      token: mailtrapToken.value(),
    }));

    try {
      await transport.verify();
    } catch (err) {
      if (err) {
        throw new HttpsError("failed-precondition", err.toString(), err);
      } else {
        throw new HttpsError(
          "failed-precondition",
          "SMTP transport failed verification",
        );
      }
    }

    const message = {
      sender: sender.value(),
      from: { name: request.data.name, address: request.data.email },
      to: to.value(),
      subject: request.data.subject,
      text: request.data.body,
    };

    try {
      await transport.sendMail(message);
    } catch (err) {
      if (err) {
        throw new HttpsError("unknown", err.toString(), err);
      } else {
        throw new HttpsError("unknown", "Failed to send message");
      }
    }

    Logger.info(
      `Sent message from ${request.data.name} <${request.data.email}>:`,
      request.data.subject,
    );
  },
);
