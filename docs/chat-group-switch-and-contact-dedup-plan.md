# Plan: Chat Group Restrictions Segmented Toggle and Contact Deduplication

> [!WARNING]
> **Scope Isolation and Collateral Protection Warning**
> Strictly forbid touching or modifying any functionality unrelated to the scoped chat dialog changes. Tasks must strictly touch only their designated functional scope: the contact list deduplication in chat chooser/group creation dialogs and the styling and markup of group restriction toggles.

## Approved Mockups and Design

### Approved Group Creation Dialog (Sky Theme)
![Approved Group Creation Mockup](/Users/tsovakpalakian/.gemini/antigravity/brain/b1dfd291-d26c-48ee-8ba4-bf4cfbc40872/mockup-sky-row-dedup.png)

### Approved New Chat Dialog with Deduplicated Contacts (Sky Theme)
![Approved New Chat Mockup](/Users/tsovakpalakian/.gemini/antigravity/brain/b1dfd291-d26c-48ee-8ba4-bf4cfbc40872/newchat-sky-dedup.png)

### Approved Dark Theme Verification
![Approved Dark Theme Mockup](/Users/tsovakpalakian/.gemini/antigravity/brain/b1dfd291-d26c-48ee-8ba4-bf4cfbc40872/mockup-dark-dedup.png)

### Approved Peach Theme Verification
![Approved Peach Theme Mockup](/Users/tsovakpalakian/.gemini/antigravity/brain/b1dfd291-d26c-48ee-8ba4-bf4cfbc40872/mockup-peach-dedup.png)

## Implementation Stages

1. **Stage 1: Contact Deduplication and Role Preservation**
   - Normalize contact keys with `String(p.id)` when aggregating contacts and direct rooms in chat dialogs.
   - Preserve directory roles (`Teacher`, `Student`, `Support`) instead of demoting existing contacts to generic `Contact` role.

2. **Stage 2: Segmented Switch Toggle for Group Restrictions**
   - Update markup in group creation dialog to render compact setting rows with a 2-segment switcher (`Everyone` | `Admins only`).
   - Retain semantic radio buttons under the hood for accessibility and backward compatibility with `FormData`.
   - Add responsive CSS styles using `--acc`, `--acc-s`, `--card`, `--line`, `--mute`, and `--ink` theme variables.

3. **Stage 3: Production Asset Rebuild**
   - Rebuild preview and production chat assets with `npm run build:preview`.

4. **Stage 4: Automated and Visual Testing**
   - Add end-to-end integration and visual verification tests covering contact deduplication, toggle interactions, and group creation form submission.

## Checklist

- 🟩 Stage 1: Implement contact deduplication and role preservation in chat dialogs
- 🟩 Stage 2: Add segmented switch toggle markup and CSS in chat dialogs
- 🟩 Stage 3: Rebuild production chat assets
- 🟩 Stage 4: Add and run automated test suite verifying deduplication and toggle functionality
