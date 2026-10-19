# Firebase production verification

Use this runbook in an already authenticated administrator session for
`xenon-sentry-395319`. It collects deployment prerequisites without changing
cloud resources, invoking the mail function, or retrieving secret payloads. Keep
the repository variable `FIREBASE_DEPLOY_ENABLED` absent or `false` while the
outstanding prerequisites are resolved.

Run sections in order in one Bash session, replacing placeholders with observed
values. Permission errors, disabled APIs, and empty fields are unresolved
checks, not proof of absence. The commands were checked for Bash syntax and
against CLI documentation; they were not executed against this project while
writing this runbook.

Use the [deployment guide](firebase-deployment.md) and
[PR #7](https://github.com/nisavid/nisavid.io/pull/7) for provisioning and
rollout. Keep production observation output out of git.

## Session and project

Keep explicit project arguments. Do not enable HTTP debug logging or dump
credentials, complete environment/function configuration, or build steps.

```bash
set -euo pipefail
PROJECT_ID=xenon-sentry-395319
PROJECT_NUMBER=475831902992
FUNCTIONS_REGION=us-central1
FUNCTION_NAME=sendContactFormEmail
DEPLOY_SA=github-firebase-deploy@xenon-sentry-395319.iam.gserviceaccount.com
APPENGINE_SA=xenon-sentry-395319@appspot.gserviceaccount.com
POOL_ID=github-firebase-production
PROVIDER_ID=github

date -u '+%Y-%m-%dT%H:%M:%SZ'
gcloud version
gcloud projects describe "$PROJECT_ID" \
  --format='yaml(projectId,projectNumber,lifecycleState,parent)'
gcloud billing projects describe "$PROJECT_ID" \
  --format='yaml(projectId,billingEnabled)'
```

Confirm project number `475831902992` and enabled billing. Check Firebase's
plan, existing Hosting site, and custom domain in the consoles as described in
[Verify the existing Firebase project](firebase-deployment.md#1-verify-the-existing-firebase-project).

## Function, runtime, and invocation policy

Only `SENDER` and `TO` are selected from ordinary environment variables. Secret
environment entries below contain references to secret names/versions, not their
values. Compare the observed runtime with the repository's intended Node.js 22
runtime; the old live revision may still use an older runtime before rollout.

```bash
gcloud functions describe "$FUNCTION_NAME" --v2 \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='yaml(name,state,environment,updateTime,buildConfig.runtime,buildConfig.build,buildConfig.serviceAccount,buildConfig.dockerRepository,serviceConfig.service,serviceConfig.serviceAccountEmail,serviceConfig.uri,serviceConfig.ingressSettings,serviceConfig.maxInstanceCount,serviceConfig.environmentVariables.SENDER,serviceConfig.environmentVariables.TO,serviceConfig.secretEnvironmentVariables,serviceConfig.secretVolumes)'

RUNTIME_SA=$(gcloud functions describe "$FUNCTION_NAME" --v2 \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='value(serviceConfig.serviceAccountEmail)')
RUN_RESOURCE=$(gcloud functions describe "$FUNCTION_NAME" --v2 \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='value(serviceConfig.service)')
test -n "$RUNTIME_SA"
test -n "$RUN_RESOURCE"
RUN_SERVICE=${RUN_RESOURCE##*/}

gcloud run services describe "$RUN_SERVICE" \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='yaml(metadata.name,status.url,status.latestReadyRevisionName,status.traffic,spec.template.spec.serviceAccountName)'
gcloud run services get-iam-policy "$RUN_SERVICE" \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --flatten='bindings[].members[]' \
  --filter='bindings.role=roles/run.invoker' \
  --format='table(bindings.role,bindings.members,bindings.condition.expression)'
```

Preserve the existing `allUsers` invoker binding. The callable's App Check and
application controls enforce the request boundary. Record all traffic-serving
revisions, including tagged revisions if present, rather than assuming the
latest revision is the only reachable revision.

Reference:
[`gcloud functions describe`](https://docs.cloud.google.com/sdk/gcloud/reference/functions/describe).

## Actual build identity

Inspect the deployed function's build, then compare with today's default. The
existence of a legacy build account does not establish that it was used.

```bash
BUILD_RESOURCE=$(gcloud functions describe "$FUNCTION_NAME" --v2 \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='value(buildConfig.build)')
printf '%s\n' "$BUILD_RESOURCE"

gcloud builds get-default-service-account \
  --project="$PROJECT_ID" --region="$FUNCTIONS_REGION"
```

Copy the build ID and location from `BUILD_RESOURCE`. Use `global` only if the
observed build is global. If that field is missing or its build is no longer
available, mark the deployed build identity unresolved; the current default
alone does not prove which identity produced the live revision.

```bash
BUILD_ID='<build ID from BUILD_RESOURCE>'
BUILD_REGION='<location from BUILD_RESOURCE>'
gcloud builds describe "$BUILD_ID" \
  --project="$PROJECT_ID" --region="$BUILD_REGION" \
  --format='yaml(id,name,status,createTime,finishTime,serviceAccount,logsBucket,results.images.name,results.images.digest)'
```

If the build response omits its account, inspect that build in Cloud Console; do
not infer its identity from today's default. Set `BUILD_SA` to the verified
email, stripping any `projects/.../serviceAccounts/` prefix.

```bash
BUILD_SA='<verified build service account email>'
```

References:
[`builds describe`](https://docs.cloud.google.com/sdk/gcloud/reference/builds/describe),
[`builds get-default-service-account`](https://docs.cloud.google.com/sdk/gcloud/reference/builds/get-default-service-account),
and
[build identity guidance](firebase-deployment.md#1-verify-the-existing-firebase-project).

## Secret metadata and resource IAM

Run this for `MAILTRAP_PASS`. Repeat with `CONTACT_RATE_LIMIT_SECRET` after the
PR #7 bootstrap has created it. A missing quota secret before bootstrap is a
remaining prerequisite, not a reason to create or rotate the mail secret.

```bash
SECRET_NAME=MAILTRAP_PASS
gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" \
  --format='yaml(name,replication,createTime)'
gcloud secrets versions list "$SECRET_NAME" --project="$PROJECT_ID" \
  --format='table(name,state,createTime,destroyTime)'
gcloud secrets get-iam-policy "$SECRET_NAME" --project="$PROJECT_ID" \
  --flatten='bindings[].members[]' \
  --filter="bindings.members=('serviceAccount:$RUNTIME_SA' 'serviceAccount:$DEPLOY_SA')" \
  --format='table(bindings.members,bindings.role,bindings.condition.expression)'
```

Confirm the numeric versions referenced by the deployed function are enabled,
and that the version intended for the next deployment exists and is enabled. If
a reference uses `latest`, inspect that alias's metadata too:

```bash
gcloud secrets versions describe latest --secret="$SECRET_NAME" \
  --project="$PROJECT_ID" --format='yaml(name,state,createTime)'
```

The runtime needs secret-scoped Accessor; the deployer needs metadata access.
These resource policies do not reveal inherited access; inspect project and
ancestor grants below. Never use `secrets versions access` in this verification.

Reference:
[`secrets versions list`](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/list).

## Artifact Registry cleanup

Use the repository and location observed in `buildConfig.dockerRepository`. If
absent, first identify the repository corresponding to the build image from the
prior section; do not silently assume `gcf-artifacts` is the active one.

```bash
ARTIFACT_REPOSITORY='<observed repository ID>'
ARTIFACT_REGION='<observed repository location>'
gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --project="$PROJECT_ID" --location="$ARTIFACT_REGION" \
  --format='yaml(name,format,mode,cleanupPolicies,cleanupPolicyDryRun,labels)'
gcloud artifacts repositories get-iam-policy "$ARTIFACT_REPOSITORY" \
  --project="$PROJECT_ID" --location="$ARTIFACT_REGION" \
  --flatten='bindings[].members[]' \
  --filter="bindings.members=('serviceAccount:$BUILD_SA' 'serviceAccount:$DEPLOY_SA')" \
  --format='table(bindings.members,bindings.role,bindings.condition.expression)'
```

Record retention conditions and whether cleanup is in dry-run mode. Check for
the Firebase cleanup policy or its explicit opt-out marker. An unrelated policy
is not automatically proof that the pinned CLI's cleanup check is satisfied. If
adjustment is needed, use the administrative procedure in the
[deployment guide](firebase-deployment.md#1-verify-the-existing-firebase-project).

References:
[`artifacts repositories describe`](https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/repositories/describe)
and
[Firebase artifact cleanup](https://firebase.google.com/docs/functions/manage-functions#clean_up_deployment_artifacts).

## WIF trust and account attachment permissions

Inspect every provider in the dedicated pool, not only the expected provider.
Another provider must not be able to assert the same repository ID with weaker
trust conditions.

```bash
gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" --location=global \
  --format='yaml(name,state,disabled)'
gcloud iam workload-identity-pools providers list \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --format='table(name,state,disabled)'
gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --format='yaml(name,state,disabled,oidc.issuerUri,oidc.allowedAudiences,attributeMapping,attributeCondition)'
gcloud iam service-accounts get-iam-policy "$DEPLOY_SA" \
  --project="$PROJECT_ID" --flatten='bindings[].members[]' \
  --filter='bindings.role=roles/iam.workloadIdentityUser' \
  --format='table(bindings.members,bindings.role,bindings.condition.expression)'

for target_sa in "$RUNTIME_SA" "$BUILD_SA" "$APPENGINE_SA"; do
  if [ "$target_sa" = "$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" ]; then
    continue
  fi
  printf 'Account attachment policy: %s\n' "$target_sa"
  gcloud iam service-accounts get-iam-policy "$target_sa" \
    --project="$PROJECT_ID" --flatten='bindings[].members[]' \
    --filter="bindings.members='serviceAccount:$DEPLOY_SA'" \
    --format='table(bindings.members,bindings.role,bindings.condition.expression)'
done
```

Require active, enabled pool/provider state. Compare mappings and conditions
exactly with
[GitHub trust](firebase-deployment.md#2-create-the-deploy-identity-and-github-trust):
repository `677459876`, owner `576874`, `refs/heads/main`,
`firebase-production`, the expected workflow path, and only `push` or
`workflow_dispatch`. Compare the principal-set binding to the pool and numeric
repository ID. The Google-owned legacy Cloud Build account cannot accept an
account IAM policy; skipping it above is intentional.

Reference:
[`workload-identity-pools providers describe`](https://docs.cloud.google.com/sdk/gcloud/reference/iam/workload-identity-pools/providers/describe).

## Enabled APIs, direct grants, and service agents

The API query is restricted to deployment prerequisites. Firestore and Firebase
Rules are additional prerequisites for the quota bootstrap. Do not enable APIs
as a side effect of this read-only inventory.

```bash
gcloud services list --enabled --project="$PROJECT_ID" \
  --filter='config.name:(iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com apikeys.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com storage.googleapis.com secretmanager.googleapis.com firebaseappcheck.googleapis.com firestore.googleapis.com firebaserules.googleapis.com)' \
  --format='table(config.name,state)'

for principal in \
  "$DEPLOY_SA" "$RUNTIME_SA" "$BUILD_SA" "$APPENGINE_SA" \
  "service-$PROJECT_NUMBER@gcf-admin-robot.iam.gserviceaccount.com" \
  "service-$PROJECT_NUMBER@serverless-robot-prod.iam.gserviceaccount.com" \
  "service-$PROJECT_NUMBER@gcp-sa-cloudbuild.iam.gserviceaccount.com" \
  "service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com" \
  "service-$PROJECT_NUMBER@gcp-sa-eventarc.iam.gserviceaccount.com"
do
  printf 'Direct project roles: %s\n' "$principal"
  gcloud projects get-iam-policy "$PROJECT_ID" \
    --flatten='bindings[].members[]' \
    --filter="bindings.members='serviceAccount:$principal'" \
    --format='table(bindings.members,bindings.role,bindings.condition.expression)'
done
```

Compare deployment/runtime/build grants with
[their separate roles](firebase-deployment.md#3-grant-deployment-runtime-and-build-permissions-separately).
Expected service-agent roles are `roles/cloudfunctions.serviceAgent`,
`roles/run.serviceAgent`, `roles/cloudbuild.serviceAgent`,
`roles/pubsub.serviceAgent`, and `roles/eventarc.serviceAgent`, respectively. Do
not confuse the Cloud Build service agent with the account executing a build.

## Legacy App Engine consumers and inherited access

This is an initial consumer check, not an exhaustive IAM audit. The direct-role
query above establishes whether Editor remains; ancestry identifies where
inherited grants also need review. No matching workload or log entry is enough
to authorize removing Editor.

```bash
gcloud projects get-ancestors "$PROJECT_ID" --format='table(type,id)'
gcloud functions list --v2 --project="$PROJECT_ID" \
  --format='table(name,environment,serviceConfig.serviceAccountEmail,buildConfig.serviceAccount)'
gcloud app versions list --project="$PROJECT_ID"

APP_SERVICE='<observed App Engine service>'
APP_VERSION='<observed App Engine version>'
gcloud app versions describe "$APP_VERSION" --service="$APP_SERVICE" \
  --project="$PROJECT_ID" \
  --format='yaml(name,id,servingStatus,serviceAccount)'

gcloud run services list --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='table(metadata.name,spec.template.spec.serviceAccountName,status.traffic)'
gcloud run revisions list --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --filter="spec.serviceAccountName='$APPENGINE_SA'" \
  --format='table(metadata.name,spec.serviceAccountName)'
gcloud run jobs list --project="$PROJECT_ID" --region="$FUNCTIONS_REGION" \
  --format='table(metadata.name,spec.template.spec.template.spec.serviceAccountName)'

gcloud logging read \
  "protoPayload.authenticationInfo.principalEmail=\"$APPENGINE_SA\" AND (log_id(\"cloudaudit.googleapis.com/activity\") OR log_id(\"cloudaudit.googleapis.com/data_access\"))" \
  --project="$PROJECT_ID" --freshness=90d --limit=100 --order=desc \
  --format='table(timestamp,protoPayload.serviceName,protoPayload.methodName,protoPayload.resourceName)'
```

Describe every App Engine version, including versions without traffic. Match
legacy-account Cloud Run revisions to traffic and tags. Repeat the regional
queries for any other known workload locations. Unset identities need follow-up.
The audit query selects metadata only and is a bounded sample; retention, audit
settings, external jobs, and cross-project use can hide consumers. Resolve those
gaps and review the account's required permissions before proposing an Editor
replacement. See
[service account usage tools](https://docs.cloud.google.com/iam/docs/service-account-usage-tools)
and
[`app versions describe`](https://docs.cloud.google.com/sdk/gcloud/reference/app/versions/describe).

## Quota database and ingress follow-up

After the PR #7 bootstrap, inspect database metadata and the runtime's
conditional project grant. The earlier IAM query should show a condition
restricted to `projects/xenon-sentry-395319/databases/contact-form`, without
another broad grant overriding the intended isolation. Do not read or modify
quota documents here.

```bash
gcloud firestore databases describe --database=contact-form \
  --project="$PROJECT_ID" \
  --format='yaml(name,locationId,type,databaseEdition,concurrencyMode,deleteProtectionState)'
```

Verify the named database's published deny-all client rules separately in the
Firebase Console, and use the secret metadata section for the quota secret.
Provisioning remains in PR #7's reviewed deployment instructions. Firebase
documents
[per-database IAM conditions](https://firebase.google.com/docs/firestore/manage-databases#configure_per-database_access_permissions)
and the separate deployment of rules to each database. Console access is not a
valid test of those IAM conditions; Firebase documents that database conditions
are enforced by client-library/API access, not the console.

The
[Google request-header documentation](https://docs.cloud.google.com/functions/docs/reference/headers)
describes a forwarding chain, but does not establish the precise last-hop
selection for this live deployment. PR #7's ingress verification remains a
separate controlled test of ordinary and caller-prefixed requests on the actual
reachable endpoints. This runbook sends no requests to the callable. Record that
check as pending until actual observations establish the assumption; global
quota enforcement alone does not prove per-network attribution.

## Handoff result

Record the observation timestamp, successful reads, and exact unresolved checks.
Include the deployed function revision/runtime, verified runtime/build accounts,
secret version states, artifact cleanup mode, WIF comparison, and any remaining
Editor consumers. Keep production output out of git and omit secret payloads.

Recheck the GitHub environment and disabled repository gate using
[Configure GitHub settings](firebase-deployment.md#4-configure-github-settings).
Cloud metadata reads do not establish successful GitHub OIDC authentication,
builds inside Codex Security Cloud, a production deployment, App Check behavior,
or email delivery. Follow the existing
[rollout sequence](firebase-deployment.md#6-roll-out-and-verify) once its
explicit prerequisites are complete.
