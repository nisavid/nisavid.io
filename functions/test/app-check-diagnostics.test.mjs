import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { after, before, beforeEach, mock, test } from "node:test";

import { http } from "@google-cloud/functions-framework";
import { getTestServer } from "@google-cloud/functions-framework/testing";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";
import { MailtrapClient } from "mailtrap";
import { createAppCheckDiagnostics } from "../lib/appCheckDiagnostics.js";

const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
const secret = "synthetic-diagnostic-quota-secret-at-least-32-characters";
const environment = {
  CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL: until,
  CONTACT_RATE_LIMIT_SECRET: secret,
};
const previousEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
Object.assign(process.env, environment);
// The handler snapshots its finite window at module initialization.
const { sendContactFormEmail } = await import("../lib/index.js");
const require = createRequire(import.meta.url);
const { UNPATCHED_CONSOLE } = require(
  join(dirname(require.resolve("firebase-functions/logger")), "common.js"),
);
const entries = [];
for (const level of ["debug", "info", "warn", "error"]) {
  mock.method(UNPATCHED_CONSOLE, level, (line) =>
    entries.push(JSON.parse(line)),
  );
}
let verification;
const verifyToken = mock.method(
  getAppCheck(),
  "verifyToken",
  async (_, options) => {
    assert.deepEqual(options, { consume: true });
    return verification;
  },
);
const transaction = mock.method(
  getFirestore("contact-form"),
  "runTransaction",
  () => assert.fail("diagnostic reached quota storage"),
);
const send = mock.method(MailtrapClient.prototype, "send", () =>
  assert.fail("diagnostic reached mail transport"),
);
http("app-check-diagnostic-test", sendContactFormEmail);
const server = getTestServer("app-check-diagnostic-test");
let url;
before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/sendContactFormEmail`;
});
beforeEach(() => {
  verification = {
    appId: "private-synthetic-app-id",
    token: { privateClaim: "private-synthetic-decoded-claim" },
    alreadyConsumed: false,
  };
  entries.length = 0;
  verifyToken.mock.resetCalls();
  transaction.mock.resetCalls();
  send.mock.resetCalls();
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  mock.restoreAll();
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});
const data = {
  name: "Private Synthetic Sender",
  email: "private-synthetic@example.com",
  subject: null,
  body: "Private synthetic message text",
};

/**
 * Submit an invalid payload through the real callable wrapper.
 * @param {string} token - Synthetic token verified locally.
 * @returns {Promise<Response>} Callable response.
 */
function post(token) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Firebase-AppCheck": token,
      "X-Forwarded-For": "8.8.8.8",
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(5000),
  });
}

/** @returns {object[]} Serialized diagnostic log entries. */
function diagnostics() {
  return entries.filter(
    (entry) => entry.message === "[DEBUG-app-check-replay]",
  );
}

/**
 * Construct an observer with isolated server configuration and record budget.
 * @param {object} t - Test context for restoring configuration.
 * @param {string} value - Absolute UTC expiry, or empty to disable.
 * @returns {Function} Passive observer.
 */
function observer(t, value = until) {
  const previous = process.env.CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL;
  process.env.CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL = value;
  t.after(() => {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL",
      );
    else process.env.CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL = previous;
  });
  return createAppCheckDiagnostics();
}

/**
 * Build synthetic boundary cases without network access.
 * @param {object} overrides - Request properties to override.
 * @returns {object} Minimal callable request.
 */
function verifiedRequest(overrides = {}) {
  return {
    data,
    app: verification,
    rawRequest: { get: () => "synthetic-token-a" },
    ...overrides,
  };
}

test("real callable correlates identical tokens and rejects consumed replay", async () => {
  const first = await post("synthetic-token-a");
  assert.equal(first.status, 400);
  assert.equal((await first.json()).error.status, "INVALID_ARGUMENT");
  // Preserve the observed failure pattern when the SDK still reports false.
  assert.equal((await post("synthetic-token-a")).status, 400);
  verification = { ...verification, alreadyConsumed: true };
  const replay = await post("synthetic-token-a");
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).error.status, "UNAUTHENTICATED");
  verification = { ...verification, alreadyConsumed: false };
  assert.equal((await post("synthetic-token-b")).status, 400);
  assert.equal(verifyToken.mock.callCount(), 4);
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
  const logs = diagnostics();
  assert.equal(logs.length, 4);
  assert.equal(logs[0].tokenTag, logs[1].tokenTag);
  assert.equal(logs[0].tokenTag, logs[2].tokenTag);
  assert.notEqual(logs[0].tokenTag, logs[3].tokenTag);
  assert.deepEqual(
    logs.map((entry) => entry.alreadyConsumed),
    [false, false, true, false],
  );
  for (const entry of logs) {
    assert.match(entry.tokenTag, /^[0-9a-f]{64}$/);
    assert.equal(entry.alreadyConsumedPresent, true);
    assert.equal(entry.alreadyConsumedType, "boolean");
    assert.deepEqual(Object.keys(entry).sort(), [
      "alreadyConsumed",
      "alreadyConsumedPresent",
      "alreadyConsumedType",
      "message",
      "severity",
      "tokenTag",
    ]);
  }
  const serialized = JSON.stringify(entries);
  for (const value of [
    secret,
    ...Object.values(data).filter(Boolean),
    "synthetic-token-a",
    "synthetic-token-b",
    "private-synthetic-app-id",
    "private-synthetic-decoded-claim",
    "8.8.8.8",
  ]) {
    assert.ok(!serialized.includes(value), "private data entered a log");
  }
});

for (const [name, value] of [
  ["empty", ""],
  ["expired", "2000-01-01T00:00:00.000Z"],
  ["invalid", "enable-until-later"],
  ["non-UTC", "2030-01-01T00:00:00+00:00"],
  ["distant", new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()],
]) {
  test(`${name} configuration does not read the secret or log`, (t) => {
    observer(t, value)(verifiedRequest(), () =>
      assert.fail("secret read while disabled"),
    );
    assert.equal(diagnostics().length, 0);
  });
}

test("an enabled window expires and cannot be extended by environment changes", (t) => {
  const current = Date.now();
  t.mock.method(Date, "now", () => current);
  const observe = observer(t, new Date(current + 1000).toISOString());
  observe(verifiedRequest(), () => secret);
  assert.equal(diagnostics().length, 1);
  Date.now.mock.mockImplementation(() => current + 1000);
  process.env.CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL = new Date(
    current + 60_000,
  ).toISOString();
  observe(verifiedRequest(), () => assert.fail("secret read after expiry"));
  assert.equal(diagnostics().length, 1);
});

test("one observer attempts at most 20 records", (t) => {
  const observe = observer(t);
  const readSecret = t.mock.fn(() => secret);
  for (let i = 0; i < 25; i++) observe(verifiedRequest(), readSecret);
  assert.equal(diagnostics().length, 20);
  assert.equal(readSecret.mock.callCount(), 20);
});

test("only verified null-subject requests with bounded tokens are observed", (t) => {
  const observe = observer(t);
  for (const request of [
    verifiedRequest({ app: undefined }),
    verifiedRequest({ data: null }),
    verifiedRequest({ data: [] }),
    verifiedRequest({ data: { ...data, subject: "ordinary subject" } }),
    verifiedRequest({ rawRequest: { get: () => undefined } }),
    verifiedRequest({ rawRequest: { get: () => "" } }),
    verifiedRequest({ rawRequest: { get: () => "a".repeat(8193) } }),
  ])
    observe(request, () => assert.fail("secret read outside diagnostic scope"));
  assert.equal(diagnostics().length, 0);
});

test("unknown SDK state preserves presence and type without copying values", (t) => {
  const observe = observer(t);
  observe(
    verifiedRequest({ app: { appId: "private-app", token: {} } }),
    () => secret,
  );
  observe(
    verifiedRequest({
      app: { ...verification, alreadyConsumed: { private: "do-not-log" } },
    }),
    () => secret,
  );
  const logs = diagnostics();
  assert.equal(logs[0].alreadyConsumedPresent, false);
  assert.equal(logs[0].alreadyConsumedType, "undefined");
  assert.equal(logs[1].alreadyConsumedPresent, true);
  assert.equal(logs[1].alreadyConsumedType, "object");
  assert.equal(Object.hasOwn(logs[0], "alreadyConsumed"), false);
  assert.equal(Object.hasOwn(logs[1], "alreadyConsumed"), false);
  assert.ok(!JSON.stringify(logs).includes("do-not-log"));
});

test("secret and logger failures cannot escape the observer", (t) => {
  const observe = observer(t);
  observe(verifiedRequest(), () => "");
  assert.doesNotThrow(() =>
    observe(verifiedRequest(), () => {
      throw new Error("private-secret-error");
    }),
  );
  assert.equal(diagnostics().length, 0);
  t.mock.method(UNPATCHED_CONSOLE, "info", () => {
    throw new Error("private-logger-error");
  });
  assert.doesNotThrow(() => observe(verifiedRequest(), () => secret));
  assert.equal(diagnostics().length, 0);
});
