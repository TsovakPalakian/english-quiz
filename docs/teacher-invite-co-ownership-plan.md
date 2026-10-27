# Teacher Invite Co-Ownership & Teacher Isolation Plan

## Objective
1. **Invite Co-Ownership**:
   - Allow a teacher (`ADMIN`) or developer (`DEVELOPER`) to create an invite link for their group in the admin panel (`#accounts` -> `Invite` tab).
   - In the admin group picker, a teacher can select only from groups they are assigned to.
   - For `Teacher` invites, `email` is optional:
     - If specified, the invite is locked to that email address.
     - If omitted, the invite can be shared (e.g. via Telegram) and redeemed by any teacher or new applicant.
   - The invite is strictly **single-use** (`maxUses: 1`) and expires in 72 hours.
   - When an already-registered teacher opens the link, they can accept it in 1 click to become a co-owner of the group without re-entering OTP or passwords.
   - When an unregistered applicant registers via the link, their registration requires approval by the inviting teacher/developer, after which they receive the `ADMIN` role and are assigned to the group.
2. **Teacher Isolation**:
   - Other teachers do not see teachers of other groups.
   - In `/api/admin/users`, `/api/accounts/group-teachers`, and the admin UI (`Teachers & Staff`, account search), an `ADMIN` teacher sees only themselves, their co-teachers (teachers in shared groups), and students of their groups.
   - In group teacher assignment (`admingroup`), an `ADMIN` can only manage assignments for groups they teach.
   - Developers retain full access to all teachers, groups, and assignments.

## Checklist
- 🟩 **Stage 1**: Backend updates:
  - `src/account-invites.mjs`:
    - Enforce creator assignment to group for `kind === 'teacher'`.
    - Make `email` optional for teacher invites.
    - Enable single-use redemption by existing authenticated `ADMIN` teachers without re-auth when email is not restricted.
    - Keep single-use (`uses: 1`) for new user registrations.
  - `src/account-group-teachers.mjs`:
    - Verified teacher permissions and assignments.
  - `src/learning-integrated-worker.mjs`:
    - In `/api/admin/users`, filter returned `ADMIN` users for an `ADMIN` actor so they only see themselves and co-teachers who share at least one group.
- 🟩 **Stage 2**: Frontend updates:
  - `client/10-admin.js`:
    - In `accountInviteHTML()` & `syncAccountInvite()`, allow creating teacher invites with optional email and single use.
    - Updated candidate and group selection.
  - `client/40-account.js`:
    - Added seamless 1-click confirmation dialog (`offerTeacherInvite`) for authenticated `ADMIN` teachers to join groups as co-teachers upon opening an invite link.
- 🟩 **Stage 3**: Rebuild preview scripts (`npm run build:preview`) and production assets.
- 🟩 **Stage 4**: Add automated tests for invite co-ownership and teacher isolation, and run `npm run check`.
- 🟩 **Stage 5**: Mark all checklist items `🟩` and provide English past-tense commit message.
