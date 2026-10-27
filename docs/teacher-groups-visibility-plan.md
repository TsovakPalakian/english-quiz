# Teacher Group Visibility Plan

## Objective
Enforce the rule: "each teacher sees only their own groups" in the Groups section (`#groups`).
- A group is owned by a teacher if that teacher (`authUser.id`) is assigned to it in `accounts-group-teachers` (`teacherIds`).
- Multiple teachers assigned to the same group can all see the group and its students.
- Developers (`DEVELOPER`) retain access to all groups across all levels.
- When a teacher creates a new group, they are automatically assigned as its teacher.
- A teacher does not see groups where they are not assigned.

## Checklist
- 🟩 **Stage 1**: Backend updates in `src/learning-groups.mjs`:
  - Return `teacherIds` on each group in `GroupService.list(actor)`.
  - Automatically assign the creator teacher to `accounts-group-teachers` on group creation (`action: 'create'`).
- 🟩 **Stage 2**: Frontend updates in `client/52-lessons.js`:
  - Filter `allRows` in `paintGroups()` so an `ADMIN` teacher only sees groups assigned to them (`group.teacherIds?.includes(authUser.id)`).
  - Ensure `groupOpen(id)` checks ownership before opening.
  - Refresh group directory and teacher assignments on group creation.
- 🟩 **Stage 3**: Rebuild preview scripts via `npm run build:preview` and production assets.
- 🟩 **Stage 4**: Verify all automated tests and add/update tests for teacher group isolation.
- 🟩 **Stage 5**: Mark all checklist items `🟩` and provide English past-tense commit message.
