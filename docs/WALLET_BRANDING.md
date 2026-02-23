# Google Wallet Branding per Associazione

## Obiettivo

Personalizzare l'aspetto della tessera Google Wallet (Android) per singola associazione usando:

- logo
- hero image (immagine larga)
- colore di sfondo
- titolo card (override opzionale)

Nota: Google Wallet non supporta layout HTML/CSS libero. La personalizzazione avviene via payload `genericObject` e (opzionalmente) `genericClass`.

## Campi Organization (DB)

Sono disponibili su `organizations`:

- `wallet_bg_color` (es. `#0F2B5B`)
- `wallet_logo_url`
- `wallet_hero_image_url`
- `wallet_title_override`
- `wallet_is_test_prefix` (prefisso demo app-level solo se `WALLET_DEMO_MODE=true`)

## Upload asset (Org Admin)

Endpoint:

- `POST /api/org-admin/organization/wallet-assets`

Form-data supportato:

- `logo` (PNG/JPG/SVG, max 2 MB)
- `hero_image` (PNG/JPG, max 2 MB)

Storage:

- `data/uploads/org/{org_id}/wallet/...`

URL salvati:

- `/uploads/org/{org_id}/wallet/...`

## Serving static `/uploads`

FastAPI ora espone direttamente:

- `/uploads/*` -> `settings.UPLOAD_DIR`

In produzione con Nginx e' consigliato servire i file statici direttamente da Nginx (vedi snippet in `ops/nginx/assonam-uploads-static.conf.example`).

## Golden Age (oasi-2)

Fallback automatici configurati per `slug = oasi-2`:

- logo: `/static/card-logos/oasi-2.png`
- hero image: `/static/wallet-heroes/oasi-2-hero.png`
- titolo: `Golden Age Club - Speakeasy`
- bg color: `#0B3C75`

Questo permette di avere un branding Wallet sensato anche senza upload manuale iniziale.

## Variabili env rilevanti

- `GOOGLE_WALLET_ISSUER_ID`
- `GOOGLE_APPLICATION_CREDENTIALS` oppure `GOOGLE_WALLET_SA_B64`
- `BASE_URL` (deve essere URL pubblico, preferibilmente `https://...`, per generare URL immagini validi)
- `FRONTEND_URL` (usata per link area riservata)
- `WALLET_DEMO_MODE=true|false` (prefisso demo app-level solo se `wallet_is_test_prefix=true`)

## Nota su "[SOLO TEST]"

Google Wallet puo mostrare un badge/etichetta di test lato Google quando issuer/class sono in review o non pubblicati.
Questa etichetta non dipende dal codice ASSONAM e non si rimuove via `wallet_is_test_prefix`.

`wallet_is_test_prefix` controlla solo un prefisso visibile gestito dall'app (`[SOLO TEST] ...`) e viene applicato solo con `WALLET_DEMO_MODE=true`.

## Manual test plan

1. Apri `Org Admin -> Associazione -> Google Wallet Branding`
2. Imposta colore + titolo (opzionale) e salva
3. Carica logo e hero image
4. Apri i link "Apri immagine" e verifica che rispondano su URL pubblico
5. Da area socio, clicca `Aggiungi a Google Wallet`
6. Verifica in Wallet:
   - logo corretto
   - hero image presente
   - colore di sfondo corretto
   - titolo e testi (Associazione / Stato / Validita)
   - QR di verifica funzionante
