# ByteLens 🔎

**Comprimi e ridimensiona immagini direttamente nel browser.** Imposta un peso massimo (MB) e una risoluzione massima (px) e ByteLens porta l'immagine esattamente in quello stato — oppure regola qualità e dimensioni a mano. Nessun upload: i file non lasciano mai il dispositivo dell'utente.

> App web statica, senza build e senza backend. Funziona aprendo semplicemente `index.html`.

### [▶ Apri ByteLens](https://raw.githack.com/Emptinessmaster/bytelens/main/index.html)

[![Apri l'applicazione](https://img.shields.io/badge/▶%20Apri%20l'applicazione-ByteLens-F6A623?style=for-the-badge&logo=googlechrome&logoColor=white)](https://raw.githack.com/Emptinessmaster/bytelens/main/index.html)

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

---

## 🕹️ Come si usa

1. **Carica** un'immagine: trascinala nell'area, selezionala o incollala (Ctrl/Cmd+V).
2. **Imposta i limiti** di peso e dimensioni, oppure disattiva la modalità automatica e regola qualità e scala con i cursori.
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
privacy.html    → informativa sulla privacy
```

---

## 📄 Licenza

[MIT](LICENSE) — libero uso, anche commerciale.
