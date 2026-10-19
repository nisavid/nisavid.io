import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { after, before, beforeEach, mock, test } from "node:test";

import { http } from "@google-cloud/functions-framework";
import { getTestServer } from "@google-cloud/functions-framework/testing";
import { getAppCheck } from "firebase-admin/app-check";
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
const verifyToken = mock.method(getAppCheck(), "verifyToken", async () => ({
  appId: "test-app",
  token: {},
  alreadyConsumed: false,
}));
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
 * @param {unknown} body - The callable envelope.
 * @param {string|null} token - The mock App Check token, or null to omit it.
 * @returns {Promise<Response>} The HTTP response.
 */
async function request(body, token = "test-app-check-token") {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Firebase-AppCheck": token } : {}),
    },
    body: JSON.stringify(body),
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
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
    assert.equal(send.mock.callCount(), 0);
    assert.equal(
      entries.filter((entry) => entry.severity === "INFO").length,
      0,
    );
    assertNoInjectedMetadata();
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
  assertNoInjectedMetadata();
});

test("rejects null callable data without application logging or mail", async () => {
  const response = await request({ data: null });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
  assert.equal(send.mock.callCount(), 0);
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
    assert.ok(entries.some((entry) => entry.severity === "ERROR"));
    assertNoInjectedMetadata();
  });
}

test("SDK rejection of a typed object in an unused field cannot inject metadata", async () => {
  const response = await request({
    data: { ...data, extra: { "@type": "unknown", ...metadata } },
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.status, "INTERNAL");
  assert.equal(send.mock.callCount(), 0);
  assertNoInjectedMetadata();
});

test("SDK rejects a missing data envelope without injecting pre-auth metadata", async () => {
  const response = await request(metadata, null);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
  assert.equal(verifyToken.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
  assert.ok(entries.some((entry) => entry.severity === "WARNING"));
  assertNoInjectedMetadata();
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
    assert.equal(send.mock.calls[0].arguments[0].subject, subject);
    const applicationLogs = entries.filter(
      (entry) => entry.severity === "INFO",
    );
    assert.equal(applicationLogs.length, 2);
    for (const entry of applicationLogs) {
      assert.deepEqual(Object.keys(entry).sort(), ["message", "severity"]);
      assert.ok(entry.message.includes(subject));
    }
    assertNoInjectedMetadata();
  });
}

test("preserves mail delivery errors without logging successful delivery", async () => {
  send.mock.mockImplementationOnce(async () => {
    throw new Error("Test mail provider failure");
  });
  const response = await request({ data });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.status, "UNKNOWN");
  assert.equal(send.mock.callCount(), 1);
  const applicationLogs = entries.filter((entry) => entry.severity === "INFO");
  assert.equal(applicationLogs.length, 1);
  assert.ok(applicationLogs[0].message.startsWith("Received request"));
  assertNoInjectedMetadata();
});
