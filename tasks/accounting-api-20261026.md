# Contratto contabilità Org Admin — 26 ottobre 2026

Base `/api/org-admin/accounting`, sessione Org Admin persistente e tenant derivato dalla sessione. Importi interi in centesimi, valuta EUR, date `YYYY-MM-DD`. `method`: `cash|bank_transfer|other|sumup`. Nessuna chiamata bancaria/provider, rimborso, revoca tessera o invio esterno diretto.

## Tipi

`Receipt`: `{id:number,version:number,amount_cents:number,currency:string,method:string,paid_on:string,payer:string|null,reference:string|null,description:string|null,source:"manual"|"csv"|"legacy_manual"|"provider",source_key:string|null,status:"unmatched"|"partial"|"matched"|"voided",allocated_cents:number,unallocated_cents:number,created_at:string,permissions:{can_adjust:boolean,can_void:boolean,reason:string|null}}`.

`Allocation`: `{id:number,receipt_id:number,target_key:string,kind:"initial"|"renewal"|"temporary",target_id:number|null,member_id:number|null,member_name:string,membership_year:number|null,amount_cents:number,net_cents:number,reversed_at:string|null,payment_id:number|null,created_at:string}`.

`Event`: `{id:number,action:string,reason:string|null,actor_admin_id:number|null,created_at:string,before:object|null,after:object|null}`. Eventi immutabili, originale conservato.

`Target`: `{target_key:string,kind:"initial"|"renewal"|"temporary",target_id:number|null,member_id:number,member_name:string,email:string|null,membership_year:number|null,label:string,currency:string,expected_cents:number,paid_cents:number,outstanding_cents:number,already_paid:boolean,exact_match:boolean,reasons:string[]}`. Un abbinamento manuale non può superare il residuo della quota; una quota già pagata può essere collegata soltanto alla propria ricevuta autorevole preesistente.

## Letture

- `GET /receipts?state=&q=&limit=50&offset=0` -> `{items:Receipt[],total:number,kpis:{total_cents:number,allocated_cents:number,unallocated_cents:number,unmatched_count:number}}`. `state` opzionale tra unmatched/partial/matched/voided.
- `GET /receipts/{id}` -> `{receipt:Receipt,allocations:Allocation[],events:Event[]}`.
- `GET /receipts/{id}/suggestions?query=&year=2026&limit=25&offset=0` -> `{items:Target[],total:number}`. Ricerca per nome/email/codice fiscale, risultati paginati e motivi suggerimento; nessun abbinamento automatico.
- `GET /members/{member_id}?year=2026` -> `{balance:{expected_cents:number,paid_cents:number,outstanding_cents:number,currency:string},receipts:Receipt[],events:Event[]}`.

## Scritture

Ogni mutazione richiede `request_key` univoca (8–120 caratteri). Il riuso identico restituisce il risultato precedente, un payload diverso genera 409. Le mutazioni su ricevuta richiedono `expected_version`; versione obsoleta genera 409. Motivi obbligatori per correzioni/storni, 3–1000 caratteri.

- `POST /receipts` body `{request_key,amount_cents,currency:"EUR",method:"cash"|"bank_transfer"|"other",paid_on,payer?,reference?,description?}` -> dettaglio ricevuta.
- `POST /receipts/import/preview` body `{csv_text:string}` -> `{rows:[{row_number:number,valid:boolean,duplicate:boolean,errors:string[],receipt:{amount_cents,currency,method,paid_on,payer,reference,description,source_key}|null}],valid_count:number,invalid_count:number,duplicate_count:number}`. Header minimi `date,amount`; supportati alias italiani, separatore comma/punto e virgola, importi italiani o decimali, `reference,payer,description,currency` opzionali. Solo entrate positive EUR, massimo 1000 righe / 1 MB. Preview non scrive.
- `POST /receipts/import` body `{request_key,csv_text}` -> `{created:number,duplicates:number,items:Receipt[]}`. Errori in qualunque riga bloccano tutto; duplicati sicuri saltati, nessun importo sommato implicitamente. Identità riferimento esterno quando presente, altrimenti hash file + numero riga.
- `POST /receipts/{id}/allocations` body `{request_key,expected_version,items:[{target_key,amount_cents}]}` -> dettaglio ricevuta. Massimo 100 target; ammesse quote parziali e più soci. Conferma completa in una transazione; i servizi di emissione esistenti sono invocati soltanto quando la quota raggiunge la copertura completa.
- `POST /receipts/{id}/adjustments` body `{request_key,expected_version,reason,amount_cents?,method?,paid_on?,payer?,reference?,description?}` -> dettaglio ricevuta. Un importo inferiore al già allocato è rifiutato: prima stornare gli abbinamenti. Propagazione data/metodo ai soli incassi manuali, fatti del provider immutabili.
- `POST /receipts/{id}/allocations/{allocation_id}/reverse` body `{request_key,expected_version,reason}` -> dettaglio ricevuta. Storno dell'intero abbinamento attivo, ripristino del residuo e del saldo quota. Nessuna revoca tessera e nessun rimborso.
- `POST /receipts/{id}/void` body `{request_key,expected_version,reason}` -> dettaglio ricevuta. Storna tutti gli abbinamenti e annulla contabilmente la ricevuta; originale/eventi conservati. Ricevute provider non rettificabili/annullabili.
- `POST /receipts/sync` body `{request_key}` -> `{created:number,has_more:boolean}`. Importa al massimo 100 pagamenti autorevoli per richiesta; il frontend procede con chiavi distinte fino a 10 blocchi per clic e permette di continuare. Usa il legame esatto `membership_payment_id` o l'ID presente nell'audit originale; i movimenti senza prova non vengono attribuiti per somiglianza. La stessa chiave consente di recuperare una risposta persa senza duplicare incassi.

## Helper backend e integrazione

`app.services.member_accounting.member_year_balance(db, *, member, year)` -> `{expected_cents,paid_cents,outstanding_cents,currency}`; sola lettura, nessun termine creato. Include annualità iniziale/rinnovo, allocazioni parziali e storni; temporanee escluse dal sollecito annuale.

`member_year_balances(db, *, members, year)` restituisce gli stessi saldi in blocco per anteprime e solleciti senza query per socio.

`sync_legacy_receipts(db, *, org_id, admin_id=None, target_keys=None, limit=100)` crea ricevute/abbinamenti per incassi completi già autorevoli, senza commit né invii. Gli abbinamenti sincronizzano soltanto i propri target (`limit=None`), senza scorrere l'archivio del club; Aggiorna allinea lo storico in blocchi. Gli importi/stati provider restano immutabili; una proiezione manuale non viene importata una seconda volta come denaro ricevuto.

Il parent gestisce import modelli/router, bootstrap/schema gate e inserimento saldo netto nello storico socio. I pagamenti manuali sono proiezioni rettificabili dopo evento audit prima/dopo; lo storno riapre il debito senza eliminare o revocare la tessera emessa. Online riconciliazione documentale, senza modificare importo/stato/data del provider.
