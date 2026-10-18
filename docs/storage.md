# Application Storage

- Production: https://learn-english.tsovakpalakian.workers.dev
- Educational data: Cloudflare D1, binding STUDY_DB, database learn-english-study.
- Accounts and authentication: separate Cloudflare D1, binding DB.
- Chat: existing SQLite Durable Objects; object names and encryption keys retained.
- Files: existing R2 buckets and object paths, unchanged.
- Optional PostgreSQL provider: Neon; server-controlled selection, no fallback.
- The remote SQLite HTTP driver, credentials, dependencies and deployment tools
  have been removed. Application modules and browser APIs use Learning naming.
- Production entry: src/learning-production-worker.mjs.
- Builder: node ops/build-learning-production-assets.mjs.
- HTML/CSS source: site/ (tracked); private inline media: private/ (untracked,
  back it up separately); generated assets: rollback/production-assets.
  Deploy only with root wrangler.toml.
- Local tests cover D1 transactions, receipts, encryption, Accounts, groups,
  lessons, exams, personal data, media, browser state and renamed module imports.
- Private recovery archives are stored outside the repository. Git history is
  retained. Neither is an active provider connection.
