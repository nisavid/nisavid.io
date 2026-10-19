# Firebase callable logging patch

The pinned `firebase-functions@5.0.1` callable validator logs a raw request body
when `data` is missing. Its decoder also logs raw objects for unknown `@type`
values and malformed typed integers. These paths execute before our application
handler, and the missing-data path runs before App Check. The Firebase logger
treats a final plain object as structured log metadata.

The patch serializes those three untrusted log arguments as JSON strings. It
preserves diagnostic data, log severity, request validation, App Check ordering,
callable error responses, and CORS. Application subject validation separately
keeps both contact-email logs from receiving object-valued subjects.

`pnpm.patchedDependencies` and the Functions lockfile apply this patch during
installation, including deployment builds. Keep the patch file in the Functions
source bundle. Do not disable unused-patch or patch-application failures. When
updating the SDK, inspect these paths and run `pnpm --dir functions test` before
removing or replacing the patch. `test/request-logging.test.mjs` exercises the
actual HTTP callable and serialized logger output for all three SDK paths,
object-valued subjects, and valid string subjects.
