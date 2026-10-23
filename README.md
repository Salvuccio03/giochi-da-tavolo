# Al tavolo

**Gestore visuale disponibile:** fai doppio clic su `Gestisci collezione.bat`, oppure esegui `npm run manage`. Aggiungi e modifica giochi, espansioni, copertine e manuali senza editare JSON. Il pulsante **Salva e aggiorna online** invia le modifiche al repository pubblico configurato e avvia GitHub Pages. Guida completa in [LEGGIMI-GESTORE.md](LEGGIMI-GESTORE.md). Il gestore funziona solo sul PC: il sito pubblico rimane statico.


Catalogo personale statico React + Vite, JavaScript e CSS responsive. Nessun backend, account o database per il catalogo pubblico. Il gestore opzionale usa un servizio locale Node, avviato solo sul PC. Il catalogo contiene i 45 giochi forniti dal proprietario. I numeri dei giocatori sono trascritti dalla sua lista, senza verifica della specifica edizione: `playersSource` ne conserva la provenienza. Copertine, descrizioni e PDF non forniti rimangono assenti. Le fixture fittizie precedenti sono conservate in `examples/` e utilizzate dai test, ma non caricate nel sito.

## Avvio e verifica

```sh
npm install
npm run dev
npm run build
npm run lint
node --test
npm run preview
```

La build è in `dist/`. Non sono necessarie dipendenze aggiuntive. I test verificano il modello, le relazioni simmetriche e direzionali e l'assenza di compatibilità inferite.

## Prodotti — public/games.json

Il file contiene un array. Aggiungi un solo oggetto per prodotto e usa un ID stabile e univoco:

```json
{
  "id": "id-del-prodotto",
  "name": "Nome sulla scatola",
  "type": "base",
  "demo": false,
  "players": null,
  "image": "images/copertina.jpg",
  "description": "Descrizione verificata del prodotto.",
  "manuals": []
}
```

Tipi ammessi:

- `base`: gioco base autonomo, visibile nel catalogo.
- `standalone`: gioco autonomo, visibile nel catalogo.
- `expansion`: non autonomo, visibile soltanto tramite i collegamenti nelle schede.
- `standalone_expansion`: espansione autonoma, visibile nel catalogo.

Inserisci `players: { "min": 2, "max": 4 }` **solo dopo aver verificato il numero ufficiale della specifica edizione**. È un esempio di sintassi, non un dato relativo ai titoli inclusi. Usa `null` se ignoto. Non viene calcolato dai prodotti collegati. Puoi aggiungere `playersSource` come annotazione della fonte verificata.

Copertine in `public/images/`, con percorso `images/nome-file.jpg`, senza `public/`. Con `image: null` o un caricamento fallito appare un segnaposto. Descrizioni nulle, manuali vuoti e assenza di collegamenti hanno messaggi dedicati. Per eliminare la collezione dimostrativa sostituisci gli array e rimuovi la nota di esempio dalla homepage in App.jsx quando i dati reali sono pronti. `demo` identifica anche i singoli prodotti nelle schede.

## Relazioni — public/relations.json

I dati dei prodotti non vanno duplicati. Ogni relazione ha un proprio ID:

```json
{
  "id": "relazione-univoca",
  "type": "expansion_for",
  "from": "id-espansione",
  "to": "id-gioco",
  "conditions": "Limitazioni o modalità compatibili verificate.",
  "requiredProductIds": [],
  "combinedPlayers": null
}
```

- `expansion_for`: da espansione a prodotto compatibile. La scheda del destinatario mostra “Espansione compatibile”; quella dell'espansione mostra il gioco compatibile. Non implica automaticamente un requisito né autorizza altre configurazioni.
- `combines_with`: tra due prodotti autonomi. Relazione simmetrica: inseriscila una sola volta. Appare come “Gioco standalone combinabile” su entrambi.
- `requires`: dal prodotto dipendente al prodotto necessario. Nel verso inverso viene indicato che il prodotto collegato richiede quello attuale. I requisiti possono dipendere dalla modalità: documentala in `conditions`.

Per più espansioni, aggiungi più relazioni. Per un'espansione condivisa, collega lo stesso ID a più giochi. Per un'espansione di espansione, il destinatario può essere un'altra espansione. Nessuna relazione è transitiva: non si deducono collegamenti da nomi o catene.

`requiredProductIds` indica altri prodotti necessari **alla configurazione descritta nella relazione**, con link alle loro schede. Non significa che siano necessari a tutte le modalità del prodotto. `conditions` contiene le limitazioni precise. `combinedPlayers`, se ufficialmente verificato per quella configurazione, usa `{ "min": 2, "max": 6 }`: è soltanto sintassi esemplificativa. Nessun limite viene sommato. Il catalogo continua a mostrare i giocatori del prodotto singolo.

## PDF

Copia un PDF in `public/manuals/`, poi aggiungi al prodotto:

```json
"manuals": [
  { "label": "Regolamento italiano", "url": "manuals/nome-reale.pdf" }
]
```

In alternativa inserisci un URL HTTPS reale, esplicitamente verificato. Non inserire link ipotetici. La scheda offre visualizzazione in nuova scheda e download. Per URL esterni il browser o il server remoto può ignorare `download` e aprire il documento: per garantire lo scaricamento usa PDF locali. Nessun pulsante viene generato per manuali assenti.

## GitHub Pages

`base: './'` in vite.config.js rende relativi i percorsi della build. I dati e gli asset usano `import.meta.env.BASE_URL`; la navigazione `#/game/ID` evita errori 404 ricaricando una scheda su Pages, anche sotto `/nome-repository/`.

Quando vorrai pubblicare, esegui build e distribuisci il **contenuto di dist/** con GitHub Pages, per esempio tramite GitHub Actions usando upload-pages-artifact e deploy-pages. Non caricare soltanto i sorgenti React come sito statico. Questo progetto non avvia pubblicazioni automaticamente.

## Codice

- `src/App.jsx`: componenti catalogo, copertina, dettaglio, manuali e relazioni; gestione navigazione, ricerca, caricamento ed errori.
- `src/collection.js`: caricamento e validazione JSON, URL, formattazione giocatori e lettura dei collegamenti.
- `src/App.css`, `src/index.css`: tema scuro, due colonne smartphone, focus accessibile e supporto movimento ridotto.
- `tests/collection.test.js`: verifiche del modello con il test runner nativo Node.

La validazione segnala ID duplicati, riferimenti inesistenti, tipi sconosciuti e intervalli giocatori non validi. La correttezza editoriale delle compatibilità e dei dati ufficiali resta da verificare prima dell'inserimento.

Il badge sulla copertina mostra soltanto il valore numerico, nel catalogo e nel dettaglio. Con `players: null` è nascosto. Per un limite ufficiale aperto, usa `players: { "min": 8, "max": null }`, visualizzato come `8+`; inseriscilo solo se verificato.

## Collezione del proprietario

Le annotazioni con asterischi, apostrofi finali ed emoji sono state ignorate, preservando gli apostrofi nei titoli. Tutti i giochi elencati sono registrati come autonomi (`standalone`), senza inferire compatibilità dai nomi. Le 20 espansioni comunicate successivamente sono inserite come prodotti separati, con 21 collegamenti espliciti in `relations.json`. Block block burrito è un unico prodotto condiviso da Burrito e Avocado.

Come richiesto dal proprietario, tutte le annotazioni da “ep.” in poi sono ignorate. I badge mostrano esclusivamente i limiti riportati prima di “ep.”. Non sono state inserite espansioni o compatibilità sulla base di queste annotazioni.

## Espansioni della collezione

Le relazioni attuali provengono dalla lista del proprietario. I limiti 3–8 di Dodge city e 4–16 di double trouble sono memorizzati in `combinedPlayers` sulla relazione, non come giocatori autonomi delle espansioni. I badge dei giochi base rimangono invariati. I +1 di Heat sono note in `conditions`, senza sommare i limiti o dedurre configurazioni con più espansioni. Il dato 4–31/35 di Lupus rimane una nota da chiarire. Non si presume che più espansioni collegate allo stesso gioco siano combinabili simultaneamente. Copertine, descrizioni e PDF delle espansioni non forniti restano vuoti.

## Ricerca per giocatori

Il campo Giocatori trova i giochi che supportano il numero richiesto nel gioco base, nei `combinedPlayers` delle relazioni dirette, oppure in `playerConfigurations` del prodotto. Nessun limite viene sommato. Una configurazione usa `{ "label": "Con espansioni possedute", "players": { "min": 1, "max": 8 }, "source": "Conferma del proprietario" }`. Heat include questa configurazione in seguito alla conferma del proprietario. In ricerca il badge mostra l’intervallo corrispondente; senza filtro mostra il limite base. Le condizioni delle relazioni continuano ad applicarsi.

## Card delle espansioni e copertine

I prodotti collegati sono mostrati come card responsive con copertina cliccabile, nome e badge numerico quando è noto il limite della configurazione. Condizioni e requisiti restano sotto la card. Tutte le 20 espansioni hanno immagini salvate in public/images e `imageSource` con pagina e URL di provenienza (editori, distributori o cataloghi dei rivenditori). Le immagini possono rappresentare edizioni in lingua diversa. Mezzo giorno di fuoco e Per un pugno di carte utilizzano l’immagine della confezione congiunta pubblicata dall’editore, annotata nei dati. I diritti sulle immagini restano ai rispettivi titolari.
