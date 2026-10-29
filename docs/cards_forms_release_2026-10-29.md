# Tessere e Form pubblici - 29 ottobre 2026

## Modifiche

- Tessere separata in Magazzino, Ordini e Design. Indicatori da dati reali: quote effettivamente incassate e disponibilita del magazzino, senza confondere attivi con numeri consumati/riservati.
- Richiesta rifornimento in pannello inferiore: costo esplicito, anno corretto, nessun addebito online; protezione dal doppio invio e riutilizzo dello stesso identificativo dopo un esito di rete incerto. Esito salvato distinto dal successivo aggiornamento della pagina.
- Storico richieste e lotti con stati contabili reali, note su richiesta, paginazione e filtri sul server prima della paginazione. Storici non contabilizzati non presentati come debito.
- Su telefono/tablet: pulsante Filtri, pannello con campi interi, applicazione esplicita e pill rimovibili, secondo la correzione dell'utente. Selezione anno leggibile anche a 320 pixel.
- Una sola anteprima tessera con fronte/retro, quattro colori, impostazioni avanzate e regole economiche comprimibili. Bozze conservate passando tra le schede. Artwork dedicato e branding preservati; anteprima generica senza sovrapposizioni.
- Completato refactor Gemini dei Form pubblici: card responsive, stato, link/copia, contatori leggibili, Risposte/Builder e menu contestuale. Creazione contestuale anche in Comunicazioni.
- Duplicazione form tramite endpoint atomico esistente: conserva campi, canvas e impostazioni e crea una bozza. Lock sincroni delle azioni, gestione degli errori clipboard e del refresh, menu da tastiera e conferma eliminazione riferita alla card corretta.
- Corretto il valore predefinito instabile dei template e lo stato riutilizzato della conferma; card/pulsanti/contatori rientrano nel viewport anche con titoli lunghi.

## Verifiche prima del rilascio

- Frontend: 239 test superati in 45 file, inclusi14 test delle nuove card Form. Typecheck e build TypeScript/Vite/PWA riusciti.
- Backend: 63 test pertinenti superati, inclusi filtri, disponibilita, rifornimenti, validazioni, isolamento associazione, CRUD/duplicazione form e controlli pubblici antiabuso.
- Review indipendente conclusa senza blocker; corretto lo stato della conferma segnalato dalla review.
- Browser su build reale e dati sintetici: magazzino/ordini/design, rifornimento 2027 senza alterare stock2026, paging e totali, salvataggio regole/design/logo e permessi artwork dedicato. Matrice iniziale di 18 casi tra 320,390,810,1280 e1440 pixel e temi chiaro/scuro; ulteriori verifiche dopo la correzione filtri e anteprima.
- Form: creazione/salvataggio impostazioni, copia link, duplicazione, attivazione, conferma eliminazione annullata; card misurate a320/390/810/1440 pixel, senza tagli dei contenuti. Nessun errore JavaScript rilevato.
- Nessun invio, pagamento o modifica di dati reali durante il collaudo. Evidenze private in `output/cards-workspace-20261029/`, escluse da Git.

## Rilascio

In attesa di commit/pipeline e verifiche sul runtime pubblicato. Nessuna migrazione prevista. Webhook WhatsApp/Pienissimo, endpoint legacy e pulizia P3 restano fuori dal perimetro.

## Limiti

Viewport Chromium simulati; nessun dispositivo Safari/iOS fisico. Nessun nuovo addebito o consegna email reale utilizzato come prova. Le operazioni distruttive sono verificate nei test isolati; nel browser la conferma viene annullata.
