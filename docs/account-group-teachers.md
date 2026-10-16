# Accounts-only teacher assignments

Approved accounts and Groups share a single Accounts browser: Teachers & Staff,
Unassigned students, nine levels, subgroups, and account rows. Legacy groups
without a known level remain reachable through Unassigned. Staff rows are not
interactive when the existing account-detail policy prohibits opening them.
Approval counters include pending registration and account-change requests.

GET/POST /api/accounts/group-teachers is limited to authenticated reviewers.
POST additionally requires same-origin requests, enabled writes and the current
per-subgroup revision. Teacher choices come from the existing role-filtered
account directory. Hidden assignments are preserved but not disclosed when a
reviewer updates the visible teachers. Students cannot use this endpoint.

Assignments persist in the selected database's existing catalog_documents table,
namespace accounts-group-teachers, key = subgroup id. No new schema is needed.
Compare-and-swap writes prevent lost updates. Tests cover SQLite and PostgreSQL.

These records are administrative display metadata ONLY. They are not read by
lesson/exam permissions, chat membership or academic group membership. Adding
or removing a teacher here must never grant or revoke those permissions.
