# SQLite to PostgreSQL Migration (Safe / Reversible)

This project keeps SQLite support. PostgreSQL is enabled as an alternative via `DATABASE_URL`.

Do not delete the SQLite database file. Rollback is done by switching `DATABASE_URL` back to SQLite.

## 1. Preconditions (Production Safety)

- Schedule a maintenance window (freeze writes during the final cutover).
- Confirm current app is healthy on SQLite before migration.
- Keep the SQLite file untouched after backup and after cutover.
- Do not run destructive SQL (`DROP TABLE`, `TRUNCATE`, `DELETE`) during migration.

## 2. Backup SQLite (Required)

SQLite file paths used by this project:

- Local dev: `./data/app.db`
- Docker container default: `/app/data/app.db`

PowerShell (recommended on Windows):

```powershell
New-Item -ItemType Directory -Force -Path .\backups | Out-Null
Copy-Item .\data\app.db .\backups\app.db.pre-postgres-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak
```

Bash:

```bash
mkdir -p backups
cp ./data/app.db "./backups/app.db.pre-postgres-$(date +%Y%m%d-%H%M%S).bak"
```

Optional integrity check before migration:

```bash
sqlite3 ./data/app.db "PRAGMA integrity_check;"
```

## 3. Start PostgreSQL (Docker Compose)

Set a strong password and start services:

```powershell
$env:POSTGRES_PASSWORD = "REPLACE_ME_STRONG_PASSWORD"
docker compose up -d db
```

PostgreSQL connection URL for this compose service:

```text
postgresql+psycopg2://assonam:${POSTGRES_PASSWORD}@db:5432/assonam
```

## 4. Migrate Data with pgloader (Documented Command)

Run `pgloader` from a machine/container that can reach the `db` hostname on the Compose network.

Example command:

```bash
pgloader sqlite:////app/data/app.db postgresql://assonam:${POSTGRES_PASSWORD}@db:5432/assonam
```

Notes:

- If running `pgloader` from the host (not inside the Compose network), use a reachable Postgres host/port (for example `localhost`) instead of `db`.
- Test this command first against a copy of the SQLite file or a staging environment.
- `pgloader` copies schema + data; it does not delete your SQLite source file.

## 5. Switch the Application to PostgreSQL

Set `DATABASE_URL` to PostgreSQL and restart `web`:

```powershell
$env:DATABASE_URL = "postgresql+psycopg2://assonam:$env:POSTGRES_PASSWORD@db:5432/assonam"
docker compose up -d web
```

SQLite mode (rollback/default) value:

```text
sqlite:///./data/app.db
```

Container SQLite path (compose default when `DATABASE_URL` is unset):

```text
sqlite:////app/data/app.db
```

## 6. Verify Which DB the App Is Using (Non-Destructive)

```bash
python scripts/check_db.py
```

Expected:

- SQLite: `engine.dialect.name=sqlite`
- Postgres: `engine.dialect.name=postgresql`

This script prints config only; it does not modify schema or data.

## 7. Verification Checklist (Row Counts)

Compare row counts between SQLite and PostgreSQL for key tables before enabling writes on Postgres.

SQLite:

```bash
sqlite3 ./data/app.db "SELECT 'organizations', COUNT(*) FROM organizations;"
sqlite3 ./data/app.db "SELECT 'admin_users', COUNT(*) FROM admin_users;"
sqlite3 ./data/app.db "SELECT 'members', COUNT(*) FROM members;"
sqlite3 ./data/app.db "SELECT 'member_documents', COUNT(*) FROM member_documents;"
sqlite3 ./data/app.db "SELECT 'member_payments', COUNT(*) FROM member_payments;"
sqlite3 ./data/app.db "SELECT 'card_batches', COUNT(*) FROM card_batches;"
sqlite3 ./data/app.db "SELECT 'integration_api_keys', COUNT(*) FROM integration_api_keys;"
sqlite3 ./data/app.db "SELECT 'tokens', COUNT(*) FROM tokens;"
sqlite3 ./data/app.db "SELECT 'operation_logs', COUNT(*) FROM operation_logs;"
```

PostgreSQL (using the Compose `db` container, no port publish required):

```bash
docker compose exec db psql -U assonam -d assonam -c "SELECT 'organizations', COUNT(*) FROM organizations;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'admin_users', COUNT(*) FROM admin_users;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'members', COUNT(*) FROM members;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'member_documents', COUNT(*) FROM member_documents;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'member_payments', COUNT(*) FROM member_payments;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'card_batches', COUNT(*) FROM card_batches;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'integration_api_keys', COUNT(*) FROM integration_api_keys;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'tokens', COUNT(*) FROM tokens;"
docker compose exec db psql -U assonam -d assonam -c "SELECT 'operation_logs', COUNT(*) FROM operation_logs;"
```

Additional recommended checks:

- Spot-check recent members and admin users by email.
- Confirm application login and one read-only page load.
- Confirm no startup errors in `docker compose logs web`.

## 8. Rollback (Immediate, Safe)

Rollback does not require deleting PostgreSQL data.

1. Stop writes / maintenance mode.
2. Set `DATABASE_URL` back to SQLite (`sqlite:///./data/app.db` locally, or unset `DATABASE_URL` in Compose to use `sqlite:////app/data/app.db` default).
3. Restart the `web` service.
4. Run `python scripts/check_db.py` and confirm `engine.dialect.name=sqlite`.
5. Verify application login and key row counts on SQLite.

## 9. Explicit Safety Rules

- Do not delete `./data/app.db`.
- Do not run `DROP TABLE` or `alembic downgrade` as part of this migration.
- Keep PostgreSQL cutover reversible until production verification is complete.
