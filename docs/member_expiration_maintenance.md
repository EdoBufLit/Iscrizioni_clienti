# Member Card Expiration Maintenance

## Regola di validita annuale
- Una tessera e valida fino al 31/12 dell'anno `card_year`.
- Dal 01/01 dell'anno successivo (`card_year < current_year`) il socio non e piu attivo.

## Job di manutenzione
- Service: `app/services/member_maintenance.py::expire_and_purge_members`
- Trigger super-admin: `POST /api/super-admin/maintenance/run`
- Trigger CLI (consigliato per cron esterno): `python -m app.maintenance`

Il job:
- imposta `deleted_at`, `expired_at`, `status=expired`
- esegue purge PII di default (`email`, `phone`, `fiscal_code`, `password_hash`, ecc.)
- mantiene audit essenziale (`org_id`, `card_no`, `card_year`)
- scrive audit log con action `auto_expire_members`

## Esempio cron esterno

Eseguire ogni giorno alle 00:10 UTC (idempotente):

```cron
10 0 * * * cd /path/to/repo && /path/to/venv/bin/python -m app.maintenance >> /var/log/assonam_maintenance.log 2>&1
```

Alternativa minima: esecuzione il 1 gennaio alle 00:10 UTC:

```cron
10 0 1 1 * cd /path/to/repo && /path/to/venv/bin/python -m app.maintenance >> /var/log/assonam_maintenance.log 2>&1
```
