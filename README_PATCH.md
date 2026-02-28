# SmartThings OneConnect Patch (Frontend)

Questo pacchetto aggiunge:
- Cruscotto 2×2 con icone animate
- Pagina **Energy** tipo SmartThings
- Click su tile "Energy" per aprire la pagina

## Installazione
1. Copia tutto il contenuto di questa cartella nel tuo repo GitHub Pages.
2. Apri `index.html`, `assets/style.css`, `js/app.js` e fai commit.
3. Verifica che `ENDPOINT_URL` in `js/app.js` punti alla tua WebApp `/exec`.

## Backend (Apps Script) – NOTE IMPORTANTI
Per avere log completi e azioni coerenti, applica la patch lato Apps Script:
- `ifttt.gs`: funzioni `iftttAct_`, `actCloseAll_`, `camsOnBoth_`, ecc.
- `sun.gs`: usa `actCloseAll_('Tramonto: casa vuota')` al posto di `callIFTTT('abbassa_tutto')`.
- `main.gs`: profili `apply*` con log telecamere e chiusure.
- `people.gs`: presenza diurna strict nel MODEL (non modifica il foglio).

**Bugfix raccomandato**: nell'URL della Sunrise/Sunset API usa `&` e non `&amp;`.
Esempio:
```
const url = 'https://api.sunrise-sunset.org/json?lat='+lat+'&lng='+lon+'&date='+todayLocal+'&formatted=0';
```

Dopo le modifiche: **Deploy → Nuova versione** della WebApp.
