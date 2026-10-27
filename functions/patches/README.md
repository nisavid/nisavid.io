# Contact request logging patches

The pinned Firebase callable SDK logs request bodies, unexpected envelope keys,
and typed-decoder input before the application handler. The Firebase patch
removes these payload arguments, preserving fixed diagnostic categories and
severity, request validation, App Check ordering, callable responses, and CORS.
Serializing payloads alone prevents metadata injection but retains private data.

Malformed JSON can also expose request excerpts through native syntax errors
before the callable runs. The pinned Express patch changes only the final error
logger for `entity.parse.failed` to a fixed diagnostic. It preserves the
original error object, status, headers, and response body.

`pnpm.patchedDependencies` and the Functions lockfile apply both patches during
installation and deployment builds. Keep patch files in the Functions bundle; do
not disable unused-patch or application failures. When updating Firebase,
Functions Framework, Express, or body-parser, inspect these paths and rerun
`pnpm --dir functions test` before removing or replacing the patches.

`test/request-logging.test.mjs` captures real Firebase logger output and
ordinary Express console errors. It covers malformed envelopes and decoder data,
plain, compressed, and strict JSON failures, valid mail payloads, unique
correlation IDs, and transport/delivery failures. Application logs contain
generated IDs and fixed outcomes/reasons rather than contact fields or provider
errors.
