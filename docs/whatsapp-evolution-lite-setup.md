# WhatsApp Evolution Lite Setup

## Scope

Questo setup aggiunge **Evolution API Lite** come servizio Docker separato nello stack ASSONAM, senza Redis, senza subdominio dedicato e senza HTTPS dedicato.

Scelte fissate:

- Evolution API Lite ufficiale: `atendai/evolution-api-lite:latest`
- servizio Docker interno: `evolution-api`
- porta interna Evolution: `8080`
- `SERVER_URL=http://localhost:8080`
- `EVOLUTION_API_BASE_URL=http://evolution-api:8080`
- database PostgreSQL separato: `evolution`
- ASSONAM resta source of truth applicativa

## File toccati

- `docker-compose.yml`
- `docker-compose.evolution-lite.yml`
- `.github/workflows/deploy-hetzner.yml`
- `app/config.py`
- `ENV_REQUIRED.md`
- `secrets/README.md`
- `scripts/render_evolution_lite_env.py`

## Secret GitHub da aggiungere manualmente

Se vuoi che i futuri deploy via GitHub Actions continuino a portare su Evolution Lite automaticamente, aggiungi questi secret nel repository:

- `EVOLUTION_API_KEY`
  Deve essere una chiave lunga/random e viene riusata sia da ASSONAM sia da Evolution Lite.
- `ENABLE_WHATSAPP_EVOLUTION`
  Imposta `true` per includere il servizio Evolution Lite nel deploy workflow.

Non serve un secret dedicato per `EVOLUTION_API_BASE_URL`: il workflow usa direttamente `http://evolution-api:8080`.

## Valori che devono coincidere

- `EVOLUTION_API_KEY` lato ASSONAM deve coincidere con `AUTHENTICATION_API_KEY` lato Evolution Lite.
- `EVOLUTION_API_BASE_URL` lato ASSONAM deve puntare al nome del servizio Docker Evolution: `http://evolution-api:8080`.
- `DATABASE_CONNECTION_URI` lato Evolution Lite deve usare lo stesso host/utente/password del `DATABASE_URL` ASSONAM, ma con database finale `evolution`.
- `SERVER_PORT` e `SERVER_URL` lato Evolution Lite devono restare coerenti tra loro: `8080` e `http://localhost:8080`.

## Cosa fa il deploy

Il workflow aggiornato:

- continua a generare `.env` per ASSONAM
- aggiunge a `.env` solo queste variabili ASSONAM:
- `ENABLE_WHATSAPP_EVOLUTION`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- quando `ENABLE_WHATSAPP_EVOLUTION=true` e `EVOLUTION_API_KEY` e valorizzata:
- crea `secrets/evolution-api-lite.env`
- genera il file con sole 5 env Evolution richieste
- assicura che il database `evolution` esista su Postgres
- include `docker-compose.evolution-lite.yml` nel deploy
- verifica health del container Evolution Lite
- verifica da dentro il container `web` che:
- `GET http://evolution-api:8080/`
- `POST http://evolution-api:8080/verify-creds`

Nota tecnica importante:

- l'immagine ufficiale Evolution API Lite, in modalita Docker, richiede internamente anche `DATABASE_URL` e `SERVER_TYPE`
- per rispettare il vincolo di usare solo le 5 env esterne richieste, il compose le deriva internamente via `entrypoint` da `DATABASE_CONNECTION_URI` e default `http`
- non serve quindi aggiungere nuove env lato GitHub Secrets o lato file `evolution-api-lite.env`

## Cosa ho fatto sul server Hetzner

Intervento operativo eseguito sul server `157.90.31.105`:

- verificato stack attuale in `/opt/assonam/app`
- verificato branch deployato e container attivi
- creato o verificato il database PostgreSQL `evolution`
- creato `secrets/evolution-api-lite.env` con le sole 5 env minime
- aggiornato `.env` runtime ASSONAM con le 3 env lato app
- deployato lo stack con overlay `docker-compose.evolution-lite.yml`
- controllato stato container, log e reachability interna
- corretto il bootstrap dell'immagine Lite dopo tre errori reali emersi in sequenza:
- `DATABASE_PROVIDER` non disponibile nello shell env iniziale
- `DATABASE_URL` non esportato per `deploy_database.sh`
- `SERVER_TYPE` sovrascritto a `undefined` in modalita Docker
- risultato finale verificato: `app-evolution-api-1` in stato `healthy`, root endpoint `200`, `verify-creds` `200`

## Come verificare che Evolution Lite sia attiva

Controlli minimi sul server:

```bash
cd /opt/assonam/app
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.evolution-lite.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.evolution-lite.yml logs --tail=200 evolution-api
```

Check root endpoint interno:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.evolution-lite.yml exec -T web \
  python -c "import urllib.request; print(urllib.request.urlopen('http://evolution-api:8080/', timeout=10).read().decode())"
```

Check credenziali condivise ASSONAM -> Evolution Lite:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.evolution-lite.yml exec -T web \
  python -c "import json, os, urllib.request; req = urllib.request.Request('http://evolution-api:8080/verify-creds', method='POST', headers={'apikey': os.environ['EVOLUTION_API_KEY']}); print(json.dumps(json.loads(urllib.request.urlopen(req, timeout=10).read().decode()), indent=2))"
```

Risultato atteso:

- container `evolution-api` in stato `healthy`
- root endpoint con messaggio `Welcome to the Evolution API, it is working!`
- `verify-creds` con `Credentials are valid`

## Step manuali rimasti

- aggiungere i secret GitHub `EVOLUTION_API_KEY` e `ENABLE_WHATSAPP_EVOLUTION` se vuoi rendere persistente il deploy via Actions
- eseguire la scansione QR dal telefono quando creerai la prima istanza WhatsApp
- implementare la UI finale ASSONAM che usera l'integrazione
