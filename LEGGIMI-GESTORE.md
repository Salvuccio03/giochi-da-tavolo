# Gestisci collezione — guida rapida

## Aprire il gestore

Fai doppio clic su **Gestisci collezione.bat** nella cartella del progetto. Si aprirà il browser su http://127.0.0.1:4317. Lascia aperta la finestra del gestore mentre lavori; chiudila per spegnere il servizio locale. In alternativa, dal terminale nella cartella: `npm run manage`.

Se sposti il progetto su un altro PC, installa Node.js 24 e poi esegui `npm install` una volta nella cartella.

## Aggiungere un gioco

1. Premi **+ Nuovo prodotto**.
2. Compila nome, tipo e numeri ufficiali di giocatori. L’ID viene generato dal nome.
3. Scrivi la descrizione e carica una copertina JPG, PNG o WebP (massimo 15 MB).
4. Premi **+ Manuale** per caricare un PDF oppure inserire un link reale. Puoi aggiungerne diversi.
5. Premi **Salva sul PC**. Il gioco è registrato nel catalogo locale; il sito online non cambia ancora.

Per modificare un gioco esistente, selezionalo nell’elenco a sinistra. Non serve toccare i JSON. Un ID già salvato resta fisso per conservare i collegamenti.

## Aggiungere un’espansione

1. Crea il prodotto con tipo **Espansione (richiede un gioco)**. Se funziona da sola usa invece **Espansione standalone**.
2. Nella sezione **Collegamenti** premi **+ Collegamento**.
3. Scegli “È un’espansione compatibile con” e seleziona il gioco base. Specifica eventuali condizioni e l’intervallo completo dei giocatori con l’espansione, solo se noto.
4. Per collegarla a due giochi aggiungi due collegamenti allo stesso prodotto, senza creare due espansioni.
5. Per requisiti espliciti usa “Richiede per giocare”. Per due prodotti autonomi usa “È uno standalone combinabile con”.

Le relazioni che arrivano dal prodotto di un’espansione compaiono anche sulla scheda del gioco base; per modificarle apri quell’espansione. Per configurazioni di più espansioni puoi usare **Altre configurazioni di giocatori** indicando il limite completo e le condizioni nel nome. La ricerca non somma mai i limiti.

## Collegare GitHub — una volta per sessione

Repository predisposto: https://github.com/Salvuccio03/giochi-da-tavolo

Il repository deve essere **pubblico e dedicato**. Al primo collegamento deve contenere soltanto README, ed eventualmente LICENSE e .gitignore. Se è completamente vuoto, aggiungi README tramite GitHub prima di pubblicare.

1. Apri https://github.com/settings/personal-access-tokens/new e accedi al tuo account.
2. Dai un nome riconoscibile, per esempio “Catalogo giochi sul PC”, e imposta una scadenza.
3. In **Repository access** scegli **Only select repositories**, poi **giochi-da-tavolo**.
4. In **Repository permissions** imposta **Contents**, **Workflows** e **Pages** su **Read and write**. Metadata è incluso automaticamente. Non servono altri repository o permessi di account.
5. Premi **Generate token**, copia il valore e incollalo soltanto nel campo password **Token GitHub** del gestore locale. Non inviarlo in chat, non aggiungerlo ai file del progetto.
6. Verifica il link del repository, poi premi **Salva e aggiorna online** nel modulo del prodotto.

Il primo invio configura Pages con GitHub Actions e carica il progetto. I successivi creano un unico commit con le modifiche. L’interfaccia mostra il collegamento a GitHub Actions: attendi l’esito positivo del workflow **Pubblica catalogo** per considerare il sito aggiornato. In caso di errore di Pages, controlla su GitHub **Settings → Pages → Source → GitHub Actions**.

Indirizzo atteso dopo il primo deploy riuscito: https://salvuccio03.github.io/giochi-da-tavolo/

Il token rimane soltanto in memoria nel browser e nella richiesta locale al server. Il server lo usa per le richieste HTTPS a GitHub e non lo salva. Dopo chiusura o ricaricamento della pagina devi reinserirlo; quando scade generane uno nuovo. Puoi revocarlo dalle impostazioni GitHub. Il link del repository, che non è segreto, viene ricordato dal browser.

GitHub Pages e i workflow con runner Ubuntu standard sono gratuiti per repository pubblici. I sorgenti, i dati, i PDF e le immagini pubblicati saranno pubblici. Non viene attivato alcun servizio a pagamento. Riferimento: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## Cosa viene salvato e pubblicato

- **Salva sul PC** modifica `public/games.json` e `public/relations.json` e crea prima una copia dei dati precedenti in `.catalog-backups/`.
- I file caricati ricevono nomi univoci e vengono copiati in `public/images/` o `public/manuals/`. Rimuovere un collegamento al file non cancella il file originale.
- **Salva e aggiorna online** salva prima sul PC e poi invia a GitHub sorgenti e contenuti referenziati dal catalogo. Non pubblica `node_modules`, `dist`, backup, stato locale o token. Le immagini/PDF caricati e mai associati a prodotti non vengono inviati. I file già presenti online non vengono cancellati automaticamente.
- GitHub Actions esegue lint, test e build e pubblica solo `dist/`. Il gestore e le sue API non vengono inclusi nel sito Pages.
- Nessuna modifica viene inviata online al semplice avvio del gestore.

## Se qualcosa non funziona

- **Il catalogo è cambiato in un’altra finestra:** copia eventuale testo ancora in bozza, ricarica il gestore e ripeti la modifica. Il gestore non sovrascrive silenziosamente l’altra versione.
- **Permessi GitHub insufficienti:** controlla repository selezionato, scadenza e i tre permessi del token. Se il repository appartiene a un’organizzazione può servire l’approvazione del proprietario.
- **Repository modificato online:** il gestore si ferma per proteggere il lavoro remoto. Sincronizza il progetto prima di ripubblicare. Non cancellare `.catalog-publish.json` per aggirare il controllo.
- **Pubblicazione fallita:** i dati salvati sul PC restano disponibili. Il gestore distingue l’invio a GitHub dal deploy: verifica l’esito su Actions. Non inserire dati sensibili nei file pubblici.
- **Ripristino di un salvataggio:** chiudi il gestore, scegli la cartella desiderata in `.catalog-backups/` e copia entrambi i JSON in `public/`. Poi riapri. I file caricati non vengono eliminati dal ripristino.

## Verifiche tecniche

`npm run lint`, `npm test`, `npm run build`.

Il gestore ascolta soltanto su 127.0.0.1 e verifica host, origine e token della sessione. Non accetta scritture da pagine esterne; gli upload ammettono solo firme JPG/PNG/WebP/PDF, con nomi generati dal server. Nessun nuovo pacchetto è necessario.
