#!/usr/bin/env bash
set -euo pipefail
umask 077

DEPLOY_ROOT_INPUT="${HOME}/.assonam-deploy"
if [ -z "${DEPLOY_STAGE:-}" ] || [ ! -d "$DEPLOY_STAGE" ] \
  || [ -L "$DEPLOY_STAGE" ] || [ -L "$DEPLOY_ROOT_INPUT" ]; then
  echo "::error::Protected deployment stage is missing"
  exit 1
fi
DEPLOY_ROOT="$(realpath -e -- "$DEPLOY_ROOT_INPUT")"
DEPLOY_STAGE="$(realpath -e -- "$DEPLOY_STAGE")"
if [ "$(dirname -- "$DEPLOY_STAGE")" != "$DEPLOY_ROOT" ] \
  || [[ ! "$(basename -- "$DEPLOY_STAGE")" =~ ^run\.[A-Za-z0-9]{6}$ ]]; then
  echo "::error::Protected deployment stage is outside the allowed root"
  exit 1
fi

ENV_TMP=""
EVOLUTION_ENV_TMP=""

cleanup_deploy_stage() {
  if [ -n "$ENV_TMP" ]; then
    rm -f -- "$ENV_TMP"
  fi
  if [ -n "$EVOLUTION_ENV_TMP" ]; then
    rm -f -- "$EVOLUTION_ENV_TMP"
  fi
  rm -rf -- "$DEPLOY_STAGE"
}
trap cleanup_deploy_stage EXIT HUP INT TERM

exec 9>"$DEPLOY_ROOT/deploy.lock"
if ! flock -w 1200 9; then
  echo "::error::Timed out waiting for the production deployment lock"
  exit 1
fi
chmod 600 "$DEPLOY_ROOT/deploy.lock"
find "$DEPLOY_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'run.*' \
  -mmin +60 ! -samefile "$DEPLOY_STAGE" -exec rm -rf -- {} +

chmod 700 "$DEPLOY_STAGE"
for required_file in app.env control.env ghcr.token deploy_remote.sh; do
  candidate="$DEPLOY_STAGE/$required_file"
  if [ ! -f "$candidate" ] || [ -L "$candidate" ]; then
    echo "::error::Protected deployment file is missing or unsafe: $required_file"
    exit 1
  fi
  chmod 600 "$candidate"
done

APP_ENV_SOURCE="$DEPLOY_STAGE/app.env"
CONTROL_SOURCE="$DEPLOY_STAGE/control.env"
GHCR_TOKEN_SOURCE="$DEPLOY_STAGE/ghcr.token"

file_value() {
  key="$1"
  file="$2"
  awk -v wanted="$key" '
    index($0, wanted "=") == 1 { value = substr($0, length(wanted) + 2) }
    END { print value }
  ' "$file"
}

control_value() {
  file_value "$1" "$CONTROL_SOURCE"
}

dotenv_value() {
  file_value "$1" "$APP_ENV_SOURCE"
}

APP_PATH="$(control_value APP_PATH)"
BRANCH="$(control_value BRANCH)"
APP_RUNTIME_CHANGED="$(control_value APP_RUNTIME_CHANGED)"
RUNTIME_CONFIG_CHANGED="$(control_value RUNTIME_CONFIG_CHANGED)"
VIDEO_WORKER_CHANGED="$(control_value VIDEO_WORKER_CHANGED)"
EVOLUTION_CHANGED="$(control_value EVOLUTION_CHANGED)"
MIGRATE="$(control_value MIGRATE)"
WORKFLOW_EVENT="$(control_value WORKFLOW_EVENT)"
GHCR_USERNAME="$(control_value GHCR_USERNAME)"
DEPLOY_SHA="$(control_value GIT_SHA)"

if [ -z "$APP_PATH" ] || [ -z "$BRANCH" ] || [ -z "$GHCR_USERNAME" ] \
  || [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Deployment control metadata is incomplete"
  exit 1
fi
if ! git check-ref-format --branch "$BRANCH" >/dev/null 2>&1; then
  echo "::error::Deployment branch is not a valid Git branch"
  exit 1
fi

cd "$APP_PATH"
if [ ! -f docker-compose.yml ]; then
  echo "::error::docker-compose.yml not found in configured APP_PATH"
  exit 1
fi

export COMPOSE_PROJECT_NAME="app"
echo "[deploy] COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"

repair_git_permissions() {
  if [ ! -d .git ]; then
    return
  fi

  echo "[deploy] Checking persistent checkout permissions"
  df -h /
  df -ih /

  current_owner="$(id -u):$(id -g)"
  if [ "$(id -u)" = "0" ]; then
    chown -R "$current_owner" .git
  elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo chown -R "$current_owner" .git
  fi
  chmod -R u+rwX .git || true

  if [ ! -w .git/objects ]; then
    echo "::error::.git/objects is not writable by deploy user $(id -un)"
    stat -c '%U:%G %a %n' .git .git/objects || true
    exit 1
  fi

  first_unwritable_dir="$(find .git/objects -type d ! -writable -print -quit 2>/dev/null || true)"
  if [ -n "$first_unwritable_dir" ]; then
    echo "::error::Git object directory is not writable: $first_unwritable_dir"
    stat -c '%U:%G %a %n' "$first_unwritable_dir" || true
    exit 1
  fi
}

repair_git_permissions
git fetch --all
git fetch origin "$DEPLOY_SHA"

mkdir -p .git/info
if ! grep -qxF 'data/videos/' .git/info/exclude 2>/dev/null; then
  printf '\n# Runtime-generated welcome videos\n%s\n' 'data/videos/' >> .git/info/exclude
fi

if [ -n "$(git status --porcelain)" ]; then
  BACKUP_ROOT="${HOME}/deploy-backups/assonam"
  BACKUP_DIR="${BACKUP_ROOT}/$(date -u +'%Y%m%dT%H%M%SZ')"
  echo "[deploy] working tree dirty, archiving local changes to ${BACKUP_DIR}"
  mkdir -p "$BACKUP_DIR"
  git status --short > "$BACKUP_DIR/status.txt" || true
  git diff --binary > "$BACKUP_DIR/tracked.patch" || true
  git diff --cached --binary > "$BACKUP_DIR/staged.patch" || true
  UNTRACKED_FILES="$(git ls-files --others --exclude-standard)"
  if [ -n "$UNTRACKED_FILES" ]; then
    printf '%s\n' "$UNTRACKED_FILES" > "$BACKUP_DIR/untracked.txt"
    git ls-files --others --exclude-standard -z \
      | tar --null -T - -czf "$BACKUP_DIR/untracked.tar.gz"
  fi
fi

git reset --hard
git clean -fd -e data/videos/
git checkout -B "$BRANCH" "$DEPLOY_SHA"
git reset --hard "$DEPLOY_SHA"

ENV_TMP="$(mktemp .env.tmp.XXXXXX)"
if ! cp "$APP_ENV_SOURCE" "$ENV_TMP"; then
  rm -f "$ENV_TMP"
  echo "::error::Unable to stage the application environment"
  exit 1
fi
chmod 600 "$ENV_TMP"

EMAIL_TRANSPORT_VALUE="$(dotenv_value EMAIL_TRANSPORT | tr '[:upper:]' '[:lower:]')"
EMAIL_TRANSPORT_VALUE="${EMAIL_TRANSPORT_VALUE:-cloudflare_rest}"
CLOUDFLARE_ACCOUNT_ID_VALUE="$(dotenv_value CLOUDFLARE_ACCOUNT_ID)"
CLOUDFLARE_EMAIL_API_TOKEN_VALUE="$(dotenv_value CLOUDFLARE_EMAIL_API_TOKEN)"
SMTP_PASSWORD_VALUE="$(dotenv_value SMTP_PASSWORD)"
ENABLE_WHATSAPP="$(dotenv_value ENABLE_WHATSAPP)"
WHATSAPP_PROVIDER="$(dotenv_value WHATSAPP_PROVIDER)"
SUMUP_CREDENTIALS_ENCRYPTION_KEY_VALUE="$(dotenv_value SUMUP_CREDENTIALS_ENCRYPTION_KEY)"
ENABLE_WHATSAPP_EVOLUTION="$(dotenv_value ENABLE_WHATSAPP_EVOLUTION)"
EVOLUTION_API_KEY_PRESENT="$(dotenv_value EVOLUTION_API_KEY)"
AFFILIATION_VIDEO_WORKER_ENABLED="$(dotenv_value AFFILIATION_VIDEO_WORKER_ENABLED)"

if [ "$EMAIL_TRANSPORT_VALUE" = "cloudflare" ] || [ "$EMAIL_TRANSPORT_VALUE" = "cloudflare_rest" ]; then
  if [ -z "$CLOUDFLARE_ACCOUNT_ID_VALUE" ]; then
    echo "::error::Cloudflare email transport requires an account identifier"
    exit 1
  fi
  if [ -z "$CLOUDFLARE_EMAIL_API_TOKEN_VALUE" ] && [ -z "$SMTP_PASSWORD_VALUE" ]; then
    echo "::error::Cloudflare email transport requires an API credential"
    exit 1
  fi
fi
if [ "$ENABLE_WHATSAPP" = "true" ] && [ "$WHATSAPP_PROVIDER" = "green_api" ] \
  && [ -z "$SUMUP_CREDENTIALS_ENCRYPTION_KEY_VALUE" ]; then
  echo "::error::Green API requires the provider-token encryption key"
  exit 1
fi

APP_RUNTIME_ROLLOUT_NEEDED="false"
APP_RUNTIME_UP_FLAGS=""
if [ "$APP_RUNTIME_CHANGED" = "true" ] || [ "$RUNTIME_CONFIG_CHANGED" = "true" ] \
  || [ "$WORKFLOW_EVENT" = "workflow_dispatch" ]; then
  APP_RUNTIME_ROLLOUT_NEEDED="true"
fi
if [ "$WORKFLOW_EVENT" = "workflow_dispatch" ]; then
  APP_RUNTIME_UP_FLAGS="--force-recreate"
fi

COMPOSE_FILES="-f docker-compose.yml"
if [ -f docker-compose.prod.yml ] && [ -f secrets/google-wallet-sa.json ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.yml"
fi

if [ "$ENABLE_WHATSAPP_EVOLUTION" = "true" ]; then
  if [ -z "$EVOLUTION_API_KEY_PRESENT" ]; then
    echo "::error::Evolution is enabled but its API credential is empty"
    exit 1
  fi
  install -d -m 700 secrets
  EVOLUTION_ENV_TMP="$(mktemp secrets/evolution-api-lite.env.tmp.XXXXXX)"
  if ! python3 scripts/render_evolution_lite_env.py \
    --source-env "$APP_ENV_SOURCE" \
    --output "$EVOLUTION_ENV_TMP"; then
    rm -f "$EVOLUTION_ENV_TMP"
    exit 1
  fi
  chmod 600 "$EVOLUTION_ENV_TMP"
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.evolution-lite.yml"
fi

# Only replace active configuration after all validation and derived-file
# rendering has succeeded. Both temporary files live beside their targets.
mv -f "$ENV_TMP" .env
ENV_TMP=""
if [ "$ENABLE_WHATSAPP_EVOLUTION" = "true" ]; then
  mv -f "$EVOLUTION_ENV_TMP" secrets/evolution-api-lite.env
  EVOLUTION_ENV_TMP=""
else
  rm -f secrets/evolution-api-lite.env || true
fi

log_memory_snapshot() {
  label="$1"
  echo "[deploy] memory_snapshot label=${label} ts=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  free -m || true
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' || true
  ps -eo pid,ppid,rss,comm --sort=-rss | head -n 15 || true
}

wait_for_postgres() {
  echo "[deploy] Waiting for Postgres readiness (up to 60s)"
  for _attempt in $(seq 1 60); do
    if docker compose -f docker-compose.yml exec -T db pg_isready -U assonam -d assonam; then
      echo "[deploy] Postgres is ready"
      return 0
    fi
    sleep 1
  done
  echo "::error::Postgres did not become ready within 60s"
  exit 1
}

wait_for_service_ready() {
  compose_args="$1"
  service="$2"
  timeout_seconds="${3:-120}"
  elapsed=0
  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    cid="$(docker compose $COMPOSE_FILES $compose_args ps -q "$service" || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || true)"
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)"
      if [ "$health" = "healthy" ]; then
        echo "[deploy] ${service} healthy"
        return 0
      fi
      if [ "$health" = "none" ] && [ "$status" = "running" ]; then
        echo "[deploy] ${service} running"
        return 0
      fi
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "::error::${service} did not become ready within ${timeout_seconds}s"
  docker compose $COMPOSE_FILES $compose_args ps || true
  docker compose $COMPOSE_FILES $compose_args logs --tail=200 "$service" || true
  exit 1
}

ensure_evolution_database() {
  if [ "$ENABLE_WHATSAPP_EVOLUTION" != "true" ]; then
    return
  fi
  echo "[deploy] Ensuring PostgreSQL database evolution exists"
  docker compose $COMPOSE_FILES up -d db
  wait_for_postgres
  EVOLUTION_DB_EXISTS="$(
    docker compose -f docker-compose.yml exec -T db \
      psql -U assonam -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'evolution'"
  )"
  if [ "$EVOLUTION_DB_EXISTS" != "1" ]; then
    docker compose -f docker-compose.yml exec -T db \
      psql -U assonam -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE evolution"
  fi
}

echo "[deploy] change_flags app_runtime=${APP_RUNTIME_CHANGED} runtime_config=${RUNTIME_CONFIG_CHANGED} video_worker=${VIDEO_WORKER_CHANGED} evolution=${EVOLUTION_CHANGED}"
echo "[deploy] rollout_flags app_runtime=${APP_RUNTIME_ROLLOUT_NEEDED} migrate=${MIGRATE}"
log_memory_snapshot "before_db"

docker compose $COMPOSE_FILES up -d db
wait_for_postgres
ensure_evolution_database

docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin < "$GHCR_TOKEN_SOURCE"
log_memory_snapshot "after_db"

if [ "$MIGRATE" = "true" ]; then
  echo "[migrate] MIGRATE=true: starting Postgres service only"
  SQLITE_SOURCE="$(pwd)/data/app.db"
  if [ ! -f "$SQLITE_SOURCE" ]; then
    SQLITE_SOURCE="/opt/assonam/app/data/app.db"
  fi
  if [ ! -f "$SQLITE_SOURCE" ]; then
    echo "::error::SQLite source file not found"
    exit 1
  fi

  PGLOADER_FILE="$(mktemp "$DEPLOY_STAGE/pgloader.XXXXXX.load")"
  if ! python3 scripts/render_pgloader_load.py \
    --source-env "$APP_ENV_SOURCE" \
    --output "$PGLOADER_FILE"; then
    rm -f "$PGLOADER_FILE"
    exit 1
  fi
  chmod 600 "$PGLOADER_FILE"
  echo "[migrate] Running pgloader import on network app_default"
  docker run --rm \
    --network app_default \
    -v "$SQLITE_SOURCE:/tmp/app.db:ro" \
    -v "$PGLOADER_FILE:/run/secrets/migration.load:ro" \
    dimitri/pgloader:latest \
    pgloader /run/secrets/migration.load
  rm -f "$PGLOADER_FILE"
fi

if [ "$APP_RUNTIME_CHANGED" = "true" ]; then
  echo "[deploy] Pulling refreshed app-runtime image"
  docker compose $COMPOSE_FILES --profile ops pull web email-worker low-cards-worker file-deletion-worker whatsapp-webhook-worker migrate
  log_memory_snapshot "after_app_pull"
  echo "[deploy] Running Alembic migrations from pulled runtime image"
  docker compose $COMPOSE_FILES --profile ops run -T --rm --no-deps migrate </dev/null
  log_memory_snapshot "after_migrate"
fi

if [ "$APP_RUNTIME_ROLLOUT_NEEDED" = "true" ]; then
  echo "[deploy] Rolling out app-runtime services"
  docker compose $COMPOSE_FILES up -d --no-deps ${APP_RUNTIME_UP_FLAGS} web
  wait_for_service_ready "" web 120
  docker compose $COMPOSE_FILES up -d --no-deps ${APP_RUNTIME_UP_FLAGS} email-worker low-cards-worker file-deletion-worker whatsapp-webhook-worker
  wait_for_service_ready "" email-worker 120
  wait_for_service_ready "" low-cards-worker 120
  wait_for_service_ready "" file-deletion-worker 120
  wait_for_service_ready "" whatsapp-webhook-worker 120
  log_memory_snapshot "after_app_rollout"
else
  echo "[deploy] Skipping app-runtime rollout; no app image or compose changes detected."
fi

if [ "$AFFILIATION_VIDEO_WORKER_ENABLED" = "true" ] && [ "$VIDEO_WORKER_CHANGED" = "true" ]; then
  echo "[deploy] Pulling refreshed affiliation-video-worker image"
  docker compose $COMPOSE_FILES --profile video-worker pull affiliation-video-worker
  docker compose $COMPOSE_FILES --profile video-worker up -d --no-deps affiliation-video-worker
  log_memory_snapshot "after_video_rollout"
fi
if [ "$AFFILIATION_VIDEO_WORKER_ENABLED" = "true" ]; then
  wait_for_service_ready "--profile video-worker" affiliation-video-worker 120
fi

if [ "$ENABLE_WHATSAPP_EVOLUTION" = "true" ] && [ "$EVOLUTION_CHANGED" = "true" ]; then
  echo "[deploy] Pulling refreshed evolution-api image"
  docker compose $COMPOSE_FILES pull evolution-api
  docker compose $COMPOSE_FILES up -d --no-deps evolution-api
  log_memory_snapshot "after_evolution_rollout"
fi
if [ "$ENABLE_WHATSAPP_EVOLUTION" = "true" ]; then
  wait_for_service_ready "" evolution-api 180
  docker compose $COMPOSE_FILES exec -T web python -c "import json, os, urllib.request; root = urllib.request.urlopen('http://evolution-api:8080/', timeout=10); verify_req = urllib.request.Request('http://evolution-api:8080/verify-creds', method='POST', headers={'apikey': os.environ['EVOLUTION_API_KEY']}); verify = urllib.request.urlopen(verify_req, timeout=10); print(json.dumps({'root_status': root.status, 'verify_status': verify.status, 'verify_body': json.loads(verify.read().decode())}))"
fi

docker compose $COMPOSE_FILES ps
sleep 60
log_memory_snapshot "post_deploy_60s"
sleep 120
log_memory_snapshot "post_deploy_180s"

for required_service in db web email-worker low-cards-worker file-deletion-worker whatsapp-webhook-worker; do
  wait_for_service_ready "" "$required_service" 60
  required_cid="$(docker compose $COMPOSE_FILES ps -q "$required_service")"
  restart_count="$(docker inspect --format '{{.RestartCount}}' "$required_cid")"
  if [ "$restart_count" != "0" ]; then
    echo "::error::${required_service} restarted ${restart_count} times during canary"
    exit 1
  fi
done
if [ "$AFFILIATION_VIDEO_WORKER_ENABLED" = "true" ]; then
  wait_for_service_ready "--profile video-worker" affiliation-video-worker 60
  video_cid="$(docker compose $COMPOSE_FILES --profile video-worker ps -q affiliation-video-worker)"
  if [ "$(docker inspect --format '{{.RestartCount}}' "$video_cid")" != "0" ]; then
    echo "::error::affiliation-video-worker restarted during canary"
    exit 1
  fi
fi
if [ "$ENABLE_WHATSAPP_EVOLUTION" = "true" ]; then
  wait_for_service_ready "" evolution-api 60
  evolution_cid="$(docker compose $COMPOSE_FILES ps -q evolution-api)"
  if [ "$(docker inspect --format '{{.RestartCount}}' "$evolution_cid")" != "0" ]; then
    echo "::error::evolution-api restarted during canary"
    exit 1
  fi
fi

docker compose $COMPOSE_FILES exec -T web python -c \
  "import urllib.request; response = urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=10); assert response.status == 200"
current_revision="$(docker compose $COMPOSE_FILES exec -T web alembic current | awk 'NF {print $1}' | tail -n 1 | tr -d '\r')"
head_revision="$(docker compose $COMPOSE_FILES exec -T web alembic heads | awk 'NF {print $1}' | tail -n 1 | tr -d '\r')"
if [ -z "$current_revision" ] || [ "$current_revision" != "$head_revision" ]; then
  echo "::error::Database revision does not match the application Alembic head"
  exit 1
fi
echo "[deploy] Final canary passed: services stable, health 200, Alembic at head"
