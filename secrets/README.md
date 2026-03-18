# Secrets (DO NOT COMMIT CREDENTIALS)

Place local/server-only secrets in this folder.

Google Wallet service account JSON:
- Example filename: `google-wallet-sa.json`
- Recommended local path (repo root): `secrets/google-wallet-sa.json`
- This file must never be committed to git.

Evolution API Lite runtime env:
- Example filename: `evolution-api-lite.env`
- Recommended server path (repo root): `secrets/evolution-api-lite.env`
- This file is generated at deploy time and must contain only:
- `SERVER_PORT`
- `SERVER_URL`
- `DATABASE_PROVIDER`
- `DATABASE_CONNECTION_URI`
- `AUTHENTICATION_API_KEY`

Runtime configuration (preferred):
- Set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute/container path of the JSON file.

Fallback configuration:
- Set `GOOGLE_WALLET_SA_B64` with the base64-encoded JSON content.

Examples:
- Windows local: `C:\\path\\to\\project\\secrets\\google-wallet-sa.json`
- Linux server: `/opt/assonam/secrets/google-wallet-sa.json`
