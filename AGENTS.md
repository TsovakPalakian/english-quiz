# Working Preferences

- Before editing code, briefly state your understanding in Russian.
- Keep replies concise and changes scoped. List additional affected functionality and material limitations.
- Before every deployment, give the user a short commit-message line in English and past tense, such as "Added ..." or "Fixed ...".
- Deploy authorized completed changes using the root wrangler.toml and the production asset builder.
- The production builder reads HTML/CSS from site/ and private inline media from private/ (untracked); verify new UI is included in the generated production assets.
- Never commit or push; the user does that.
- Right after each publication, mark the stage done in docs/refactoring-plan.md with the commit (if any) and the deployment version.
- Edit site JavaScript only in client/; root preview.js is generated from client/*.js by `npm run build:preview` and is never edited by hand.
- Edit chat JavaScript only in production/chat/; production/chat.js is generated from production/chat/*.js by the same command and is never edited by hand.
