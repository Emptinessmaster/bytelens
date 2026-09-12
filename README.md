# ByteLens 🔎

**Comprimi e ridimensiona immagini direttamente nel browser.** Imposta un peso massimo (MB) e una risoluzione massima (px) e ByteLens porta l'immagine esattamente in quello stato — oppure regola qualità e dimensioni a mano. Nessun upload: i file non lasciano mai il dispositivo dell'utente.

> App web statica, senza build e senza backend. Funziona aprendo semplicemente `index.html`.

### [▶ Apri ByteLens](https://emptinessmaster.github.io/bytelens/)

[![Apri l'applicazione](https://img.shields.io/badge/▶%20Apri%20l'applicazione-ByteLens-F6A623?style=for-the-badge&logo=googlechrome&logoColor=white)](https://emptinessmaster.github.io/bytelens/)

![Stack](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20JS-F6A623) ![No backend](https://img.shields.io/badge/backend-nessuno-34D399) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Caratteristiche

- **Limiti automatici** — imposti max peso (MB) e max larghezza/altezza (px): l'immagine rientra da sola in entrambi.
- **Controllo manuale** — slider di qualità e di scala per regolare tutto a mano.
- **Ricerca binaria della qualità** per centrare il peso obiettivo in pochi passaggi.
- **Formati** JPG, WebP e PNG, con anteprima prima/dopo e percentuale di risparmio.
- **Privacy totale** — elaborazione 100% client-side tramite HTML Canvas: nessun server, nessun upload.
- **Drag & drop e incolla** — trascina un file o incolla un'immagine dagli appunti.
- **Tema chiaro/scuro** con preferenza salvata.
- **15 lingue**, rilevamento automatico e supporto RTL per arabo e urdu.
- **PWA e uso offline** dopo il primo caricamento riuscito tramite HTTPS o localhost.
- **Proporzioni** — i limiti mantengono il rapporto originale; i preset (1:1, 16:9, ecc.) ritagliano al centro senza deformare.

### Limiti e comportamento

Gli ingressi sono limitati a 64 MiB, 32 megapixel e 32768 pixel per lato. Le dimensioni vengono lette prima della decodifica; intestazioni non riconoscibili nel primo MiB vengono rifiutate. Il canvas di uscita è limitato a 16 megapixel e 8192 pixel per lato, mantenendo le proporzioni. Questi limiti riducono l'uso di memoria, senza garantire il supporto su ogni dispositivo.

La modalità automatica effettua un numero limitato di tentativi: un peso estremamente basso può restare irraggiungibile, e viene segnalato. Per PNG il peso non viene adattato automaticamente. Reset, cambio immagine e modifica dei controlli invalidano i risultati precedenti; il download torna disponibile al completamento della nuova elaborazione.

---

## 🕹️ Come si usa

1. **Carica** un'immagine: trascinala nell'area, selezionala o incollala (Ctrl/Cmd+V). Il file resta originale: dimensioni, formato e peso non cambiano. I campi pixel partono dalle dimensioni originali, senza un preset 1920×1080.
2. **Imposta i limiti** di peso e dimensioni, oppure disattiva la modalità automatica e regola qualità e scala con i cursori. L'elaborazione parte quando modifichi un controllo; da quel momento si applicano anche i limiti di sicurezza del canvas.
3. **Scarica** l'immagine ottimizzata: il pulsante mostra il peso finale del file.

---

## 🚀 Pubblicazione su GitHub Pages

1. Carica i file nel repository.
   ```bash
   git init
   git add .
   git commit -m "ByteLens: prima versione"
   git branch -M main
   git remote add origin https://github.com/Emptinessmaster/bytelens.git
   git push -u origin main
   ```
2. Su GitHub: **Settings → Pages → Source: `Deploy from a branch` → `main` / `root`**.
3. Dopo circa un minuto il sito è online su `https://emptinessmaster.github.io/bytelens/`.

---

## 🛠️ Sviluppo locale

Nessuna dipendenza. Apri `index.html` nel browser, oppure servi la cartella:

```bash
python -m http.server 8000
# poi apri http://localhost:8000
```

---

## 🧱 Struttura del progetto

```
index.html      → interfaccia dell'applicazione
styles.css      → stile e sistema di temi (chiaro/scuro)
app.js          → logica di compressione e ridimensionamento
image-limits.js → verifica delle dimensioni prima della decodifica
i18n.js         → traduzioni, selezione lingua e supporto RTL
sw.js           → cache offline isolata alle risorse ByteLens
manifest.webmanifest → configurazione PWA
privacy.html    → informativa sulla privacy
tests/          → test di regressione eseguibili con Node.js
```

### Verifica

Esegui `node --test tests/regression.test.cjs` (Node.js 20 o successivo). I test verificano limiti, proporzioni, annullamento asincrono e isolamento delle cache tramite API browser simulate; non sostituiscono le prove di codifica e compatibilità nei browser reali.

Il grafo in `graphify-out/` è una fotografia storica e non rappresenta gli ultimi fix; consulta i sorgenti per il comportamento attuale.

---

## 📄 Licenza

[MIT](LICENSE) — libero uso, anche commerciale.
