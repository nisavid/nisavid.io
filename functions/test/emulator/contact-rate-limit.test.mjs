import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { reserveContactEmail } from "../../lib/contactRateLimit.js";

// This test deletes its budget document. Refuse to touch a real project or
// silently pass when the explicitly requested emulator suite is unavailable.
assert.match(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
assert.equal(process.env.GCLOUD_PROJECT, "demo-contact-rate-limit");

const projectId = "demo-contact-rate-limit";
const app = initializeApp({ projectId });
const db = getFirestore("contact-form");
const budget = db.doc("contactEmailLimits/budget");
const secret = "contact-rate-limit-emulator-secret-32-characters";
const functionsDirectory = fileURLToPath(new URL("../..", import.meta.url));
const limiterUrl = new URL("../../lib/contactRateLimit.js", import.meta.url)
  .href;

beforeEach(async () => {
  await budget.delete();
});

after(async () => {
  await budget.delete();
  await deleteApp(app);
});

const reserve = (ip = "8.8.8.8") => {
  return reserveContactEmail(
    {
      headers: { "x-forwarded-for": ip },
      socket: { remoteAddress: "127.0.0.1" },
    },
    secret,
  );
};

// Each worker owns an independent Firebase app, SDK client and process, as
// separate function instances do. A barrier starts their transactions together.
const workerSource = `
  import { initializeApp, deleteApp } from "firebase-admin/app";
  import { reserveContactEmail } from ${JSON.stringify(limiterUrl)};
  const app = initializeApp({ projectId: ${JSON.stringify(projectId)} });
  process.send({ type: "ready" });
  await new Promise((resolve) => process.once("message", resolve));
  let code;
  try {
    await reserveContactEmail({
      headers: { "x-forwarded-for": process.env.CONTACT_TEST_IP },
      socket: { remoteAddress: "127.0.0.1" },
    }, ${JSON.stringify(secret)});
    code = "accepted";
  } catch (error) {
    code = error.code;
  }
  process.send({ type: "result", code });
  await deleteApp(app);
  process.disconnect();
`;

const raceIndependentInstances = async (ips) => {
  const workers = ips.map((ip) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", workerSource],
      {
        cwd: functionsDirectory,
        env: { ...process.env, CONTACT_TEST_IP: ip },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        signal: AbortSignal.timeout(30_000),
      },
    );
    let output = "";
    let code;
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const ready = new Promise((resolve, reject) => {
      child.on("message", (message) => {
        if (message.type === "ready") resolve();
        if (message.type === "result") code = message.code;
      });
      child.once("error", reject);
      child.once("exit", (exitCode) => {
        if (exitCode !== 0)
          reject(new Error(`Worker exited ${exitCode}: ${output}`));
      });
    });
    const result = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode) => {
        if (exitCode === 0 && code) resolve(code);
        else reject(new Error(`Worker exited ${exitCode}: ${output}`));
      });
    });
    return { child, ready, result };
  });
  try {
    await Promise.all(workers.map((worker) => worker.ready));
    for (const worker of workers) worker.child.send("start");
    return await Promise.all(workers.map((worker) => worker.result));
  } finally {
    for (const worker of workers) worker.child.kill();
  }
};

test(
  "independent instances cannot oversubscribe the last network reservation",
  { timeout: 60_000 },
  async () => {
    for (let index = 0; index < 4; index += 1) await reserve();
    const outcomes = await raceIndependentInstances(["8.8.8.8", "8.8.8.8"]);
    assert.deepEqual(outcomes.sort(), ["accepted", "resource-exhausted"]);
    assert.equal((await budget.get()).get("reservations").length, 5);
    await assert.rejects(reserve(), { code: "resource-exhausted" });
  },
);

test(
  "independent instances cannot oversubscribe the last daily network reservation",
  { timeout: 60_000 },
  async () => {
    await reserve();
    const snapshot = await budget.get();
    const network = snapshot.get("reservations")[0].network;
    const now = Math.floor(snapshot.readTime.toMillis());
    await budget.set({
      reservations: Array.from({ length: 9 }, () => ({
        at: now - 2 * 60 * 60 * 1000,
        network,
      })),
    });
    const outcomes = await raceIndependentInstances(["8.8.8.8", "8.8.8.8"]);
    assert.deepEqual(outcomes.sort(), ["accepted", "resource-exhausted"]);
    assert.equal((await budget.get()).get("reservations").length, 10);
    await assert.rejects(reserve(), { code: "resource-exhausted" });
    await reserve("1.1.1.1");
    assert.equal((await budget.get()).get("reservations").length, 11);
  },
);

test(
  "independent instances cannot oversubscribe the last global reservation",
  { timeout: 60_000 },
  async () => {
    for (let index = 1; index <= 49; index += 1)
      await reserve(`8.8.8.${index}`);
    const outcomes = await raceIndependentInstances(["1.1.1.1", "9.9.9.9"]);
    assert.deepEqual(outcomes.sort(), ["accepted", "resource-exhausted"]);
    const reservations = (await budget.get()).get("reservations");
    assert.equal(reservations.length, 50);
    assert.equal(new Set(reservations.map((item) => item.network)).size, 50);
    await assert.rejects(reserve("8.8.4.4"), { code: "resource-exhausted" });
  },
);

test("client requests cannot read or modify the budget document", async () => {
  await reserve();
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/contact-form/documents/contactEmailLimits/budget`;
  for (const method of ["GET", "PATCH"]) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "PATCH" ? { body: JSON.stringify({ fields: {} }) } : {}),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.status, "PERMISSION_DENIED");
  }
  assert.equal((await budget.get()).get("reservations").length, 1);
});
