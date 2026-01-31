# Alembic Database Migrations

Questo progetto utilizza Alembic per gestire le migrazioni del database.

## Configurazione

Le migrazioni sono configurate in `alembic/env.py` per utilizzare la stessa connessione definita in `app/db.py`.

## Comandi Principali

### 1. Inizializzazione in Produzione (DB Esistente)

Se il database esiste già (es. in produzione) e contiene già le tabelle, **NON** eseguire `upgrade head` direttamente.
Bisogna prima dire ad Alembic che il database è già allineato con l'ultima versione.

Esegui:
```bash
alembic stamp head
```
Questo comando crea la tabella `alembic_version` e la imposta all'ultima revisione, senza tentare di ricreare le tabelle.

### 2. Nuovi Ambienti (DB Vuoto)

Per creare il database da zero in un nuovo ambiente:

```bash
alembic upgrade head
```

### 3. Creare una Nuova Migrazione

Dopo aver modificato i modelli in `app/models.py`, genera una nuova migrazione:

```bash
alembic revision --autogenerate -m "descrizione della modifica"
```

Verifica il file generato in `alembic/versions/`, poi applicalo:

```bash
alembic upgrade head
```

## Note Importanti

- **Non modificare manualmente il database SQLite.** Usa sempre Alembic.
- **Backup:** Prima di ogni operazione critica, fai un backup di `data/app.db`.
