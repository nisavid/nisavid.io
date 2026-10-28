import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const publicVariables = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
  "FIREBASE_MEASUREMENT_ID",
  "FIREBASE_RECAPTCHA_SITE_KEY",
];

/**
 * Validate production configuration without printing its values.
 * @param {object} env - The deployment environment.
 * @param {string} projectId - The committed Firebase project identifier.
 * @param {number} now - Current time in milliseconds.
 * @returns {string} The Functions dotenv contents.
 */
export function firebaseEnvironment(env, projectId, now = Date.now()) {
  for (const name of [
    ...publicVariables,
    "GCP_WORKLOAD_IDENTITY_PROVIDER",
    "GCP_DEPLOY_SERVICE_ACCOUNT",
    "FIREBASE_FUNCTIONS_SENDER",
    "FIREBASE_FUNCTIONS_TO",
  ]) {
    if (!env[name]?.trim() || /[\r\n]/u.test(env[name])) {
      throw new Error(`${name} must be configured as a nonempty, single line.`);
    }
  }
  if (env.FIREBASE_PROJECT_ID !== projectId) {
    throw new Error("FIREBASE_PROJECT_ID must match .firebaserc.");
  }
  for (const name of ["FIREBASE_FUNCTIONS_SENDER", "FIREBASE_FUNCTIONS_TO"]) {
    if (!/^[^\s@"\\]+@[^\s@"\\]+$/u.test(env[name])) {
      throw new Error(`${name} must contain a single email address.`);
    }
  }
  const diagnosticUntil =
    env.FIREBASE_FUNCTIONS_APP_CHECK_DIAGNOSTICS_UNTIL ?? "";
  if (diagnosticUntil !== "") {
    const deadline = Date.parse(diagnosticUntil);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(diagnosticUntil) ||
      !Number.isFinite(deadline) ||
      new Date(deadline).toISOString() !== diagnosticUntil ||
      deadline > now + 60 * 60 * 1000
    ) {
      throw new Error(
        "FIREBASE_FUNCTIONS_APP_CHECK_DIAGNOSTICS_UNTIL must be a canonical UTC ISO timestamp at most one hour ahead.",
      );
    }
  }
  return [
    `SENDER=${JSON.stringify(env.FIREBASE_FUNCTIONS_SENDER)}`,
    `TO=${JSON.stringify(env.FIREBASE_FUNCTIONS_TO)}`,
    `CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL=${JSON.stringify(diagnosticUntil)}`,
    "",
  ].join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { projects } = JSON.parse(
    readFileSync(new URL("../../.firebaserc", import.meta.url), "utf8"),
  );
  const contents = firebaseEnvironment(process.env, projects.default);
  if (process.argv.includes("--write-functions-env")) {
    writeFileSync(
      new URL(`../../functions/.env.${projects.default}`, import.meta.url),
      contents,
      { mode: 0o600 },
    );
  }
}
