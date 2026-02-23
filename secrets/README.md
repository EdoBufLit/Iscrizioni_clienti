# Secrets (DO NOT COMMIT CREDENTIALS)

Place local/server-only secrets in this folder.

Google Wallet service account JSON:
- Example filename: `google-wallet-sa.json`
- Recommended local path (repo root): `secrets/google-wallet-sa.json`
- This file must never be committed to git.

Runtime configuration (preferred):
- Set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute/container path of the JSON file.

Fallback configuration:
- Set `GOOGLE_WALLET_SA_B64` with the base64-encoded JSON content.

Examples:
- Windows local: `C:\\path\\to\\project\\secrets\\google-wallet-sa.json`
- Linux server: `/opt/assonam/secrets/google-wallet-sa.json`
