# Temporary App Check replay diagnostics

This observer helps investigate a replay that reaches input validation despite
`consumeAppCheckToken: true`. It is not a replay fix and does not change the
SDK's verification or the application's rejection guard.

The current production acceptance failure occurred on deployed commit
`83fb541a2fe1e1cf1a30602590776f3d5d3c10b8`, revision
`sendcontactformemail-00017-ret`. Existing audit records show two verification
calls by the runtime account with permission granted, but omit consumption
results. Main subsequently incorporated PRs #12 and #13. Any rollout must review
all changes since the serving commit; this diagnostic is not an isolated update
to the old image.

## Data and limits

The observer runs immediately before the existing replay guard. It records only
attested calls whose decoded subject is `null`, while a server-configured window
is active. The message is `[DEBUG-app-check-replay]`. Fields describe the SDK's
`alreadyConsumed` property and a domain-separated HMAC-SHA256 fingerprint of the
actual received App Check header. The key is the existing quota secret. Changing
the expiry changes the fingerprint domain.

No raw tokens, decoded token claims, request bodies, IP addresses, email fields,
or secrets are logged. Fingerprints belong in restricted operational logs;
report only whether they match. The observer makes no additional verification,
database, or mail request. It emits at most 20 records per process. This is not
a global limit across instance restarts. Errors in diagnostic processing do not
change the callable's decision and do not expose error objects.

The log shows the SDK-normalized result, not the raw verification HTTP response.
The public Admin SDK maps an omitted backend `alreadyConsumed` field to false.
Do not infer the original response-field presence from these logs.

## Configuration and review boundary

Leave `FIREBASE_FUNCTIONS_APP_CHECK_DIAGNOSTICS_UNTIL` absent in the protected
GitHub environment during ordinary operation. The deployment generator writes an
empty `CONTACT_APP_CHECK_DIAGNOSTICS_UNTIL` runtime value in that case.

After independent review and explicit authorization for a controlled diagnostic
rollout, a canonical UTC ISO timestamp such as `YYYY-MM-DDTHH:mm:ss.sssZ` can be
configured. It must be no more than one hour ahead. The runtime validates it at
initialization and stops logging at the absolute deadline. Empty, malformed,
expired, or initially excessive windows remain inactive. A window that expires
during deployment produces no diagnostic evidence; it is not a reason to extend
the deadline automatically.

Adding the setting does not itself deploy code, bypass
`FIREBASE_DEPLOY_ENABLED=false`, or authorize requests. Keep the deployment gate
paused while this candidate is reviewed. A production rollout and any bounded
acceptance check require their own concrete approval and remain outstanding. No
new IAM grants or operator impersonation are required by this observer.

## Interpretation and cleanup

For an explicitly authorized pair of invalid-subject requests, compare only the
private token fingerprints and recorded SDK state:

- Different fingerprints: the server received different token bytes; review the
  capture path before attributing a backend replay failure.
- Same fingerprint and a true second consumption flag: the existing guard should
  reject the second request. Correlate its HTTP result and serving revision if
  that differs.
- Same fingerprint with false or missing consumption state twice: the original
  failure persists at the handler boundary. The observer has identified the
  boundary, not a root cause or a repair.
- Missing diagnostic records: check the window and process cap; absence alone is
  not a successful replay check.

Preserve the completed mail-delivery, forwarding-attribution, and monitoring
checks. Do not repeat them for this diagnostic. Cross-database denial remains a
separate evidence limitation.

Remove the optional GitHub setting after the authorized observation. The
absolute expiry stops logging without another deployment. Remove the observer,
its configuration plumbing, and diagnostic tests in the follow-up fix; retain
only a regression test that exercises the established cause. Automatic
deployment stays paused until the agreed acceptance work is satisfied.
