# Wallet + Email Flow (Post-Verifica Socio)

## Obiettivo
Quando un socio viene approvato/verificato e ha tessera attiva, il sistema invia una sola volta una email "tessera pronta" con:

- accesso area riservata (login/magic-link secondo il flusso)
- CTA `Aggiungi a Google Wallet (Android)` tramite pagina handoff frontend
- link tessera (PDF / area riservata)
- link area documenti/statuto

## Trigger backend

Il trigger idempotente usa `members.card_delivered_at` (e fallback storico `card_email_sent_at`) e viene richiamato dai flussi di approvazione documenti / attivazione socio.

Service:

- `app/services/member_card_delivery.py`

## Handoff Google Wallet (frontend)

URL pubblico usato nelle email:

- `/wallet/google/add`

Comportamento:

1. prova subito a chiamare `POST /api/me/wallet/google/save-link`
2. se il socio è autenticato -> redirect a `https://pay.google.com/gp/v/save/...`
3. se non autenticato -> mostra CTA login + invio magic-link via email (riuso `POST /api/auth/login` senza password)

## URL usati nell'email

- Area riservata/login o magic-link (in base al contesto del trigger)
- Google Wallet handoff: `/wallet/google/add?email=<email>`
- Tessera area riservata: `/dashboard`
- Documenti/statuto: `/dashboard/documenti`

## Variabili env richieste (Wallet)

- `GOOGLE_WALLET_ISSUER_ID`
- `GOOGLE_APPLICATION_CREDENTIALS` (path file JSON service account) **oppure**
- `GOOGLE_WALLET_SA_B64` (base64 dell'intero JSON)

Riferimento setup completo:

- `docs/GOOGLE_WALLET.md`

## Note operative

- In locale, se `BASE_URL`/`FRONTEND_URL` puntano a `localhost`, il pass Google Wallet viene creato senza logo (Google rifiuta immagini non pubblicamente raggiungibili).
- In produzione impostare URL pubblici HTTPS per branding completo nel pass.
- Nessun secret va committato: usare `secrets/` gitignored o secret manager / GitHub Secrets.
