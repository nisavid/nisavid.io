import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, beforeEach, mock, test } from "node:test";
import { gzipSync } from "node:zlib";

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
// A 400 alone is insufficient: the vulnerable parser still reaches this wrapper
// before Firebase rejects the request's content type.
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

http("contact-form-parser-test", callable);
const server = getTestServer("contact-form-parser-test");
let url;
const environment = {
  CONTACT_RATE_LIMIT_SECRET: "parser-test-quota-secret-32-characters",
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

const deepForm = `data${"[nested]".repeat(2000)}=value`;
for (const [name, body, headers] of [
  ["33 nested objects", `data${"[nested]".repeat(33)}=value`, {}],
  ["deeply nested objects", deepForm, {}],
  ["percent-encoded brackets", encodeURI(deepForm), {}],
  ["nested array indexes", `data${"[0]".repeat(2000)}=value`, {}],
  ["compressed nesting", gzipSync(deepForm), { "Content-Encoding": "gzip" }],
]) {
  test(`rejects ${name} before the callable wrapper`, async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    await response.text();
    assert.equal(response.status, 400);
    assert.equal(callable.mock.callCount(), 0);
    assert.equal(verifyToken.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
  });
}

test("keeps bounded form parsing and callable content-type rejection", async () => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data${"[nested]".repeat(32)}=value`,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.status, "INVALID_ARGUMENT");
  assert.equal(callable.mock.callCount(), 1);
  assert.equal(verifyToken.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
});

for (const token of [undefined, "invalid-test-token"]) {
  test(`rejects JSON with ${token ? "invalid" : "missing"} App Check`, async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Firebase-AppCheck": token } : {}),
      },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.status, "UNAUTHENTICATED");
    assert.equal(callable.mock.callCount(), 1);
    assert.equal(verifyToken.mock.callCount(), token ? 1 : 0);
    assert.equal(send.mock.callCount(), 0);
    assert.equal(transaction.mock.callCount(), 0);
  });
}

test("preserves a valid JSON contact request and consumes its App Check token", async () => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Firebase-AppCheck": "test-app-check-token",
      "X-Forwarded-For": "8.8.8.8",
      Origin: "https://nisavid.io",
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: null });
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://nisavid.io",
  );
  assert.equal(callable.mock.callCount(), 1);
  assert.equal(verifyToken.mock.callCount(), 1);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(transaction.mock.callCount(), 1);
  assert.deepEqual(send.mock.calls[0].arguments, [
    {
      from: { name: data.name, email: environment.SENDER },
      to: [{ email: environment.TO }],
      headers: { "Reply-To": `${data.name} <${data.email}>` },
      subject: data.subject,
      text: data.body,
    },
  ]);
});

test("preserves browser CORS preflight", async () => {
  const response = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: "https://nisavid.io",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-firebase-appcheck",
    },
    signal: AbortSignal.timeout(5000),
  });
  await response.text();
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://nisavid.io",
  );
  assert.equal(verifyToken.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
});
