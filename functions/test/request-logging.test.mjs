import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { after, before, beforeEach, mock, test } from "node:test";
import { format } from "node:util";
import { gzipSync } from "node:zlib";

import { http } from "@google-cloud/functions-framework";
import { getTestServer } from "@google-cloud/functions-framework/testing";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";
import { MailtrapClient } from "mailtrap";

import { sendContactFormEmail } from "../lib/index.js";

// Capture serialized output from the real Firebase logger, including SDK errors.
const require = createRequire(import.meta.url);
const { UNPATCHED_CONSOLE } = require(
  join(dirname(require.resolve("firebase-functions/logger")), "common.js"),
);
const entries = [];
for (const level of ["debug", "info", "warn", "error"]) {
  mock.method(UNPATCHED_CONSOLE, level, (line) => {
    entries.push(JSON.parse(line));
  });
}
// Express parser failures precede the callable and use console.error directly.
mock.method(console, "error", (...args) => {
  entries.push({ severity: "ERROR", message: format(...args) });
});
const verifyToken = mock.method(getAppCheck(), "verifyToken", async () => ({
  appId: "test-app",
  token: {},
  alreadyConsumed: false,
}));
// Isolate quota storage while exercising the real callable and logger.
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
const data = {
  name: "Test Sender",
  email: "author@example.com",
  subject: "Contact form test",
  body: "Hello, world!",
};
const metadata = {
  "logging.googleapis.com/trace": "projects/forged/traces/attacker",
  "logging.googleapis.com/labels": { forged: "yes" },
  httpRequest: { status: 200 },
  operation: { id: "forged" },
  sourceLocation: { file: "forged" },
  attackerMarker: "forged",
};
const environment = {
  CONTACT_RATE_LIMIT_SECRET: "logging-test-quota-secret-32-characters",
  MAILTRAP_PASS: "test-mailtrap-token",
  SENDER: "sender@example.com",
  TO: "recipient@example.com",
};
const previousEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
http("contact-form-logging-test", sendContactFormEmail);
const server = getTestServer("contact-form-logging-test");
let url;

before(async () => {
  Object.assign(process.env, environment);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/sendContactFormEmail`;
});

beforeEach(() => {
  entries.length = 0;
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
 * Submit JSON through the real callable HTTP boundary.
 * @param {unknown} body - The callable envelope, or raw malformed JSON bytes.
 * @param {string|null} token - The mock App Check token, or null to omit it.
 * @returns {Promise<Response>} The HTTP response.
 */
async function request(body, token = "test-app-check-token") {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "8.8.8.8",
      ...(Buffer.isBuffer(body) ? { "Content-Encoding": "gzip" } : {}),
      ...(token ? { "X-Firebase-AppCheck": token } : {}),
    },
    body:
      typeof body === "string" || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

/** Assert that caller values never become structured log fields. */
function assertNoInjectedMetadata() {
  for (const entry of entries) {
    for (const [key, value] of Object.entries(metadata)) {
      assert.notDeepEqual(entry[key], value, `injected ${key}`);
    }
  }
}

/**
 * Check all serialized logger output, including SDK diagnostics.
 * @param {string[]} values - Private values that must not enter logs.
 */
function assertNoPrivateData(values = Object.values(data)) {
  const output = JSON.stringify(entries);
  for (const value of [...values, ...Object.values(environment)]) {
    if (value) {
      assert.ok(
        !output.includes(JSON.stringify(value).slice(1, -1)),
        `logged private value: ${value}`,
      );
    }
  }
}

/**
 * Check application events and their shared server-generated correlation ID.
 * @param {string[]} outcomes - Expected lifecycle outcomes.
 * @returns {object[]} The application log entries.
 */
function assertAttemptLogs(outcomes) {
  const logs = entries.filter(
    (entry) =>
      entry.message === "Contact email attempt" ||
      entry.message.startsWith("Error: Contact email attempt\n"),
  );
  assert.deepEqual(
    logs.map((entry) => entry.outcome),
    outcomes,
  );
  for (const entry of logs) {
    assert.match(
      entry.requestId,
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
    );
    assert.equal(entry.requestId, logs[0].requestId);
    assert.deepEqual(
      Object.keys(entry).sort(),
      entry.outcome === "failed"
        ? ["message", "outcome", "reason", "requestId", "severity"]
        : ["message", "outcome", "requestId", "severity"],
    );
    assert.equal(entry.severity, entry.outcome === "failed" ? "ERROR" : "INFO");
  }
  assertNoPrivateData();
  return logs;
}

for (const [name, body] of [
  ["plain malformed", '{"data":{"name":Ada}}'],
  ["compressed malformed", gzipSync('{"data":{"name":Ada}}')],
  ["strict primitive", '"Ada"'],
]) {
  test(`redacts ${name} JSON diagnostics`, async () => {
    const response = await request(body, null);
    assert.equal(response.status, 400);
    await response.text();
    // Express defers its final error logger until after sending the response.
    await new Promise(setImmediate);
    assert.equal(verifyToken.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
    assert.ok(
      entries.some((entry) => entry.message === "Invalid JSON request body."),
    );
    assertNoPrivateData(["Ada"]);
  });
}

for (const [name, subject] of [
  ["plain object", metadata],
  ["nested object", { subject: metadata }],
  ["array", [metadata]],
  ["null", null],
  ["number", 42],
  ["boolean", true],
  ["missing", undefined],
]) {
  test(`rejects ${name} subject before application logs or mail`, async () => {
    const response = await request({ data: { ...data, subject } });
    assertNoInjectedMetadata();
    assertNoPrivateData();
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
    assert.equal(send.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
    assert.equal(
      entries.filter((entry) => entry.severity === "INFO").length,
      0,
    );
    assertNoInjectedMetadata();
    assertNoPrivateData();
  });
}

test("rejects an inherited object subject created by callable decoding", async () => {
  const inherited = JSON.parse(
    JSON.stringify({ ...data, subject: undefined }).slice(0, -1) +
      `,"__proto__":${JSON.stringify({ subject: metadata })}}`,
  );
  const response = await request({ data: inherited });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
  assert.equal(send.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 0);
  assertNoInjectedMetadata();
  assertNoPrivateData();
});

test("rejects null callable data without application logging or mail", async () => {
  const response = await request({ data: null });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
  assert.equal(send.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(entries.filter((entry) => entry.severity === "INFO").length, 0);
});

for (const [name, subject] of [
  ["unknown typed object", { "@type": "unknown", ...metadata }],
  [
    "invalid typed integer",
    {
      "@type": "type.googleapis.com/google.protobuf.Int64Value",
      value: "not-a-number",
      ...metadata,
    },
  ],
  ["typed object in array", [{ "@type": "unknown", ...metadata }]],
]) {
  test(`SDK rejects ${name} without promoting decoder log metadata`, async () => {
    const response = await request({ data: { ...data, subject } });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.status, "INTERNAL");
    assert.equal(send.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
    assert.ok(entries.some((entry) => entry.severity === "ERROR"));
    assertNoInjectedMetadata();
    assertNoPrivateData();
  });
}

test("SDK rejection of a typed object in an unused field cannot inject metadata", async () => {
  const response = await request({
    data: { ...data, extra: { "@type": "unknown", ...metadata, ...data } },
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.status, "INTERNAL");
  assert.equal(send.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 0);
  assertNoInjectedMetadata();
  assertNoPrivateData();
});

test("SDK rejects a missing data envelope without injecting pre-auth metadata", async () => {
  const response = await request({ ...metadata, ...data }, null);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
  assert.equal(verifyToken.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 0);
  assert.ok(entries.some((entry) => entry.severity === "WARNING"));
  assertNoInjectedMetadata();
  assertNoPrivateData();
});

for (const subject of [
  "Hello, 世界",
  "",
  'Hello\r\n{"logging.googleapis.com/labels":{"forged":"yes"}}',
]) {
  test(`preserves string subject ${JSON.stringify(subject)}`, async () => {
    const response = await request({ data: { ...data, subject } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: null });
    assert.equal(send.mock.callCount(), 1);
    assert.equal(transaction.mock.callCount(), 1);
    assert.deepEqual(send.mock.calls[0].arguments, [
      {
        from: { name: data.name, email: environment.SENDER },
        to: [{ email: environment.TO }],
        headers: { "Reply-To": `${data.name} <${data.email}>` },
        subject,
        text: data.body,
      },
    ]);
    assertAttemptLogs(["received", "sent"]);
    assertNoPrivateData(Object.values({ ...data, subject }));
    assertNoInjectedMetadata();
    assertNoPrivateData();
  });
}

test("preserves mail delivery errors without logging successful delivery", async () => {
  send.mock.mockImplementationOnce(async () => {
    throw new Error(
      `Provider failure: ${Object.values(data).join(" ")} ${environment.MAILTRAP_PASS}`,
    );
  });
  const response = await request({ data });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.status, "UNKNOWN");
  assert.equal(send.mock.callCount(), 1);
  assert.equal(transaction.mock.callCount(), 1);
  const logs = assertAttemptLogs(["received", "failed"]);
  assert.equal(logs[1].reason, "delivery");
  assertNoInjectedMetadata();
  assertNoPrivateData();
});

test("SDK rejects private extra envelope keys without logging them", async () => {
  const response = await request({ data, [data.email]: data.body }, null);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
  assert.equal(verifyToken.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 0);
  assertNoPrivateData();
});

test("keeps transport construction failures out of logs", async (t) => {
  const axios = createRequire(require.resolve("mailtrap"))("axios");
  t.mock.method(axios, "create", () => {
    throw new Error(
      `Transport failure: ${Object.values(data).join(" ")} ${environment.MAILTRAP_PASS}`,
    );
  });
  const response = await request({ data });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.status, "UNKNOWN");
  assert.equal(send.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 1);
  const logs = assertAttemptLogs(["received", "failed"]);
  assert.equal(logs[1].reason, "transport");
  assertNoInjectedMetadata();
});

test("preserves the fallback for a falsy delivery rejection", async () => {
  send.mock.mockImplementationOnce(async () => {
    throw null;
  });
  const response = await request({ data });
  assert.equal(response.status, 500);
  assert.deepEqual((await response.json()).error, {
    status: "UNKNOWN",
    message: "Failed to send mail",
  });
  assert.equal(send.mock.callCount(), 1);
  assert.equal(transaction.mock.callCount(), 1);
  const logs = assertAttemptLogs(["received", "failed"]);
  assert.equal(logs[1].reason, "delivery");
});

test("assigns an independent correlation ID to each request", async () => {
  const first = await request({ data });
  assert.equal(first.status, 200);
  await first.json();
  const firstId = assertAttemptLogs(["received", "sent"])[0].requestId;
  entries.length = 0;
  const second = await request({ data });
  assert.equal(second.status, 200);
  await second.json();
  const secondId = assertAttemptLogs(["received", "sent"])[0].requestId;
  assert.notEqual(firstId, secondId);
});
