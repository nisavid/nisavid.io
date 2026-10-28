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

import { sendContactFormEmail } from "../lib/index.js";
import { reserveContactEmail } from "../lib/contactRateLimit.js";

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const start = 1_800_000_000_000;
const secret = "contact-rate-limit-test-secret-32-characters";
const data = {
  name: "Test Sender",
  email: "author@example.com",
  subject: "Contact form test",
  body: "Hello, world!",
};
const environment = {
  CONTACT_RATE_LIMIT_SECRET: secret,
  MAILTRAP_PASS: "test-mailtrap-token",
  SENDER: "sender@example.com",
  TO: "recipient@example.com",
};
const previousEnvironment = Object.fromEntries(
  [
    ...Object.keys(environment),
    "FUNCTIONS_EMULATOR",
    "FIRESTORE_EMULATOR_HOST",
  ].map((key) => [key, process.env[key]]),
);
let now;
let stored;
let writes;
let tokenId = 0;
const consumed = new Set();
const errors = [];
const require = createRequire(import.meta.url);
const { UNPATCHED_CONSOLE } = require(
  join(dirname(require.resolve("firebase-functions/logger")), "common.js"),
);
mock.method(UNPATCHED_CONSOLE, "error", (line) =>
  errors.push(JSON.parse(line)),
);
const assertQuotaReason = (reason) => {
  const diagnostic = errors.find((entry) =>
    entry.message.startsWith("Error: Contact email quota unavailable"),
  );
  assert.ok(diagnostic);
  assert.deepEqual(Object.keys(diagnostic).sort(), [
    "message",
    "reason",
    "severity",
  ]);
  assert.equal(diagnostic.severity, "ERROR");
  assert.equal(diagnostic.reason, reason);
  assert.equal(
    diagnostic.message.includes("sensitive provider diagnostic"),
    false,
  );
  assert.equal(JSON.stringify(diagnostic).includes("provider metadata"), false);
};

// Deterministic storage for boundary and failure tests. Real Firestore
// contention is exercised separately by the emulator regression test.
const transact = async (callback) => {
  let staged;
  const result = await callback({
    get: async (reference) => {
      assert.equal(reference.path, "contactEmailLimits/budget");
      return {
        exists: stored !== undefined,
        readTime: { toMillis: () => now },
        get: (field) => structuredClone(stored?.[field]),
      };
    },
    set: (reference, value) => {
      assert.equal(reference.path, "contactEmailLimits/budget");
      staged = structuredClone(value);
    },
  });
  if (staged !== undefined) {
    stored = staged;
    writes += 1;
  }
  return result;
};

const transaction = mock.method(
  getFirestore("contact-form"),
  "runTransaction",
  transact,
);
const verifyToken = mock.method(
  getAppCheck(),
  "verifyToken",
  async (token, options) => {
    assert.deepEqual(options, { consume: true });
    if (token === "invalid-token") throw new Error("Invalid test token");
    const alreadyConsumed = consumed.has(token);
    consumed.add(token);
    return { appId: "test-app", token: {}, alreadyConsumed };
  },
);
const sendSuccessfully = async () => ({
  success: true,
  message_ids: ["test-message"],
});
const send = mock.method(MailtrapClient.prototype, "send", sendSuccessfully);

http("contact-rate-limit-test", sendContactFormEmail);
const server = getTestServer("contact-rate-limit-test");
let url;

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/sendContactFormEmail`;
});

beforeEach(() => {
  Object.assign(process.env, environment);
  delete process.env.FUNCTIONS_EMULATOR;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  now = start;
  stored = undefined;
  writes = 0;
  consumed.clear();
  errors.length = 0;
  transaction.mock.resetCalls();
  transaction.mock.mockImplementation(transact);
  verifyToken.mock.resetCalls();
  send.mock.resetCalls();
  send.mock.mockImplementation(sendSuccessfully);
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

const request = (ip = "8.8.8.8") => {
  return {
    headers: ip === undefined ? {} : { "x-forwarded-for": ip },
    socket: { remoteAddress: "1.1.1.1" },
  };
};

const post = async ({
  token = `fresh-token-${++tokenId}`,
  ip = "8.8.8.8",
  payload = data,
} = {}) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://nisavid.io",
      ...(token === null ? {} : { "X-Firebase-AppCheck": token }),
      ...(ip === null ? {} : { "X-Forwarded-For": ip }),
    },
    body: JSON.stringify({ data: payload }),
    signal: AbortSignal.timeout(5000),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
};

const assertError = (response, status, code) => {
  assert.equal(response.status, status);
  assert.equal(response.body.error.status, code);
};

test("preserves a valid callable, CORS, and contact message", async () => {
  const response = await post();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { result: null });
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://nisavid.io",
  );
  assert.equal(verifyToken.mock.callCount(), 1);
  assert.equal(send.mock.callCount(), 1);
  assert.deepEqual(send.mock.calls[0].arguments, [
    {
      from: { name: data.name, email: environment.SENDER },
      to: [{ email: environment.TO }],
      headers: { "Reply-To": `"${data.name}" <${data.email}>` },
      subject: data.subject,
      text: data.body,
    },
  ]);
  assert.deepEqual(Object.keys(stored), ["reservations"]);
  assert.deepEqual(Object.keys(stored.reservations[0]).sort(), [
    "at",
    "network",
  ]);
  assert.equal(stored.reservations[0].at, start);
  assert.match(stored.reservations[0].network, /^[0-9a-f]{64}$/);
  for (const value of ["8.8.8.8", secret, ...Object.values(data)]) {
    assert.equal(JSON.stringify(stored).includes(value), false);
  }
});

test("fresh App Check tokens, changed messages, and spoofed XFF prefixes cannot reset the hourly budget", async () => {
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await post()).status, 200);
  }
  const response = await post({
    ip: "1.1.1.1, 9.9.9.9, 8.8.8.8, 169.254.1.1",
    payload: {
      name: "Another Sender",
      email: "another@example.com",
      subject: "Changed subject",
      body: "Changed body",
    },
  });
  assertError(response, 429, "RESOURCE_EXHAUSTED");
  assert.equal(verifyToken.mock.callCount(), 6);
  assert.equal(send.mock.callCount(), 5);
  assert.equal(writes, 5);
  assert.equal(stored.reservations.length, 5);
  assert.equal((await post({ ip: "1.1.1.1" })).status, 200);
  assert.equal(send.mock.callCount(), 6);
});

test("a consumed App Check token is rejected before reservation or mail", async () => {
  assert.equal((await post({ token: "reuse-me" })).status, 200);
  assertError(await post({ token: "reuse-me" }), 401, "UNAUTHENTICATED");
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(writes, 1);
});

for (const token of [null, "invalid-token"]) {
  test(`rejects ${token === null ? "missing" : "invalid"} App Check before storage or mail`, async () => {
    assertError(await post({ token }), 401, "UNAUTHENTICATED");
    assert.equal(transaction.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
  });
}

test("browser preflight never consumes App Check or a send reservation", async () => {
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
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
});

test("IPv4-mapped IPv6 spellings share the IPv4 quota", async () => {
  for (let index = 0; index < 5; index += 1) {
    await reserveContactEmail(request("8.8.8.8"), secret);
  }
  for (const ip of ["::ffff:8.8.8.8", "::FFFF:0808:0808"]) {
    await assert.rejects(reserveContactEmail(request(ip), secret), {
      code: "resource-exhausted",
    });
  }
  assert.equal(writes, 5);
});

for (const [protocol, addresses] of [
  ["6to4", ["2002:0808:0808::1", "2002:808:808:ffff::2"]],
  [
    "Teredo",
    [
      "2001:0:4136:e378:8000:63bf:f7f7:f7f7",
      "2001:0000:0909:0909:0000:1234:F7F7:F7F7",
    ],
  ],
]) {
  test(`${protocol} clients share the embedded public IPv4 budget across aliases`, async () => {
    assert.equal(
      (await post({ ip: `${addresses[0]}, 169.254.1.1` })).status,
      200,
    );
    for (let index = 0; index < 4; index += 1) {
      assert.equal((await post({ ip: "8.8.8.8" })).status, 200);
    }
    for (const ip of addresses) {
      assertError(await post({ ip }), 429, "RESOURCE_EXHAUSTED");
    }
    assert.equal(send.mock.callCount(), 5);
    assert.equal(
      new Set(stored.reservations.map((item) => item.network)).size,
      1,
    );
    assert.equal((await post({ ip: "1.1.1.1" })).status, 200);
  });
}

test("IPv6 spelling and interface rotation share a /64, while another /64 is allowed", async () => {
  for (let index = 1; index <= 5; index += 1) {
    await reserveContactEmail(request(`2606:4700:4700::${index}`), secret);
  }
  await assert.rejects(
    reserveContactEmail(
      request("2606:4700:4700:0000:FFFF:0000:0000:0001"),
      secret,
    ),
    { code: "resource-exhausted" },
  );
  await reserveContactEmail(request("2606:4700:4700:1::1"), secret);
  assert.equal(writes, 6);
  assert.equal(
    new Set(stored.reservations.map((item) => item.network)).size,
    2,
  );
});

test("the global daily budget caps rotating source networks at 50 sends", async () => {
  for (let index = 1; index <= 50; index += 1) {
    await reserveContactEmail(request(`8.8.8.${index}`), secret);
  }
  assertError(await post({ ip: "1.1.1.1" }), 429, "RESOURCE_EXHAUSTED");
  assert.equal(send.mock.callCount(), 0);
  assert.equal(writes, 50);
  assert.equal(stored.reservations.length, 50);
});

test("the hourly window expires exactly at the Firestore read-time boundary", async () => {
  for (let index = 0; index < 5; index += 1) {
    await reserveContactEmail(request(), secret);
  }
  now = start + hour - 1;
  await assert.rejects(reserveContactEmail(request(), secret), {
    code: "resource-exhausted",
  });
  now += 1;
  await reserveContactEmail(request(), secret);
  assert.equal(writes, 6);
  assert.equal(stored.reservations.at(-1).at, start + hour);
});

test("a network's daily budget preserves other networks and expires at the rolling boundary", async () => {
  for (let index = 0; index < 5; index += 1) {
    await reserveContactEmail(request(), secret);
  }
  now = start + hour;
  for (let index = 0; index < 5; index += 1) {
    await reserveContactEmail(request(), secret);
  }
  now = start + 2 * hour;
  assertError(await post(), 429, "RESOURCE_EXHAUSTED");
  assert.equal((await post({ ip: "1.1.1.1" })).status, 200);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(writes, 11);

  now = start + day - 1;
  assertError(await post(), 429, "RESOURCE_EXHAUSTED");
  now += 1;
  assert.equal((await post()).status, 200);
  assert.equal(send.mock.callCount(), 2);
  assert.equal(stored.reservations.length, 7);
});

test("the daily window expires exactly at its boundary and removes old records", async () => {
  for (let index = 1; index <= 50; index += 1) {
    await reserveContactEmail(request(`8.8.8.${index}`), secret);
  }
  now = start + day - 1;
  await assert.rejects(reserveContactEmail(request("1.1.1.1"), secret), {
    code: "resource-exhausted",
  });
  now += 1;
  await reserveContactEmail(request("1.1.1.1"), secret);
  assert.equal(stored.reservations.length, 1);
  assert.equal(stored.reservations[0].at, start + day);
});

test("failed email delivery retains its reservation", async () => {
  send.mock.mockImplementationOnce(async () => {
    throw new Error("Mail provider unavailable");
  });
  assertError(await post(), 500, "UNKNOWN");
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await post()).status, 200);
  }
  assertError(await post(), 429, "RESOURCE_EXHAUSTED");
  assert.equal(send.mock.callCount(), 5);
  assert.equal(stored.reservations.length, 5);
});

test("a transaction retry uses its new server timestamp and sends only once", async () => {
  transaction.mock.mockImplementation(async (callback) => {
    await transact(callback);
    stored = undefined;
    writes = 0;
    now += 1000;
    return transact(callback);
  });
  assert.equal((await post()).status, 200);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(stored.reservations.length, 1);
  assert.equal(stored.reservations[0].at, start + 1000);
});

test("a Firestore outage fails closed before the mail provider is called", async () => {
  transaction.mock.mockImplementation(async () => {
    throw Object.assign(new Error("sensitive provider diagnostic"), {
      code: { untrusted: "provider metadata" },
    });
  });
  assertError(await post(), 503, "UNAVAILABLE");
  assertQuotaReason("storage");
  assert.equal(send.mock.callCount(), 0);
  assert.equal(writes, 0);
});

const validReservation = { at: start, network: "a".repeat(64) };
for (const [label, state] of [
  ["missing reservations", {}],
  ["non-array reservations", { reservations: {} }],
  ["null record", { reservations: [null] }],
  [
    "fractional timestamp",
    { reservations: [{ ...validReservation, at: 1.5 }] },
  ],
  ["negative timestamp", { reservations: [{ ...validReservation, at: -1 }] }],
  [
    "future timestamp",
    { reservations: [{ ...validReservation, at: start + 1 }] },
  ],
  [
    "unsafe timestamp",
    {
      reservations: [{ ...validReservation, at: Number.MAX_SAFE_INTEGER + 1 }],
    },
  ],
  [
    "invalid network digest",
    { reservations: [{ ...validReservation, network: "8.8.8.8" }] },
  ],
  ["overlong state", { reservations: Array(51).fill(validReservation) }],
]) {
  test(`corrupt quota state (${label}) fails closed`, async () => {
    stored = structuredClone(state);
    assertError(await post(), 503, "UNAVAILABLE");
    assertQuotaReason("state");
    assert.equal(send.mock.callCount(), 0);
    assert.equal(writes, 0);
    assert.deepEqual(stored, state);
  });
}

test("an invalid server read timestamp fails closed", async () => {
  now = Number.NaN;
  assertError(await post(), 503, "UNAVAILABLE");
  assertQuotaReason("state");
  assert.equal(send.mock.callCount(), 0);
  assert.equal(writes, 0);
});

for (const value of [undefined, "", "x".repeat(31)]) {
  test(`a ${value === undefined ? "missing" : `${value.length}-character`} quota secret fails closed`, async () => {
    if (value === undefined) delete process.env.CONTACT_RATE_LIMIT_SECRET;
    else process.env.CONTACT_RATE_LIMIT_SECRET = value;
    assertError(await post(), 503, "UNAVAILABLE");
    assertQuotaReason("configuration");
    assert.equal(transaction.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
  });
}

for (const ip of [
  null,
  "",
  "not-an-ip",
  "8.8.8.8,",
  "8.8.8.8, not-an-ip",
  "8.8.8.8, 10.0.0.1",
  "169.254.1.1",
  "8.8.8.8, 169.254.1.1, 169.254.1.1",
  "127.0.0.1",
  "::1",
  "fe80::1%eth0",
  "ff02::1",
  "2002:0a00:0001::1",
  "2001:0:4136:e378:8000:63bf:80ff:fffe",
]) {
  test(`untrusted forwarding identity ${JSON.stringify(ip)} fails closed`, async () => {
    assertError(await post({ ip }), 503, "UNAVAILABLE");
    assertQuotaReason("identity");
    assert.equal(transaction.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
  });
}

test("a missing forwarding header never falls back to the socket peer", async () => {
  await assert.rejects(
    reserveContactEmail(
      { headers: {}, socket: { remoteAddress: "8.8.8.8" } },
      secret,
    ),
    { code: "unavailable" },
  );
  assert.equal(transaction.mock.callCount(), 0);
});

test("local emulator requests without forwarding headers share an enforced quota", async () => {
  process.env.FUNCTIONS_EMULATOR = "true";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await post({ ip: null })).status, 200);
  }
  assertError(await post({ ip: "1.1.1.1" }), 429, "RESOURCE_EXHAUSTED");
  assert.equal(send.mock.callCount(), 5);
  assert.equal(stored.reservations.length, 5);
});

test("local emulator mode fails closed without the Firestore emulator", async () => {
  process.env.FUNCTIONS_EMULATOR = "true";
  assertError(await post({ ip: null }), 503, "UNAVAILABLE");
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
});

test("local Unix-socket requests reserve quota without a TCP peer", async () => {
  process.env.FUNCTIONS_EMULATOR = "true";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  await reserveContactEmail({ headers: {}, socket: {} }, secret);
  assert.equal(writes, 1);
});
