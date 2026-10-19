# Firebase deployment

`.github/workflows/firebase-deploy.yml` builds and deploys Hosting and Functions
from `main` to the existing Firebase project, `xenon-sentry-395319`. Deployment
is disabled until the repository variable `FIREBASE_DEPLOY_ENABLED` is exactly
`true`. The workflow also supports a manual run from `main` for initial
verification and retries.

Authentication uses GitHub OIDC and Google Workload Identity Federation (WIF)
through a dedicated deployment service account. There is no service-account JSON
key or `FIREBASE_TOKEN` to store. Build and test jobs do not need production
credentials. The production job authenticates after validation succeeds. OIDC
permission applies to that entire job: its source and dependencies must be
trusted even before the authentication step runs. That ordering limits the
credential file's lifetime; it does not isolate earlier steps from OIDC access.

The deployment uses Node.js 22, pnpm 9.15.9, and Firebase CLI 15.34.0. Node.js
20 is scheduled for decommission on **October 30, 2026**, after which Firebase
Functions deployments using it cannot proceed. The old CLI 13.10.2 does not
recognize the Node.js 22 runtime. See the
[runtime support schedule](https://docs.cloud.google.com/functions/docs/runtime-support)
and
[Firebase runtime configuration](https://firebase.google.com/docs/functions/manage-functions#set_nodejs_version).

## 1. Verify the existing Firebase project

Run the setup commands as a Google Cloud administrator in Cloud Shell or a local
authenticated `gcloud` session. These commands configure Google Cloud; they are
not workflow steps. Review existing resources before creating or changing them.

```bash
PROJECT_ID=xenon-sentry-395319
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
DEPLOY_SA_NAME=github-firebase-deploy
DEPLOY_SA="$DEPLOY_SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
POOL_ID=github-firebase-production
PROVIDER_ID=github

gcloud billing projects describe "$PROJECT_ID"
gcloud functions list --v2 --project="$PROJECT_ID" --format='table(name,environment)'
gcloud projects get-iam-policy "$PROJECT_ID"
```

Verify that this is the existing live site's project, that billing is enabled
and Firebase uses the Blaze plan, and that the intended Hosting site and custom
domain are attached to it. Do not create a replacement project or Hosting site.
Record the existing function's region, then inspect its identities and nonsecret
parameters:

```bash
FUNCTIONS_REGION='<existing function region>'
gcloud functions describe sendContactFormEmail \
  --gen2 --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='yaml(name,serviceConfig.serviceAccountEmail,serviceConfig.service,buildConfig.serviceAccount,buildConfig.dockerRepository)'
gcloud functions describe sendContactFormEmail \
  --gen2 --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='yaml(serviceConfig.environmentVariables.SENDER,serviceConfig.environmentVariables.TO)'
gcloud secrets versions list MAILTRAP_PASS --project="$PROJECT_ID" \
  --format='table(name,state)'
```

The latest `MAILTRAP_PASS` version must exist and be enabled. Preserve its value
in Secret Manager; do not copy it to GitHub or Codex Security Cloud. If a value
must be created or rotated, an administrator can use
`firebase functions:secrets:set MAILTRAP_PASS --project xenon-sentry-395319` in
an interactive session. Avoid passing secret values on command lines.

Set these variables to the **observed** account emails and Cloud Run service
name, not assumed defaults:

```bash
RUNTIME_SA='<serviceConfig.serviceAccountEmail>'
BUILD_SA='<actual Cloud Build service account email>'
RUN_SERVICE='<final service-name component of serviceConfig.service>'
```

If `buildConfig.serviceAccount` is absent, inspect the project's default with
`gcloud builds get-default-service-account --project="$PROJECT_ID" --region="$FUNCTIONS_REGION"`
and confirm it against the existing function's build. Strip any
`projects/.../serviceAccounts/` prefix when assigning `BUILD_SA`. The default
build identity varies with project history; it can differ from the legacy
`PROJECT_NUMBER@cloudbuild.gserviceaccount.com` account. The runtime and build
identity can also be the same account. Do not change or remove existing roles
without checking what else uses that account.

Enable deployment prerequisites once as an administrator:

```bash
gcloud services enable \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com \
  firebase.googleapis.com firebasehosting.googleapis.com apikeys.googleapis.com \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com \
  storage.googleapis.com secretmanager.googleapis.com firebaseappcheck.googleapis.com \
  --project="$PROJECT_ID"
```

Verify the existing Cloud Functions, Cloud Run, Cloud Build, Pub/Sub, and
Eventarc service agents and their appropriate service-agent roles. Repair
missing bindings administratively. CI should not receive project IAM
administration permission to provision these bindings. For an existing working
HTTP function, this normally preserves existing configuration. See
[service agents](https://docs.cloud.google.com/iam/docs/create-service-agents).

Inspect the existing Functions Artifact Registry repository's cleanup policy.
CLI 15.34.0 can fail a noninteractive deployment after updating Functions if no
cleanup policy or explicit cleanup opt-out has been configured. An administrator
should configure this once; for example, to retain images for 30 days, run the
following from the repository with the pinned CLI installed and review the
interactive prompt:

```bash
pnpm exec firebase functions:artifacts:setpolicy --project="$PROJECT_ID" \
  --location="$FUNCTIONS_REGION" --days=30
```

Choose retention according to artifact inspection and recovery needs, and
preserve an existing suitable policy. Do not add `--force` to automated deploys
to bypass this setup. See
[deployment artifact cleanup](https://firebase.google.com/docs/functions/manage-functions#clean_up_deployment_artifacts).

## 2. Create the deploy identity and GitHub trust

The following create commands are for new resources. If these names already
exist, inspect their configuration and update deliberately instead of rerunning
creation blindly.

```bash
gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
  --project="$PROJECT_ID" --display-name='GitHub Firebase deployment'
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" --location=global \
  --display-name='nisavid.io production deployment'

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --issuer-uri='https://token.actions.githubusercontent.com' \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.environment=assertion.environment,attribute.workflow_ref=assertion.workflow_ref,attribute.event_name=assertion.event_name' \
  --attribute-condition="assertion.repository_id == '677459876' && assertion.repository_owner_id == '576874' && assertion.ref == 'refs/heads/main' && assertion.environment == 'firebase-production' && assertion.workflow_ref == 'nisavid/nisavid.io/.github/workflows/firebase-deploy.yml@refs/heads/main' && assertion.event_name in ['push', 'workflow_dispatch']"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository_id/677459876"

gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --format='value(name)'
```

Copy the final provider resource name and `DEPLOY_SA` email into the GitHub
environment variables listed below. These identifiers are not secrets. Keep this
pool dedicated to this deployment; another provider in the same pool must not be
able to assert the same mapped repository ID under weaker conditions.

Numeric repository and owner IDs prevent reuse of a deleted or transferred
repository's name from conferring access. The environment, branch, workflow, and
event conditions also exclude pull-request execution. Renaming the workflow or
transferring the repository requires a deliberate trust-policy update.
`roles/iam.workloadIdentityUser` is sufficient for this impersonation path;
service-account key creation and a separate Token Creator grant are unnecessary.

See
[Google's GitHub WIF guide](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines),
[GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc),
and [the authentication action](https://github.com/google-github-actions/auth).

## 3. Grant deployment, runtime, and build permissions separately

Grant the dedicated deployer these project roles:

```bash
for role in \
  roles/firebasehosting.admin \
  roles/serviceusage.apiKeysViewer \
  roles/cloudfunctions.developer \
  roles/serviceusage.serviceUsageConsumer
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOY_SA" --role="$role" --condition=None
done

for account in "$RUNTIME_SA" "$BUILD_SA" "$PROJECT_ID@appspot.gserviceaccount.com"
do
  # The Google-owned legacy Cloud Build account cannot have account IAM bindings.
  if [ "$account" = "$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" ]; then
    continue
  fi
  gcloud iam service-accounts add-iam-policy-binding "$account" \
    --project="$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" \
    --role=roles/iam.serviceAccountUser --condition=None
done

gcloud secrets add-iam-policy-binding MAILTRAP_PASS --project="$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/secretmanager.viewer \
  --condition=None
```

The `actAs` grants apply to individual accounts, not every service account in
the project. The loop excludes the Google-owned legacy Cloud Build account,
`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`, because it cannot accept an
account IAM policy. Its project-level build permissions are separate. A
user-managed or default Compute Engine account used for builds still needs the
account-scoped grant. Confirm the actual build identity before running this
loop; merely finding a legacy account with the builder role does not establish
that this function uses it. See
[the legacy Cloud Build account's limitations](https://docs.cloud.google.com/build/docs/cloud-build-service-account#limitations).

Firebase CLI 15.34.0 still tests `actAs` on the legacy App Engine
account even for gen2 deployment; this explains the additional
`PROJECT_ID@appspot.gserviceaccount.com` entry. Verify that account exists
before granting it; do not recreate a missing legacy account merely for this
command. If it is absent, inspect the CLI's preflight result during initial
verification.

The October 19, 2026 operator handoff reports that
`xenon-sentry-395319@appspot.gserviceaccount.com` retains project Editor and that
the deployer has `actAs` on it. Together with permission to deploy Functions,
this permits workloads to run with that account's broad privileges. Restricting
the grant to one account does not make this configuration fully least-privileged,
and a separate Token Creator grant is not needed for this path. Before
activation, inventory the account's consumers and replace Editor with their
required scoped roles, or explicitly review and accept this remaining access.
Do not remove Editor blindly from an account that may serve existing workloads.

The Secret Manager Viewer role permits metadata inspection, including the latest
enabled version; it does not grant access to the token's payload. Grant the
runtime account its separate permissions:

```bash
gcloud secrets add-iam-policy-binding MAILTRAP_PASS --project="$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor \
  --condition=None
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/firebaseappcheck.tokenVerifier \
  --condition=None
```

The token-verifier role is needed because the callable consumes App Check
tokens. Preserve the existing public Cloud Run invocation policy: browser
requests reach the callable, which enforces App Check itself. Inspect it with
`gcloud run services get-iam-policy "$RUN_SERVICE" --project="$PROJECT_ID" --region="$FUNCTIONS_REGION"`.
For an existing function whose invocation policy is unchanged, deployment may
not need to write this policy. If CI must manage it, an administrator can create
a small custom role and bind it only to this service:

```bash
gcloud iam roles create firebaseFunctionInvokerPolicy --project="$PROJECT_ID" \
  --title='Firebase function invocation policy' --stage=GA \
  --permissions=run.services.getIamPolicy,run.services.setIamPolicy
gcloud run services add-iam-policy-binding "$RUN_SERVICE" \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --member="serviceAccount:$DEPLOY_SA" \
  --role="projects/$PROJECT_ID/roles/firebaseFunctionInvokerPolicy"
```

This role manages the service's IAM policy, not just a single binding. New HTTP
functions also trigger a Firebase CLI project-level check for
`cloudfunctions.functions.setIamPolicy`; adding a new function needs a separate
review of that permission and its new service. Neither project Owner/Editor nor
Cloud Run Admin across the project is needed for the existing function's routine
updates.

Verify the **build** account can write build logs, read function source objects,
and write the configured Artifact Registry repository. Google documents
`roles/cloudbuild.builds.builder` for the default build account, or a custom
account with `roles/logging.logWriter`, `roles/storage.objectViewer` on source
buckets, and `roles/artifactregistry.writer` on the artifact repository. Retain
an existing working setup or grant those roles at the narrowest applicable
resource scope. Do not grant the build roles to the GitHub deployer instead.
Attaching a powerful runtime/build account conveys effective access to that
account's privileges, so review those accounts for least privilege as well.

These are starting grants based on the documented roles and the CLI's observed
deployment path, not a claim that this project's IAM configuration has already
been verified. The first live run must confirm them. Diagnose a permission
failure against its named principal, resource, and operation; do not respond by
granting Owner, Editor, or project IAM administration to CI.

Firebase CLI generates Pub/Sub and Eventarc service identities during gen2
preparation even for HTTP functions.
[An upstream maintainer's investigation](https://github.com/firebase/firebase-tools/issues/11005)
found no additional IAM grant required for that legacy RPC; with APIs already
enabled, Service Usage Consumer covers the preceding API checks. Organization
policies or a different project configuration can still affect deployment.

References:
[Hosting roles and API Keys Viewer requirement](https://firebase.google.com/docs/projects/iam/roles-predefined-product#hosting),
[Functions deployment roles](https://docs.cloud.google.com/functions/docs/reference/iam/roles#additional_configuration_for_deployment),
[build service accounts](https://docs.cloud.google.com/functions/docs/building),
[Secret Manager roles](https://docs.cloud.google.com/iam/docs/roles-permissions/secretmanager),
and
[App Check replay protection](https://firebase.google.com/docs/app-check/cloud-functions#replay_protection_beta).

## 4. Configure GitHub settings

In `nisavid/nisavid.io`:

1. Under **Settings → Actions → General**, enable Actions and allow the pinned
   `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, and
   `google-github-actions/auth` actions used by the workflow. Keep the default
   `GITHUB_TOKEN` permissions read-only; the deployment job explicitly requests
   `id-token: write` for OIDC.
2. Under **Settings → Environments**, create **`firebase-production`**. Restrict
   deployment branches to the selected branch **`main`**, with no tag rule. Omit
   required deployment reviewers and wait timers if every accepted merge should
   deploy automatically. This is independent of PR review requirements.
3. Add the following **environment variables** to `firebase-production`.

| Variable                         | Value/source                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` name printed above |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | Dedicated deployer email printed above                                                                   |
| `FIREBASE_API_KEY`               | Existing Firebase web app's `apiKey`                                                                     |
| `FIREBASE_AUTH_DOMAIN`           | Existing web app's `authDomain`                                                                          |
| `FIREBASE_PROJECT_ID`            | `xenon-sentry-395319`                                                                                    |
| `FIREBASE_STORAGE_BUCKET`        | Existing web app's `storageBucket`; copy its actual value                                                |
| `FIREBASE_MESSAGING_SENDER_ID`   | Existing web app's `messagingSenderId`                                                                   |
| `FIREBASE_APP_ID`                | Existing web app's `appId`                                                                               |
| `FIREBASE_MEASUREMENT_ID`        | Existing web app's `measurementId`                                                                       |
| `FIREBASE_RECAPTCHA_SITE_KEY`    | Existing reCAPTCHA Enterprise site key registered for this app in App Check                              |
| `FIREBASE_FUNCTIONS_SENDER`      | Existing function's `SENDER`; the Mailtrap-verified sending address                                      |
| `FIREBASE_FUNCTIONS_TO`          | Existing function's `TO`; the intended contact-form recipient                                            |

The browser configuration comes from **Firebase Console → Project settings →
Your apps → the existing web app → SDK setup and configuration**. These values
are embedded in the delivered browser bundle and are not server credentials.
Verify the reCAPTCHA Enterprise key permits the production domain and matches
the App Check registration. Never supply an App Check debug token in production.

The workflow writes the two function parameters into
`functions/.env.xenon-sentry-395319` for deployment. Keep `MAILTRAP_PASS` in
Secret Manager; no GitHub secret with that value is needed. See
[parameter configuration](https://firebase.google.com/docs/functions/config-env#parameterized_configuration).

4. Under **Settings → Secrets and variables → Actions → Variables**, leave the
   **repository** variable `FIREBASE_DEPLOY_ENABLED` absent or `false` until the
   rollout prerequisites below are complete. Set it to exactly `true` to enable
   production deployment. This gate belongs at repository level because job
   selection happens before environment variables are available.
5. Review **Rules / branch protection** for `main`. Recommended protections are
   PR-based changes, required CI checks, appropriate PR review, blocked force
   pushes/deletion, and review of workflow changes. Require the applicable
   **`Validate Firebase build`** check after it has appeared on a workflow run.
   Its strict root lint/typecheck and Functions lint steps become active when
   the repository deployment gate is `true`; before activation, build and other
   tests run while the known lint fixes are being landed. A production
   deployment check is a post-merge result, not a PR acceptance requirement.
   These are recommendations; the repository's existing policies must be
   inspected rather than assumed. Protecting `main` also prevents a direct push
   from bypassing the intended merge-before-deployment process.

## 5. Configure Codex Security Cloud for validation

The existing `nisavid/nisavid.io` environment is
`6ac2d3029a78819196aeaebfe1b4bc12`, with workspace `/workspace/nisavid.io`.
Use the Universal image, explicitly select Node.js 22, select Manual setup,
and enable container caching. Use the following for both setup and maintenance
so a resumed container installs the current lockfiles:

```bash
set -euo pipefail
cd /workspace/nisavid.io
export HUSKY=0

corepack enable
corepack prepare pnpm@9.15.9 --activate

node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --dir functions install --frozen-lockfile
```

Keep lifecycle scripts enabled for Elm tooling. Set persistent `HUSKY=0` and
the eight synthetic browser Firebase variables from the workflow's
**Build site with public test configuration** step. Leave Secrets empty.

Enable agent internet access with Custom domains:

```text
registry.npmjs.org, github.com, api.github.com, codeload.github.com, raw.githubusercontent.com, objects.githubusercontent.com, release-assets.githubusercontent.com, github-releases.githubusercontent.com, package.elm-lang.org, nodejs.org
```

Leave **Read-only HTTP methods** off: Elm uses POST requests to read its package
registry. This configuration is from the October 19, 2026 operator handoff;
it is not evidence that a particular scan executed the installation or tests.

The normal validation sequence is:

```bash
set -euo pipefail
export HUSKY=0
git rev-parse HEAD
node --version
pnpm --version
HUSKY=0 pnpm install --frozen-lockfile
pnpm --dir functions install --frozen-lockfile
node --test scripts/ci/*.test.mjs
pnpm run build
pnpm run lint
pnpm run check
pnpm exec elm-test-rs
pnpm --dir functions run lint
pnpm --dir functions run check
pnpm --dir functions run build
# Available after the parser security fix is present:
pnpm --dir functions test
```

The root build generates Elm modules used by subsequent checks. Supply only
synthetic browser Firebase configuration if a test build needs environment
values. The parser regression tests use fake Mailtrap configuration and mock App
Check and email delivery; they do not need the production token or a real App
Check token. Do not configure production service-account keys, deployer
impersonation, Firebase login tokens, `MAILTRAP_PASS`, or production cloud
access in Security Cloud. Its role is to validate patches; GitHub's protected
deployment job handles production.

Retain the commit SHA, runtime versions, commands, and exit results from a task
that actually executes this sequence in the Cloud environment. The successful
October 19 scan on `a0623ced02abff58d8383f5b05633a4b97f263f6` explicitly reports
offline static review. It does not verify this sequence, production IAM/WIF,
or a live deployment. Local and GitHub Actions results are separate evidence.

## 6. Roll out and verify

1. Merge the workflow PR first, leaving `FIREBASE_DEPLOY_ENABLED` disabled.
   Production remains gated while the known lint failures are fixed.
2. Merge lint configuration PR **#5**, then its stacked cleanup PR **#6**, while
   deployment remains gated. Retarget/rebase the stack as needed. Verify the
   build validation succeeds on `main` and run the complete validation sequence
   above before activation. Activation also enables the strict lint/typecheck
   steps in PR validation.
3. Refresh the security fixes onto the updated `main`, preserving the Node.js 22
   Functions engine when resolving PR **#4**'s `package.json` changes. Address
   the App Check replay, missing email limits, and structured-log metadata
   findings reported in the October 19 scan. PR **#7** proposes replay rejection
   and durable rate limits; it still needs payload validation and safe logging.
   Complete independent reviews and merge the accepted fixes while deployment
   remains disabled. Rerun the full validation sequence on the resulting `main`.
4. Complete Google Cloud IAM/WIF and the GitHub environment configuration above.
   Confirm the function's actual build identity and Artifact Registry cleanup
   policy; the operator handoff does not establish either. Review the legacy
   App Engine Editor access described above. If adopting PR **#7**, also
   provision and verify its dedicated `contact-form` Firestore database, client
   deny rules, `CONTACT_RATE_LIMIT_SECRET`, and required scoped IAM; verify the
   trusted ingress chain used for network rate limits. The workflow deploys
   only Hosting and Functions, so it does not provision those Firestore rules.
   Preserve the existing public callable invocation policy and Secret Manager
   runtime access. Recheck WIF and the GitHub environment before activation.
5. After these prerequisites are complete and production activation is
   authorized, set the repository variable `FIREBASE_DEPLOY_ENABLED=true`, then
   use **Actions → Firebase deployment → Run workflow**, selecting **`main`**.
   Wait for a fully successful Hosting **and** Functions deployment before
   proceeding. Enabling the variable alone does not trigger a run.
6. Verify the live site at <https://nisavid.io>, check browser initialization
   and App Check, and manually submit an intentional contact-form test to
   confirm email delivery. Verify the deployed function uses Node.js 22 and the
   intended secret and parameters. A green build alone does not prove live email
   delivery.
7. Subsequent accepted merges to `main` run validation and automatically deploy
   while the gate is enabled. Check each deployment result before declaring its
   fixes live.

Firebase Hosting and Functions are **not an atomic release**. One component can
succeed while the other fails; inspect both results before declaring a change
live. The workflow serializes production deployments and checks that the commit
is still the current `main` before deployment. For a failed or superseded run,
dispatch a new run from current `main` rather than using an old workflow run to
roll production backward. To roll back intentionally, revert through a new PR
and deploy the resulting `main`; assess any partly deployed Functions change
separately from a Hosting rollback.

The gate can be set to `false` to prevent new production jobs during setup or
incident handling. Changing it does not stop a deployment that has already
started. No production deployment should be reported as verified until the
authenticated GitHub run and the live checks above have succeeded.
