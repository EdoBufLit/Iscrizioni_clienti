# Lessons

- When a user reports runtime errors, add defensive guards around optional/unknown values and make the logger safe-by-default.
- If a logo needs true background removal, create a transparent asset instead of relying on blend modes.
- When onboarding spans multiple internal routes, persist in-progress state (run + stepIndex) per role and add bounded retries for TARGET_NOT_FOUND to avoid tour interruption on tab/route changes.
- When the user marks a layout requirement as non-negotiable, keep that element in a dedicated section and remove duplicate representations from KPI cards.
- When multiple entry points trigger the same auth gate ("Area riservata"), route all of them through one deterministic redirect flow to prevent first-click race/redirect issues.
- When INP remains high after rerender optimizations, prioritize paint/compositing hotspots (`presentationDelay`): reduce `backdrop-filter`, animated glass layers, and heavy global scene effects on data-entry dashboards.
- Per card con flip 3D, logo/overlay non devono stare nel layer preserve-3d: vanno estratti nel wrapper per evitare rotazioni indesiderate e testi specchiati.
- Se un flip 3D mostra ancora il fronte specchiato, ridurre il DOM a uno stage unico con facce dirette e rinforzare le proprieta 3D/backface anche inline per evitare override/bug browser.
- Quando il requisito e "Three.js reale", validare sempre in DOM la presenza di `<canvas>` (non solo componenti React) e non disattivare WebGL su heuristic low-power: degradare qualita, non la feature.
- Quando il requisito parla di "logo particellare riconoscibile", partire da un asset logo esplicito (SVG) e verificare subito con screenshot che la forma sia percepibile, non solo che l'animazione funzioni.
- Se il requisito richiede particle logo “puro”, non mantenere mai un underlay immagine quando WebGL e attivo: il fallback statico va mostrato solo quando WebGL e disabilitato/non disponibile.
- Dopo una correzione su hero WebGL, validare sempre due viewport reali (desktop + mobile) e separare visivamente la zona canvas dalla zona copy/CTA per evitare sovrapposizioni percepite come bug.
- Se il feedback dice che l'hero object deve vivere nel background, evitare stage separati in flow verticale: oggetto WebGL e fallback statico devono stare nel layer scene dietro copy/CTA, con verifica screenshot desktop/mobile prima di chiudere.
- Quando il brand richiede coppie CTA coerenti su tutto il pubblico, non limitare il fix alla hero: applicare la palette (blu/giallo) a `btn-primary` e `btn-ghost` a livello `public-shell` per evitare mismatch tra pagine.
- Se l'utente chiede di eliminare una foto, non basta spostarla in un'altra sezione: va rimossa da tutti i mapping attivi e, se richiesto, cancellata anche dagli asset locali.
- La hero che funziona su desktop puo rompersi su mobile: validare sempre contrasto reale di H1/subtitle e usare fallback tipografici solidi + pannello copy leggero quando il background e fotografico.
- Quando il requisito mobile e "CTA-only", non inseguire tweak tipografici: nascondere completamente il blocco testo con `hidden md:block` e mantenere la gerarchia visuale tramite watermark leggero dietro i bottoni.
