# Checklist pubblicazione privacy e marketing

## Identità e governance

- [x] Denominazione, P.IVA e sede verificate su VIES il 15 luglio 2026.
- [x] C.F. inserito sulla base di fonti camerali concordi e marcato come da confermare nel fascicolo.
- [ ] Acquisiti visura/statuto, legale rappresentante, PEC e nomina/decisione DPO.
- [x] Ruoli descritti secondo le decisioni effettive del portale, senza inversione nominale generalizzata.
- [ ] DPA art. 28 e accordi controller-to-controller/art. 26 firmati con le associazioni.
- [x] Canale operativo privacy pubblicato; da creare casella/PEC dedicata.

## Informativa, finalità e consenso

- [x] Finalità, basi, dati, destinatari, diritti e criteri di conservazione descritti.
- [x] Hosting primario dichiarato in Germania/SEE, senza affermare falsamente “solo Italia”.
- [x] Possibili accessi/trasferimenti extra SEE dichiarati.
- [x] Presa visione privacy obbligatoria distinta dal consenso.
- [x] Marketing email separato, facoltativo e non preselezionato.
- [x] Rifiuto/revoca senza effetti su iscrizione, pagamento, approvazione, tessera o account.
- [x] Consenso attuale limitato alle promozioni dell'associazione di iscrizione; niente ASSO.N.A.M./partner/WhatsApp impliciti.
- [x] Prova versione/hash, consenso e revoca registrata; nessun consenso retroattivo.
- [x] Campagne promozionali filtrate server-side anche prima dell'invio; comunicazioni di servizio escluse dal filtro.
- [x] Unsubscribe testato; `List-Unsubscribe` da valutare con il trasporto adottato.

## Fornitori e conservazione

- [x] Inventario tecnico dei provider configurati completato.
- [ ] Contratti, DPA, sub-responsabili, regioni, SCC/DPF e TIA archiviati per ogni provider attivo.
- [ ] Green API, provider email/Cloudflare e OpenAI verificati come priorità immediata.
- [x] Policy retention con termini concreti adottata come obiettivo operativo.
- [ ] Retention automatizzata end-to-end, legal hold e report trimestrale implementati/testati.
- [ ] Restore drill con riapplicazione cancellazioni completato.

## Qualità e accessibilità

- [x] Informativa e checkbox coperte da test automatici.
- [x] Smoke signup, auto-emissione, verifica/PDF, pagamento simulato e org-admin superati.
- [x] Controllo responsive a 390 px superato sulle superfici critiche.
- [ ] Test a 320 px, zoom 200/400%, sola tastiera e NVDA completati.
- [ ] Screening DPIA, DPO ed EAA firmati.

## Versione pubblicata

- Versione informativa piattaforma: `2026-07-15.2`.
- Efficacia: 15 luglio 2026.
- SHA-256 del sorgente normalizzato: `a003fa011da6c0a13adc3a52e1eed1444c9f5d3b613234db43c2ed25a057a553`.
- Evidenza tecnica: `app/services/privacy_notice.py` e `tests/test_privacy_notice_evidence.py`.
- Versione privacy specifica dell'associazione registrata separatamente.

## Approvazioni mancanti prima di dichiarare il fascicolo “validato legalmente”

- [ ] Firma legale rappresentante ASSO.N.A.M.
- [ ] Parere legale/DPO o consulente privacy sui ruoli e trasferimenti.
- [ ] Approvazione commercialista sui termini contabili.
- [ ] Verbale del primo test DSAR/data breach e audit accessibilità.

La pubblicazione tecnica può avvenire con le clausole trasparenti sopra indicate; non deve essere descritta come certificazione o conformità legale definitiva finché queste firme/evidenze restano aperte.
