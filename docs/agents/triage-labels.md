# Triage labels

The triage vocabulary has two category roles and five state roles. This file
maps those canonical roles to the label strings used in this repository's GitHub
issues. Create any missing label in GitHub with exactly that name, as under
**Create a label** in [issue-tracker.md](issue-tracker.md#conventions).

A triaged public issue carries one category role and one state role. Wayfinder
labels are a separate axis, defined in
[Wayfinding operations](issue-tracker.md#wayfinding-operations). A ticket
carries only the axes that apply to it, and no combination of axes is forbidden.

## Category roles

| Canonical role | Label in our tracker | Meaning                    |
| -------------- | -------------------- | -------------------------- |
| `bug`          | `bug`                | Something is broken        |
| `enhancement`  | `enhancement`        | New feature or improvement |

## State roles

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (for example "apply the AFK-ready triage label"),
use the matching label string from these tables.

## Triage by route

**Public route.** Triage is recorded only as GitHub labels. A new issue starts
at `needs-triage`, unless the task that creates it explicitly supplies its
triage outcome: a ready label, or `wontfix` with its reason. On acceptance,
replace `needs-triage` or `needs-info` with the ready label (`ready-for-agent`
or `ready-for-human`) that the triage skill selects. On rejection, make
`wontfix` the only state label and close the issue as "not planned", with the
reason in the closing comment. A Linear ticket that the integration links to a
GitHub issue (by its own link, not a URL in a description) is that issue's
mirror; triage it only in GitHub.

**Private route.** Linear's Triage status is intake. Private tickets carry no
triage labels and no label distinctions. A ticket waiting on information stays
in Triage. On acceptance, move it to Backlog; on rejection, to Canceled, with
the reason in a comment.
