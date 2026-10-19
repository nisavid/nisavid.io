import assert from "node:assert/strict";
import test from "node:test";

import { firebaseEnvironment } from "./firebase-env.mjs";

const project = "example-project";
const configuration = {
  FIREBASE_API_KEY: "public-api-key",
  FIREBASE_AUTH_DOMAIN: "example-project.firebaseapp.com",
  FIREBASE_PROJECT_ID: project,
  FIREBASE_STORAGE_BUCKET: "example-project.appspot.com",
  FIREBASE_MESSAGING_SENDER_ID: "123456789",
  FIREBASE_APP_ID: "1:123456789:web:example",
  FIREBASE_MEASUREMENT_ID: "G-EXAMPLE",
  FIREBASE_RECAPTCHA_SITE_KEY: "public-site-key",
  GCP_WORKLOAD_IDENTITY_PROVIDER:
    "projects/123456789/locations/global/workloadIdentityPools/github/providers/github",
  GCP_DEPLOY_SERVICE_ACCOUNT:
    "github-deploy@example-project.iam.gserviceaccount.com",
  FIREBASE_FUNCTIONS_SENDER: "contact@example.com",
  FIREBASE_FUNCTIONS_TO: "owner@example.com",
};

test("writes only the required non-secret Functions parameters", () => {
  assert.equal(
    firebaseEnvironment(configuration, project),
    'SENDER="contact@example.com"\nTO="owner@example.com"\n',
  );
});

test("requires every configuration value before deployment", () => {
  for (const name of Object.keys(configuration)) {
    assert.throws(
      () => firebaseEnvironment({ ...configuration, [name]: " " }, project),
      new RegExp(name),
    );
  }
});

test("rejects deployment to a project other than the committed project", () => {
  assert.throws(
    () =>
      firebaseEnvironment(
        { ...configuration, FIREBASE_PROJECT_ID: "other-project" },
        project,
      ),
    /must match/u,
  );
});

test("rejects multiline configuration and dotenv injection", () => {
  for (const name of Object.keys(configuration)) {
    assert.throws(() =>
      firebaseEnvironment(
        { ...configuration, [name]: "value\nUNEXPECTED=entry" },
        project,
      ),
    );
  }
  assert.throws(() =>
    firebaseEnvironment(
      { ...configuration, FIREBASE_FUNCTIONS_TO: 'owner"@example.com' },
      project,
    ),
  );
});
