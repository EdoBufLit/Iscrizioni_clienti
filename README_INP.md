# Come misurare INP localmente

Questa guida vale **solo in dev**. In produzione è **OFF** salvo `VITE_PERF_LOG=1`.

## Avvio
1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. Apri l’app in Chrome/Edge e apri la Console di DevTools.

Per forzare il logger in qualsiasi ambiente:
```
VITE_PERF_LOG=1 npm run dev
```

Per cambiare sampling o throttle:
```
VITE_PERF_SAMPLE_RATE=0.1 VITE_PERF_INP_THROTTLE_MS=2000 VITE_PERF_LONGTASK_THROTTLE_MS=2000 npm run dev
```

## Dove misurare (pagine)
- Home (`/`)
- Login (`/login`)
- Dashboard (`/dashboard`)
- Super Admin > Associazioni (`/super-admin/associazioni`)

## Azioni suggerite (riproduzione)
- **Home:** click su “Menu” (mobile) e “Area riservata”.
- **Login:** click su “Accedi” dopo compilazione campi.
- **Dashboard:** cambia tab (Riepilogo / Profilo / Documenti).
- **Super Admin > Associazioni:** apri “Nuova associazione” (modal) e usa il pulsante “Gestione” su una riga.
- **Fetch organizzazioni:** apri la pagina “Associazioni” nel pannello Super Admin (triggera il fetch).

## Output atteso in Console
- Log `[INP] ...` con breakdown:
  - `inputDelay`
  - `processingTime`
  - `presentationDelay`
- Log `[LongTask] ...` con route, component (se presente), target, stack (best-effort).

> Nota: i log includono `route` e `data-component` quando disponibili.
