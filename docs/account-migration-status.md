# Cloudflare Migration Status

The application is active in personal account 42a9ebe47d529e3664b914aaf0813a21:
https://lumiscia.org

Educational data was migrated into learn-english-study
(dd640d1f-abbe-4236-8741-5638e89d890f), separate from authentication DB
e2739e2e-6693-4cc8-8054-d90173b032c0. All imported rows, rowids, foreign keys
and sequences were verified. Developer access and chat encryption were preserved.

The retired provider integration has been removed; modules, scripts, assets and
schema directories use neutral names. The root deployment configuration is the
only supported production configuration. A new database epoch invalidates old
browser caches and pending requests after publication.

Fresh educational and authentication D1 exports were created before retirement.
The educational export was restored locally and checked for broken references.
Private recovery archives remain outside the project; Git history is unchanged.
East Tarsal account deletion is not part of this operation.

422 focused local regression tests passed before final publication. Production
verification is limited to active database context and secret removal, not a
browser, login, chat-send or exam-submission suite.

Final deployment: dc8d7a98-9851-4179-abc2-cbc1be8c7e04. Active epoch: d1:3.
Removed three retired remote databases, three obsolete test Workers, ten old
connection secrets, and the unused remote SQLite SDK. Production database IDs,
chat object names, R2 paths and encryption keys were not changed.

Recovery archive: /Users/tsovakpalakian/Downloads/english-quiz-backups/provider-removal-20261017.
