import { createHmac } from "node:crypto";

import type { CallableRequest } from "firebase-functions/v2/https";
import * as Logger from "firebase-functions/logger";

/**
 * Create a temporary, bounded observer of SDK-normalized App Check state.
 * This does not observe the raw verification response or verify another token.
 * @returns {Function} An observer that never changes the callable's result.
 */
export function createAppCheckDiagnostics() {
  const configuredUntil = process.env.CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL ?? "";
  const startedAt = Date.now();
  const deadline = Date.parse(configuredUntil);
  const enabled =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(configuredUntil) &&
    Number.isFinite(deadline) &&
    new Date(deadline).toISOString() === configuredUntil &&
    deadline > startedAt &&
    deadline - startedAt <= 60 * 60 * 1000;
  let attempts = 0;

  return (
    request: CallableRequest<unknown>,
    readSecret: () => string,
  ): void => {
    if (!enabled || attempts >= 20) return;
    try {
      const now = Date.now();
      if (now < startedAt || now >= deadline) return;
      const data = request.data;
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        !("subject" in data) ||
        data.subject !== null ||
        !request.app
      ) {
        return;
      }
      const token = request.rawRequest.get("X-Firebase-AppCheck");
      if (
        typeof token !== "string" ||
        token.length === 0 ||
        token.length > 8192
      ) {
        return;
      }

      // Bound attempts even if reading the secret or writing a log fails.
      attempts++;
      const secret = readSecret();
      if (typeof secret !== "string" || secret.length < 32) return;
      const tokenTag = createHmac("sha256", secret)
        .update("contact-app-check-diagnostic:v1\0")
        .update(new Date(deadline).toISOString())
        .update("\0")
        .update(token)
        .digest("hex");
      const present = Object.prototype.hasOwnProperty.call(
        request.app,
        "alreadyConsumed",
      );
      const consumed: unknown = request.app.alreadyConsumed;
      Logger.info("[DEBUG-app-check-replay]", {
        tokenTag,
        alreadyConsumedPresent: present,
        alreadyConsumedType: typeof consumed,
        ...(typeof consumed === "boolean" ? { alreadyConsumed: consumed } : {}),
      });
    } catch {
      // Diagnostics must neither change acceptance nor emit private errors.
    }
  };
}
