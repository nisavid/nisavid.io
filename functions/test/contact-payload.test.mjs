import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, beforeEach, mock, test } from "node:test";

import { http } from "@google-cloud/functions-framework";
import { getTestServer } from "@google-cloud/functions-framework/testing";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";
import { MailtrapClient } from "mailtrap";

import { sendContactFormEmail } from "../lib/index.js";

const data = {
  name: "Test Sender",
  email: "author@example.com",
  subject: "Contact form test",
  body: "Hello, world!",
};
// Exercise decoding and validation through the exported HTTP callable.
const callable = mock.fn(sendContactFormEmail);
const verifyToken = mock.method(
  getAppCheck(),
  "verifyToken",
  async (token, options) => {
    assert.deepEqual(options, { consume: true });
    if (token !== "test-app-check-token") {
      throw new Error("Invalid test token");
    }
    return { appId: "test-app", token: {}, alreadyConsumed: false };
  },
);
// Keep the parser integration control isolated from real quota storage.
// Dedicated limiter tests exercise reservation state and concurrent admission.
const transaction = mock.method(
  getFirestore("contact-form"),
  "runTransaction",
  async (callback) =>
    callback({
      get: async () => ({
        exists: false,
        readTime: { toMillis: () => 1_800_000_000_000 },
      }),
      set: (reference, value) => {
        assert.equal(reference.path, "contactEmailLimits/budget");
        assert.equal(value.reservations.length, 1);
      },
    }),
);
const send = mock.method(MailtrapClient.prototype, "send", async () => ({
  success: true,
  message_ids: ["test-message"],
}));

http("contact-form-payload-test", callable);
const server = getTestServer("contact-form-payload-test");
let url;
const environment = {
  CONTACT_RATE_LIMIT_SECRET: "payload-test-quota-secret-32-characters",
  MAILTRAP_PASS: "test-mailtrap-token",
  SENDER: "sender@example.com",
  TO: "recipient@example.com",
};
const previousEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);

before(async () => {
  Object.assign(process.env, environment);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/sendContactFormEmail`;
});

beforeEach(() => {
  callable.mock.resetCalls();
  verifyToken.mock.resetCalls();
  send.mock.resetCalls();
  transaction.mock.resetCalls();
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  mock.restoreAll();
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

/**
 * Submit an attested callable payload through the real HTTP stack.
 * @param {unknown} payload - Decoded input to validate.
 * @returns {Promise<Response>} The callable response.
 */
async function post(payload) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Firebase-AppCheck": "test-app-check-token",
      "X-Forwarded-For": "8.8.8.8",
    },
    body: JSON.stringify({ data: payload }),
    signal: AbortSignal.timeout(5000),
  });
}

/**
 * Reject bad data before either the quota store or provider is touched.
 * @param {unknown} payload - Invalid callable data.
 */
async function assertRejected(payload) {
  const response = await post(payload);
  assert.equal(response.status, 400);
  const error = (await response.json()).error;
  assert.equal(error.status, "INVALID_ARGUMENT");
  assert.equal(error.details, undefined);
  assert.equal(verifyToken.mock.callCount(), 1);
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
}

for (const [name, payload] of [
  ["null", null],
  ["array", Object.values(data)],
  ["string", "contact"],
  ["number", 42],
  ["boolean", true],
  ["empty object", {}],
  ["extra field", { ...data, extra: "ignored?" }],
  ["constructor key", { ...data, constructor: "ignored?" }],
  [
    "prototype key",
    JSON.parse(
      JSON.stringify(data).slice(0, -1) + ',"__proto__":{"extra":"inherited"}}',
    ),
  ],
  [
    "inherited fields",
    JSON.parse('{"__proto__":' + JSON.stringify(data) + "}"),
  ],
]) {
  test(`rejects ${name} payload`, () => assertRejected(payload));
}

const limits = { name: 100, email: 254, subject: 150, body: 1000 };
for (const field of Object.keys(limits)) {
  for (const [name, value] of [
    ["missing", undefined],
    ["null", null],
    ["number", 42],
    ["boolean", true],
    ["object", {}],
    ["array", ["text"]],
    [
      "typed integer",
      {
        "@type": "type.googleapis.com/google.protobuf.Int64Value",
        value: "42",
      },
    ],
    ["empty", ""],
    ["blank", " \t\r\n\u2003"],
    ["overlength", "a".repeat(limits[field] + 1)],
    ["multibyte overlength", "界".repeat(limits[field] + 1)],
    ["NUL", "a\u0000b"],
    ["DEL", "a\u007fb"],
    ["C1 control", "a\u0085b"],
    ["lone high surrogate", "a\ud800b"],
    ["lone low surrogate", "a\udc00b"],
  ]) {
    test(`rejects ${name} ${field}`, () =>
      assertRejected({ ...data, [field]: value }));
  }
}

for (const field of ["name", "email", "subject"]) {
  for (const [name, value] of [
    ["CRLF", "a\r\nBcc: injected@example.com"],
    ["bare LF", "a\nb"],
    ["bare CR", "a\rb"],
    ["tab", "a\tb"],
    ["Unicode line separator", "a\u2028b"],
    ["Unicode paragraph separator", "a\u2029b"],
  ]) {
    test(`rejects header ${name} in ${field}`, () =>
      assertRejected({ ...data, [field]: value }));
  }
}

for (const email of [
  ".author@example.com",
  "author.@example.com",
  "author..name@example.com",
  "author",
  "author@localhost",
  "author @example.com",
  "author@example..com",
  "author@example.com,other@example.com",
  "Author <author@example.com>",
  "author@example.com (comment)",
  "author@-example.com",
  "author@example-.com",
  '"author"@example.com',
  "author@例え.テスト",
  "author@example.com\n",
]) {
  test(`rejects malformed mailbox ${JSON.stringify(email)}`, () =>
    assertRejected({ ...data, email }));
}

test("rejects before constructing a transport or emitting application logs", async (t) => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const require = createRequire(import.meta.url);
  const axios = createRequire(require.resolve("mailtrap"))("axios");
  const construct = t.mock.method(axios, "create", () =>
    assert.fail("transport constructed"),
  );
  const { UNPATCHED_CONSOLE } = require(
    join(dirname(require.resolve("firebase-functions/logger")), "common.js"),
  );
  const info = t.mock.method(UNPATCHED_CONSOLE, "info", () =>
    assert.fail("application logged"),
  );
  await assertRejected({ ...data, name: {} });
  assert.equal(construct.mock.callCount(), 0);
  assert.equal(info.mock.callCount(), 0);
});

/**
 * Check valid input reaches the provider with fixed envelope addresses.
 * @param {object} payload - Valid contact data.
 * @param {string} replyTo - Expected serialized Reply-To mailbox.
 */
async function assertAccepted(payload, replyTo) {
  const response = await post(payload);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: null });
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal(send.mock.callCount(), 1);
  assert.deepEqual(send.mock.calls[0].arguments, [
    {
      from: { name: payload.name, email: environment.SENDER },
      to: [{ email: environment.TO }],
      headers: { "Reply-To": replyTo },
      subject: payload.subject,
      text: payload.body,
    },
  ]);
}

test("preserves ordinary mail and multiline body whitespace", () =>
  assertAccepted(
    { ...data, body: "  Hello,\r\n\tworld!\n  " },
    '"Test Sender" <author@example.com>',
  ));

test("accepts all exact UI length boundaries with multibyte Unicode", () => {
  const email =
    "a".repeat(64) +
    "@" +
    "b".repeat(63) +
    "." +
    "c".repeat(63) +
    "." +
    "d".repeat(61);
  assert.equal(email.length, 254);
  const payload = {
    name: "界".repeat(100),
    email,
    subject: "界".repeat(150),
    body: "界".repeat(1000),
  };
  return assertAccepted(payload, `"${payload.name}" <${email}>`);
});

test("preserves astral Unicode within the UI UTF-16 limits", () => {
  const payload = {
    ...data,
    name: "😀".repeat(50),
    subject: "😀".repeat(75),
    body: "😀".repeat(500),
  };
  return assertAccepted(payload, `"${payload.name}" <${payload.email}>`);
});

test("quotes mailbox display-name delimiters and escapes quotes/backslashes", () =>
  assertAccepted(
    { ...data, name: 'Doe, "Jane" \\ <team>' },
    '"Doe, \\"Jane\\" \\\\ <team>" <author@example.com>',
  ));

test("accepts ordinary mailbox punctuation and dotted domain labels", () =>
  assertAccepted(
    { ...data, email: "first.last+tag@sub-domain.example.com" },
    '"Test Sender" <first.last+tag@sub-domain.example.com>',
  ));

for (const length of [65, 100]) {
  test(`rejects a ${length}-byte email local part before quota access`, () =>
    assertRejected({ ...data, email: "a".repeat(length) + "@example.com" }));
}
