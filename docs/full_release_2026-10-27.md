# Full portal release — 27 October 2026

Scope authorized by the owner: publish all previously approved membership/authentication, reliability, temporary membership, Wallet, performance and UI/UX changes, the receipt reconciliation and member bulk features, and manual attendance through member search. Preserve card branding. Main remains the working and release branch.

## Pre-release verification

- Local backend suite: **951 passed, 13 skipped**; frontend: **129 passed in 34 files**. TypeScript/Vite/PWA production build and Python compileall passed.
- PostgreSQL 16, isolated `stock_tests` database with UUID schemas: **35 passed**, including initial/renewal checkout reservations, shared numbering domains, credential races, temporary purchases, competing receipt allocations, idempotent reconciliation and concurrent bulk preview/execution. A separate purge/bulk lock-order regression passed in both numbering domains (**2 passed**).
- Full production backup restored into a separate database; all six migrations applied successfully from `9d5e7a31c802` to `20261026_06_member_bulk`. Exact-head startup validation passed; **344 Wallet passes and 344 jobs** backfilled. No test worker sends or real payments occurred.
- Live provider checks were read-only: Google Wallet credentials/token refresh and existing class read HTTP200; Cloudflare email token active and 254 recent messages with provider IDs; SumUp merchant read succeeded for the configured active association. Another association has SumUp enabled without credentials and is correctly unavailable for online payment; no configuration was invented or changed. One pre-existing failed email remains outside the release verification and was not resent.
- Cloudflare token validation uses the documented read-only [Verify Token endpoint](https://developers.cloudflare.com/api/resources/user/), without sending an email.
- Production disk preflight: 43% used, approximately21GB free; services healthy. A fresh protected custom-format database backup is recorded in the private release evidence; pg_restore catalog and restore were verified. Production data and secrets are not included in Git.
- Final source and staged artifact checks exclude local databases, reports/exports, logs, credentials and other output artifacts. Whitespace and encoding checks passed.

## Blockers corrected during release review

1. The temporary-membership Alembic revision exceeded PostgreSQL's default32-character version column. Shortened the unpublished revision to `20261017_02_temporary`, updated its successor, and added a revision-length regression.
2. Detached receipt allocations retained a textual target containing a purged profile ID. Projection reads now require the current member identity too, preventing orphaned money from completing a replacement member's quota after ID reuse. Three regression scenarios cover annual and temporary purchases.
3. Permanent member purge now takes profile locks in ID order before detaching bulk outcome references, matching bulk execution's profile-before-outcome lock order. The real PostgreSQL regression proves an outcome update can finish while purge waits for its profile.
4. Docker's PNG exclusion would omit the protected card/Wallet assets. Application/public PNG assets are explicitly included; an actual Docker context COPY check succeeded for both Golden Age files.

## Rollout and rollback

Deploy uses the existing Main push workflow, immutable image tags, migration service, health checks and final canary. The new Google Wallet synchronization worker is included in pull/start/health/canary alongside the existing workers.

Authentication migration intentionally preserves revocation and rejects downgrade. Prefer roll-forward for a code issue. A database restore requires coordinated writer suspension and the verified backup; do not use an automatic Alembic downgrade as rollback.

Release identity, workflow result and post-deploy checks will be recorded after the rollout completes.

## Verification limits

Read-only checks prove configured provider authentication/access and existing transport operation, not a newly delivered test email or a new financial transaction. Browser QA uses synthetic accounts/data for write scenarios. Physical Safari/iOS and real cameras are not available in this environment. Historical receipts without authoritative links require manual reconciliation. No changes to the excluded WhatsApp/Pienissimo webhook, legacy `/api/join/continue`, CI or general dependency upgrades are part of this release.
