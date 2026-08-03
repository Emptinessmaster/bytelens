# ByteLens 🔎

**Comprimi e ridimensiona immagini direttamente nel browser.** Imposta un peso massimo (MB) e una risoluzione massima (px) e ByteLens porta l'immagine esattamente in quello stato — oppure regola qualità e dimensioni a mano. Nessun upload: i file non lasciano mai il dispositivo dell'utente.

> App web statica, senza build e senza backend. Perfetta da pubblicare gratis su **GitHub Pages**.

![Vanilla JS](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20JS-F6A623) ![No backend](https://img.shields.io/badge/backend-nessuno-34D399) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Caratteristiche

- **Limiti automatici** — max peso (MB) + max larghezza/altezza (px): l'immagine rientra da sola.
- **Controllo manuale** — slider di qualità e di scala per il pieno controllo.
- **Ricerca binaria della qualità** per centrare il peso obiettivo in pochi passaggi.
- **Formati** JPG, WebP, PNG. Anteprima prima/dopo con % di risparmio.
- **Privacy totale** — elaborazione 100% client-side (HTML Canvas), nessun server.
- **Tema chiaro/scuro** con preferenza salvata.
- **Pronto per la monetizzazione** — slot AdSense non invasivi + pulsanti donazione.
- **SEO** — meta tag, Open Graph, dati strutturati, `sitemap.xml`, `robots.txt`.

---

## 🚀 Pubblicazione su GitHub Pages (5 minuti)

1. Crea un repository su GitHub (es. `bytelens`) e carica questi file.
   ```bash
   git init
   git add .
   git commit -m "ByteLens: prima versione"
   git branch -M main
   git remote add origin https://github.com/Emptinessmaster/bytelens.git
   git push -u origin main
   ```
2. Su GitHub: **Settings → Pages → Source: `Deploy from a branch` → `main` / `root`**.
3. Dopo ~1 minuto il sito è online su `https://emptinessmaster.github.io/bytelens/`.

> Suggerimento: per un dominio personalizzato (es. `bytelens.it`) aggiungi un file `CNAME` con il dominio e configura i DNS.

---

## 💶 Attivare i guadagni

### 1) Banner pubblicitari — Google AdSense
1. Iscriviti su [Google AdSense](https://adsense.google.com/) e fatti approvare il sito (serve traffico reale e la pagina Privacy — già inclusa in `privacy.html`).
2. In `index.html` cerca i commenti `GOOGLE ADSENSE` e `SLOT ADSENSE`:
   - incolla lo **script** nel `<head>` con il tuo `ca-pub-XXXXXXXXXXXXXXXX`;
   - incolla i **blocchi annuncio** dentro gli slot già predisposti (`.ad-slot`).
3. Crea `ads.txt` nella root con la riga fornita da AdSense (c'è un modello in `ads.txt`).

Gli slot sono volutamente **slim e sotto lo strumento / nel footer**: non coprono l'app, così rispettano le regole AdSense e non infastidiscono l'utente.

### 2) Donazioni volontarie
In `index.html` e in `.github/FUNDING.yml` sostituisci i placeholder `TUONOME` / `TUO_ID` con i tuoi link reali:
- [Buy Me a Coffee](https://www.buymeacoffee.com/)
- [Ko-fi](https://ko-fi.com/)
- [PayPal Donate](https://www.paypal.com/donate/buttons)
- [GitHub Sponsors](https://github.com/sponsors)

Con `FUNDING.yml` compilato, GitHub mostra automaticamente il pulsante **Sponsor** in cima al repo.

---

## 📈 Come arrivare a ~1000€/mese (strategia realistica)

I ricavi dipendono dal **traffico**. Ordine di grandezza indicativo per uno strumento come questo (CPM/RPM tipico €3–€12 per mille visite, molto variabile per lingua e nicchia):

| Visite/mese | Ricavo pubblicità stimato |
|---|---|
| 20.000 | ~€60–€240 |
| 100.000 | ~€300–€1.200 |
| 300.000 | ~€900–€3.600 |

Le donazioni aggiungono un extra variabile. Per crescere:

- **Pubblica più strumenti** (è la tua idea giusta): convertitore di formato, generatore di favicon, crop per social, compressore PDF, rimozione sfondo… Ogni pagina è una porta d'ingresso da Google. Questo repo è pensato come **template riutilizzabile**: cambi logica in `app.js` e testi, il design resta.
- **SEO**: titoli e descrizioni mirati a query reali ("comprimere immagine sotto 2 mb", "ridimensiona 1920x1080"). Sono già impostati qui come esempio.
- **Contenuti**: una breve guida testuale sotto lo strumento aiuta il posizionamento.
- **Velocità**: essendo statico e client-side, il sito è velocissimo — Google lo premia.

> Nota onesta: nessuno può garantire una cifra. Questo progetto ti dà una base tecnica e di design di qualità professionale; il fattore decisivo sarà quanto traffico riesci a portare.

---

## 🧩 Riutilizzare come template

Struttura pensata per clonare pagine simili:

```
index.html      → markup + slot pubblicità + donazioni
styles.css      → sistema di design (token colore/tipografia, temi)
app.js          → SOLO la logica dello strumento — è qui che cambi funzione
privacy.html    → richiesta da AdSense
```

Per un nuovo strumento: duplica la cartella, riscrivi la logica in `app.js`, aggiorna testi/SEO. Il look professionale è già pronto.

---

## 🛠️ Sviluppo locale

Nessuna dipendenza. Apri `index.html` nel browser, oppure servi la cartella:

```bash
python -m http.server 8000
# poi apri http://localhost:8000
```

## 📄 Licenza

[MIT](LICENSE) — libero uso, anche commerciale.
