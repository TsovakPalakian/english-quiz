# Working Preferences

- Before editing code, briefly state your understanding in Russian.
- Keep replies concise and changes scoped. List additional affected functionality and material limitations.
- Before every implementation, including small fixes, create a Russian Markdown checklist in docs/change-history/ named YYYY-MM-DD-short-topic.md. For continued work on the same task, update its existing document instead of duplicating it. Scale the document to the task: record requirements, scoped steps, verification and outcome; distinguish prototypes from implemented behavior. Mark items done only after verification, record deployment versions when published, and retain documents as project history. Do not include secrets or private account data. Explanations without changes do not require a checklist.
- Before every deployment, give the user a short commit-message line in English and past tense, such as "Added ..." or "Fixed ...".
- Deploy authorized completed changes using the root wrangler.toml and the production asset builder.
- The production builder reads HTML/CSS from site/ and private inline media from private/ (untracked); verify new UI is included in the generated production assets.
- Never commit or push; the user does that.
- Right after each publication, mark the stage done in docs/change-history/refactoring-plan.md with the commit (if any) and the deployment version.
- Edit site JavaScript only in client/; root preview.js is generated from client/*.js by `npm run build:preview` and is never edited by hand.
- Edit chat JavaScript only in production/chat/; production/chat.js is generated from production/chat/*.js by the same command and is never edited by hand.
