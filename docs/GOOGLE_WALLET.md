# Google Wallet (Android) - Setup operativo ASSONAM

Implementazione `Save to Google Wallet` tramite **service account** Google Cloud (no OAuth utente, no consent screen).

## Prerequisiti

- Google Wallet API abilitata sul progetto GCP
- Service account creato e autorizzato per Wallet Objects / issuer
- `issuerId` Google Wallet disponibile
- Backend ASSONAM aggiornato con questa feature

## Variabili env richieste

- `GOOGLE_WALLET_ISSUER_ID` (obbligatoria)
- Una delle due credenziali:
  - `GOOGLE_APPLICATION_CREDENTIALS` (preferita: path file JSON)
  - `GOOGLE_WALLET_SA_B64` (fallback: JSON base64)

Variabile opzionale:
- `GOOGLE_WALLET_HTTP_TIMEOUT_SECONDS` (default `15`)

## Credenziali in locale (metodo consigliato: file)

1. Copia il JSON del service account in una cartella locale non tracciata da git:
   - `secrets/google-wallet-sa.json`
2. Imposta la variabile:
   - Linux/macOS:
     - `export GOOGLE_APPLICATION_CREDENTIALS="$PWD/secrets/google-wallet-sa.json"`
   - Windows PowerShell:
     - `$env:GOOGLE_APPLICATION_CREDENTIALS = \"$PWD\\secrets\\google-wallet-sa.json\"`
3. Imposta issuer:
   - `export GOOGLE_WALLET_ISSUER_ID=YOUR_ISSUER_ID`

Nota:
- `secrets/` è gitignored. Non committare mai il file JSON.

## Fallback credenziali via ENV base64

Usare solo se il provider non supporta mount/secret file.

### Generare base64

- Linux:
  - `base64 -w 0 secrets/google-wallet-sa.json`
- Windows PowerShell:
  - `[Convert]::ToBase64String([IO.File]::ReadAllBytes(\"secrets\\google-wallet-sa.json\"))`

### Impostare ENV

- `GOOGLE_WALLET_SA_B64=<output base64>`
- `GOOGLE_WALLET_ISSUER_ID=<issuer id>`

## Produzione (Hetzner + Docker) - modalità preferita

### 1) Copia credenziale sul server (fuori dal repo Git)

Esempio:
- `/opt/assonam/secrets/google-wallet-sa.json`

### 2) Posiziona il file nella directory deployment (o usa bind mount assoluto)

Se il progetto è deployato in `/opt/assonam/app`:
- puoi montare `./secrets/google-wallet-sa.json` dal progetto
- oppure montare direttamente il path assoluto server (adatta il compose)

### 3) Usa overlay `docker-compose.prod.yml`

File incluso nel repo:
- `docker-compose.prod.yml`

Esegue mount read-only del secret:
- host: `./secrets/google-wallet-sa.json`
- container: `/run/secrets/google_wallet_sa.json`

E imposta:
- `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google_wallet_sa.json`

### 4) Avvio

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

## Endpoint applicativo

Socio autenticato:
- `POST /api/me/wallet/google/save-link`

Risposta:
- `{ "url": "...", "classId": "...", "objectId": "..." }`

Frontend area socio:
- bottone `Aggiungi a Google Wallet` (solo Android / Google Wallet)

## Sicurezza e controlli

- Il JSON service account **non deve** stare nel repo
- `secrets/` è gitignored (`.gitignore`)
- I log backend non stampano chiavi private/JWT completi
- In caso errore Google API vengono loggati solo status code + body troncato

Controlli rapidi:

- `git status --short` (verificare che il JSON non compaia)
- `git check-ignore -v secrets/google-wallet-sa.json`

## Troubleshooting

### 401 / 403 da Google Wallet API

Cause tipiche:
- service account non autorizzato sull'issuer
- issuerId errato
- Wallet API non abilitata

### 404 GenericClass / GenericObject

Cause tipiche:
- class/object non ancora creati
- ID costruito in modo diverso tra ambienti

Nota:
- il backend esegue `ensure` (create se manca, patch object se esiste)

### invalid JWT / save link non valido

Cause tipiche:
- chiave service account non valida
- clock skew del server
- JWT firmato con credenziale sbagliata

### Errore config lato backend

Messaggi attesi:
- `Missing GOOGLE_WALLET_ISSUER_ID`
- `Google Wallet credentials not configured...`

## Nota finale

- Questa integrazione usa **solo** service account flow
- Nessun OAuth client utente
- Nessun Apple Wallet in questa implementazione
