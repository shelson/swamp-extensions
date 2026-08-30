## 2026.08.30.2

**Fixed:** `component` create-or-adopt now lists project-scoped components (`/rest/api/3/project/{key}/component`) instead of all components, preventing false adoptions across projects.

**Fixed:** `issue_link` type resolution no longer passes the full type object as a name lookup; now reads `g.type?.name` directly.

**Fixed:** `component` delete writes `id` as `String(args.id)` to avoid type mismatch in stored resources.

**Added:** Unit tests for `_lib/jira.ts` shared helpers (`checkCredentials`, `list` response shapes, error handling).

## 2026.08.30.1

**Added:** `addComment` method on `issue` (`issue_transitions.ts`) — posts a comment
on any issue by id/key, independent of the model's `name` global argument.
