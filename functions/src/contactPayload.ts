import { HttpsError } from "firebase-functions/v2/https";

const limits = { name: 100, email: 254, subject: 150, body: 1000 };

interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  body: string;
}

/**
 * Validate a field without coercing, truncating, or changing accepted content.
 * @param {unknown} value - Untrusted decoded field.
 * @param {number} maximum - The browser's UTF-16 maxlength.
 * @param {boolean} multiline - Whether tabs and line breaks are allowed.
 * @returns {string} The unchanged validated string.
 */
function validateText(
  value: unknown,
  maximum: number,
  multiline = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    value.trim().length === 0 ||
    // At most three UTF-8 bytes per UTF-16 code unit. Keep Unicode UI inputs.
    Buffer.byteLength(value, "utf8") > 3 * maximum
  ) {
    throw new HttpsError("invalid-argument", "Invalid contact field.");
  }

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      (code < 32 && !(multiline && [9, 10, 13].includes(code))) ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      (!multiline && (code === 0x2028 || code === 0x2029))
    ) {
      throw new HttpsError("invalid-argument", "Invalid contact text.");
    }
  }
  return value;
}

/**
 * Validate the decoded callable object before any application side effects.
 * @param {unknown} input - Untrusted callable data, including SDK-decoded objects.
 * @returns {ContactPayload} A fresh object containing only validated primitive strings.
 */
export function validateContactPayload(input: unknown): ContactPayload {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Reflect.ownKeys(input).length !== 4 ||
    !Object.keys(limits).every((field) =>
      Object.prototype.hasOwnProperty.call(input, field),
    )
  ) {
    throw new HttpsError("invalid-argument", "Invalid contact payload.");
  }

  const fields = input as Record<string, unknown>;
  const data = {
    name: validateText(fields.name, limits.name),
    email: validateText(fields.email, limits.email),
    subject: validateText(fields.subject, limits.subject),
    body: validateText(fields.body, limits.body, true),
  };

  // One ASCII mailbox: HTML email syntax plus the client's dotted-domain rule.
  // No whitespace, address lists, display names, comments, or quoted local part.
  const mailbox =
    /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!mailbox.test(data.email)) {
    throw new HttpsError("invalid-argument", "Invalid contact email.");
  }
  return data;
}
