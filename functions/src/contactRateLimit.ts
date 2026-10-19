import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, Request } from "firebase-functions/v2/https";
import * as Logger from "firebase-functions/logger";
import * as ipaddr from "ipaddr.js";

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const networkLimit = 5;
const globalLimit = 50;

interface Reservation {
  at: number;
  network: string;
}

/**
 * Identify the upstream network at the Google-managed callable ingress.
 * @param request - The request after Google's forwarding proxy.
 * @returns A canonical IPv4 address or IPv6 /64 network.
 */
function callerNetwork(request: Request): string {
  // Firebase's local runtime forwards over a Unix socket, without Google's
  // headers or a TCP peer. Share one local budget, still using transactions.
  // These are server environment flags, never request-controlled inputs.
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("Missing Firestore emulator");
    }
    return "emulator";
  }

  const header = request.headers["x-forwarded-for"];
  if (typeof header !== "string") throw new Error("Missing forwarding header");

  // Never use Express's req.ip: Functions Framework trusts every proxy, so
  // the leftmost value can be supplied by a caller. Cloud Run can append its
  // fixed internal sentinel after the observed upstream IP. Skip only that
  // exact sentinel, never an arbitrary number of caller-supplied hops.
  const hops = header.split(",").map((hop) => hop.trim());
  let selected = hops.pop();
  if (selected === "169.254.1.1") selected = hops.pop();
  if (!selected || !isIP(selected) || selected.includes("%")) {
    throw new Error("Invalid upstream IP");
  }

  const address = ipaddr.process(selected);
  if (address.range() !== "unicast") throw new Error("Non-public upstream IP");

  // IPv4-mapped IPv6 has already been converted by process(). Group native
  // IPv6 privacy addresses by /64 so rotating interface IDs cannot reset quota.
  return address.kind() === "ipv4"
    ? address.toString()
    : `${Buffer.from(address.toByteArray().slice(0, 8)).toString("hex")}/64`;
}

/**
 * Validate stored security state before using it to admit a send.
 * @param value - A stored reservation.
 * @returns Whether the reservation has the expected shape.
 */
function isReservation(value: unknown): value is Reservation {
  return (
    typeof value === "object" &&
    value !== null &&
    "at" in value &&
    typeof value.at === "number" &&
    Number.isSafeInteger(value.at) &&
    value.at >= 0 &&
    "network" in value &&
    typeof value.network === "string" &&
    /^[0-9a-f]{64}$/.test(value.network)
  );
}

/**
 * Reserve one contact email attempt atomically across all function instances.
 * @param request - The callable's raw HTTP request.
 * @param secret - The dedicated HMAC secret shared by all instances.
 */
export async function reserveContactEmail(
  request: Request,
  secret: string,
): Promise<void> {
  try {
    if (secret.length < 32) throw new Error("Missing quota secret");
    const network = createHmac("sha256", secret)
      .update(callerNetwork(request))
      .digest("hex");
    const db = getFirestore("contact-form");
    const budget = db.doc("contactEmailLimits/budget");

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(budget);
      // Firestore's read time avoids caller clocks and cross-instance skew.
      // Recalculate it on every transaction retry, not before the transaction.
      const now = Math.floor(snapshot.readTime.toMillis());
      const stored: unknown = snapshot.exists
        ? snapshot.get("reservations")
        : [];
      if (
        !Number.isSafeInteger(now) ||
        now < 0 ||
        !Array.isArray(stored) ||
        stored.length > globalLimit ||
        !stored.every(isReservation) ||
        stored.some((entry) => entry.at > now)
      ) {
        throw new Error("Invalid quota state");
      }

      const reservations = stored.filter((entry) => entry.at > now - day);
      const recent = reservations.filter(
        (entry) => entry.network === network && entry.at > now - hour,
      );
      if (reservations.length >= globalLimit || recent.length >= networkLimit) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many contact messages. Please try again later.",
        );
      }

      // One bounded document also caps storage growth from rotating sources.
      // Never send inside the callback: Firestore may run it more than once.
      transaction.set(budget, {
        reservations: [...reservations, { at: now, network }],
      });
    });
  } catch (error) {
    if (error instanceof HttpsError && error.code === "resource-exhausted") {
      Logger.warn("Contact email quota exhausted");
      throw error;
    }
    Logger.error("Contact email quota unavailable");
    throw new HttpsError(
      "unavailable",
      "Contact messages are temporarily unavailable. Please try again later.",
    );
  }
}
