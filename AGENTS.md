# nisavid.io agent instructions

This repository is Ivan D Vasin's personal site: an Elm single-page application
with TypeScript, styled with Tailwind CSS, built with Parcel, and deployed to
Firebase Hosting and Cloud Functions. See `README.md` and
`docs/firebase-deployment.md`.

While the repository variable `FIREBASE_DEPLOY_ENABLED` is `true`, each push to
`main` that passes validation deploys Hosting and Functions to production
through the "Firebase deployment" workflow, unless a newer commit has superseded
it on `main`. A manual run of that workflow from `main` deploys too. Weigh each
merge as a production deploy. See `docs/firebase-deployment.md`.

## Agent skills

### Issue tracker

Public tickets live in GitHub Issues for `nisavid/nisavid.io`, which is their
source of truth. Private tickets live only in Linear, team IDV. See
`docs/agents/issue-tracker.md`.

### Triage labels

Two category labels (`bug`, `enhancement`) and five triage states. See
`docs/agents/triage-labels.md`. The Wayfinder map and decision-type labels are
defined in `docs/agents/issue-tracker.md` (Wayfinding operations).

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repository root, created
when first needed. See `docs/agents/domain.md`.
