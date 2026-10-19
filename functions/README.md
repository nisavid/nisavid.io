# Contact email abuse controls

`sendContactFormEmail` remains a public callable with the same payload and mail
format. App Check is required, limited-use tokens are consumed, and a token
reported as already consumed is rejected before reserving capacity.

Each accepted attempt reserves capacity in one Firestore transaction before
constructing the Mailtrap client:

- At most **5 attempts per upstream network in a rolling hour**.
- At most **50 attempts in total in a rolling 24 hours**, across all instances,
  revisions, tokens, and message contents.

IPv4 addresses, IPv4-mapped IPv6 addresses, and 6to4/Teredo addresses carrying
the same public IPv4 address share a key. Native IPv6 addresses share a key
within a /64. A dedicated secret HMACs the network identifier; raw addresses are
not stored. NATs and forwarding proxies share the network budget. These are
network limits, not authenticated person or device limits.

The named database `contact-form` contains one document,
`contactEmailLimits/budget`, with at most 50 timestamp/hash pairs. Firestore
read time determines rolling windows. Expired reservations are removed on the
next successful reservation; there is no background deletion or TTL dependency.
Failed deliveries retain their reservation because retrying still incurs work.
Transaction failures, corrupt state, missing configuration, and invalid source
addresses fail closed with `unavailable`; exhausted quotas return
`resource-exhausted`. Do not reset quota state as a routine response to errors.

## Ingress assumption

The client calls Google's managed callable endpoint directly; it does not use a
Firebase Hosting rewrite. The limiter reads the last `X-Forwarded-For` entry, or
the preceding entry when the final entry is exactly Cloud Run's `169.254.1.1`
sentinel. It ignores caller-supplied prefixes and rejects missing, invalid, or
non-public selected addresses. It never uses Express's `req.ip`, which trusts
every proxy in Functions Framework.

See [Google's header documentation] and [Google LUCI's Cloud Run implementation]
for the forwarding-chain model. Before deployment, verify the observed chain for
the actual callable ingress with both ordinary and prefixed requests. Extra
public proxies share a quota; unknown private proxy tails fail closed. Reassess
this boundary before adding an ingress proxy or changing platforms. The global
budget does not depend on the network identity and remains effective even if a
caller changes networks.

The local Functions emulator has no Google forwarding headers and forwards
requests to the Node runtime over a Unix socket. Only when its server-set
`FUNCTIONS_EMULATOR=true` flag is present, all local callers use one shared
`emulator` quota key. This mode requires `FIRESTORE_EMULATOR_HOST`; it never
skips quota enforcement. `pnpm --dir functions start` starts both emulators.
Configure test values in `functions/.secret.local` for `MAILTRAP_PASS` and
`CONTACT_RATE_LIMIT_SECRET`, and normal local values for `SENDER` and `TO`.
Interactive `functions:shell` use requires a running Firestore emulator and
`FIRESTORE_EMULATOR_HOST` in the shell environment too.

## Deployment

Provision these prerequisites before deploying the function. No production
database, secret, IAM policy, or provider setting is changed by local tests. The
automatic deployment workflow deploys Hosting and Functions only; complete these
database, rules, secret, and IAM prerequisites separately before enabling
`FIREBASE_DEPLOY_ENABLED`, following
[the deployment guide](../docs/firebase-deployment.md).

1. Inspect the project's databases first. Create a **dedicated** Firestore
   Native database named `contact-form` in `us-central1` (the function's current
   default region), or review an existing database with that name before using
   it:

   ```sh
   pnpm exec firebase firestore:databases:list --project xenon-sentry-395319
   pnpm exec firebase firestore:databases:create contact-form --location us-central1 --project xenon-sentry-395319
   ```

2. Grant the runtime service account access only to the dedicated database,
   using the database-name IAM condition. Inspect existing grants first; do not
   retain an unconditional project-wide data-access grant as a substitute.
   Deploy the deny-all client rules before the function:

   ```sh
   gcloud projects add-iam-policy-binding xenon-sentry-395319 \
     --member=serviceAccount:475831902992-compute@developer.gserviceaccount.com \
     --role=roles/datastore.user \
     --condition="title=contact-form-database,expression=resource.name == 'projects/xenon-sentry-395319/databases/contact-form'"
   pnpm exec firebase deploy --only firestore:contact-form --project xenon-sentry-395319
   ```

3. Generate a dedicated shared secret, then grant the runtime payload access and
   the GitHub deployment account metadata-only access on this secret. Keep its
   payload out of GitHub and Codex. All active revisions must use the same
   secret and database; rotating it resets network identities but does not reset
   the global budget. Inspect an existing secret before creating another
   version.

   ```sh
   set -euo pipefail
   openssl rand -hex 32 | pnpm exec firebase functions:secrets:set CONTACT_RATE_LIMIT_SECRET --data-file - --project xenon-sentry-395319
   gcloud secrets add-iam-policy-binding CONTACT_RATE_LIMIT_SECRET \
     --project=xenon-sentry-395319 \
     --member=serviceAccount:475831902992-compute@developer.gserviceaccount.com \
     --role=roles/secretmanager.secretAccessor
   gcloud secrets add-iam-policy-binding CONTACT_RATE_LIMIT_SECRET \
     --project=xenon-sentry-395319 \
     --member=serviceAccount:github-firebase-deploy@xenon-sentry-395319.iam.gserviceaccount.com \
     --role=roles/secretmanager.viewer
   ```

   Keep automatic deployment disabled until all reviewed security fixes and
   prerequisites in the deployment guide are complete. The GitHub workflow then
   deploys the current `main` through the production environment.

4. Verify one real contact submission and inspect quota state and the ingress
   assumption above. Confirm `MAILTRAP_PASS`, `SENDER`, and `TO` remain
   configured. Set Mailtrap quota alerts and Cloud Monitoring alerts for
   `Contact email quota exhausted` and `Contact email quota unavailable`. Ensure
   50 sends/day fits the actual provider allowance before enabling traffic;
   lower the reviewed constants if needed.

`maxInstances: 2` limits ordinary scaling, but this is not a hard spending cap.
Requests rejected at the quota boundary still consume App Check, function,
Firestore read, and logging resources. Provider quotas and monitoring remain
necessary. The single budget document intentionally favors bounded email volume
over availability during contention or an outage.

## Local verification

Use Node 22, pnpm 9.15.9, and Java 21 or newer for the Firestore emulator. From
the repository root:

```sh
pnpm --dir functions install --frozen-lockfile
pnpm --dir functions run check
pnpm --dir functions test
pnpm exec firebase emulators:exec --only firestore --project demo-contact-rate-limit 'pnpm --dir functions run test:emulator'
pnpm --dir functions run lint
```

The fast HTTP suite mocks App Check verification, Firestore transactions, and
Mailtrap delivery. The emulator suite exercises real concurrent Firestore
transactions and client access rules. It requires the emulator and must not be
pointed at a real project. Neither suite sends email.

[Google's header documentation]:
  https://cloud.google.com/functions/docs/reference/headers
[Google LUCI's Cloud Run implementation]:
  https://chromium.googlesource.com/infra/luci/luci-go/+/366c3d6752a7/server/server.go
