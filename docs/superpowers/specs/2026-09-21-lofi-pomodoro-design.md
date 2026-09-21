# Cozy Pomodoro — Design

## Intento

Creare un Pomodoro Timer personale, completamente client-side, rapido da capire e piacevole da lasciare aperto durante lavoro o studio. Stabilità e semplicità precedono quantità di funzioni e decorazione.

L'app usa lo starter Preact/Vite già presente. Non introduce backend, account, database remoto o upload dei file locali.

## Ambito della prima versione

La prima versione comprende:

- timer Focus, Pausa breve e Pausa lunga;
- ciclo Pomodoro configurabile;
- player per file audio locali;
- player per video e playlist YouTube pubblici incorporabili;
- una sola coda di ascolto per volta;
- preferenze persistenti nel browser;
- notifiche di sistema e segnale sonoro;
- PWA installabile minimale;
- interfaccia responsive in italiano;
- un solo linguaggio visivo astratto e organico.

Sono esclusi account, sincronizzazione tra dispositivi, statistiche, task manager, temi multipli, internazionalizzazione, backend e riproduzione offline di contenuti YouTube.

## Esperienza principale

Al primo accesso l'utente vede subito il timer e un player vuoto. Può avviare Focus senza configurazione, oppure aggiungere musica trascinando file, scegliendoli dal dispositivo o incollando un URL YouTube.

Il timer è il protagonista visivo; il player rimane sempre disponibile sotto di esso. Le impostazioni vivono in un pannello compatto, non in una schermata separata. Su mobile l'interfaccia forma una singola colonna.

L'avvio iniziale del timer costituisce il gesto utente usato, nello stesso handler e senza attendere operazioni asincrone intermedie, per:

1. sbloccare immediatamente il contesto audio;
2. richiedere il permesso nativo per le notifiche, se non è già stato deciso;
3. avviare il timer.

Non viene mostrato un pre-prompt personalizzato per le notifiche. Se il browser rifiuta o non supporta la richiesta, il timer parte comunque e le impostazioni mostrano lo stato reale del permesso.

## Timer e ciclo

I valori iniziali sono:

- Focus: 25 minuti;
- Pausa breve: 5 minuti;
- Pausa lunga: 15 minuti;
- Focus per ciclo: 4.

Un ciclo contiene quattro Focus. I primi tre conducono a una Pausa breve; il quarto conduce a una Pausa lunga, quindi il conteggio riparte.

Il timer offre Start, Pausa e Reset. Reset riporta la sessione corrente alla sua durata iniziale, la mette in pausa e non azzera il ciclo. L'azzeramento del ciclo è un'azione separata nelle impostazioni.

Cambiare modalità abbandona la sessione corrente. Qualsiasi passaggio manuale da Focus a una pausa conta come Focus concluso e fa avanzare il ciclo. Passare da una pausa a Focus o tra i due tipi di pausa non modifica il conteggio. Selezionare la modalità già attiva non produce effetti.

Le modifiche alle durate o al numero di Focus per ciclo si applicano dalla sessione successiva. Un Reset applica subito la nuova durata alla modalità corrente.

L'avvio automatico delle pause e l'avvio automatico dei Focus sono due preferenze indipendenti, entrambe disattivate inizialmente.

### Correttezza in background

Durante la riproduzione il timer conserva un orario assoluto di scadenza. L'interfaccia deriva il tempo restante dalla differenza con l'orario corrente, anziché considerare affidabili gli intervalli JavaScript.

Al ritorno da una tab inattiva o da un dispositivo sospeso, l'app riconcilia lo stato con l'orario reale. Se una sessione è terminata, conclude soltanto quella prima sessione; non simula una catena di sessioni mai vissute, anche quando l'avvio automatico è abilitato.

Browser e sistemi operativi possono sospendere completamente pagina, audio e JavaScript. La V1 non promette una campana o notifica puntuale durante tale sospensione: l'avviso viene emesso quando l'app riprende, mentre il tempo mostrato resta corretto.

## Segnale di fine sessione

Il completamento produce un singolo tocco di campana lieve ma chiaramente udibile. Durante il tocco, l'eventuale musica in riproduzione viene abbassata temporaneamente e poi torna esattamente al volume precedente senza interrompersi.

Volume e mute della musica non controllano la campana. Il volume degli avvisi è una preferenza separata. La struttura permette di sostituire il suono in futuro, ma la V1 offre una sola campana.

## Player e coda di ascolto

Esistono un solo player visibile e una sola coda. La coda contiene file locali oppure contenuti YouTube, mai entrambi. Non esiste un selettore permanente tra due player.

Quando la coda è vuota, il player mostra le modalità di inserimento locale e YouTube. Quando è popolata, mostra soltanto i controlli e le azioni pertinenti alla sorgente corrente. Per cambiare sorgente l'utente deve prima scegliere **Svuota coda**; l'app non sostituisce automaticamente la coda.

Timer e musica sono indipendenti: Start, Pausa e Reset del timer non avviano né fermano il player.

I controlli condivisi sono:

- contenuto corrente;
- Play/Pausa;
- Previous e Next;
- barra di avanzamento con seek;
- tempo corrente e durata;
- volume e mute;
- shuffle;
- un solo pulsante di ripetizione che cicla tra disattivata, coda e traccia.

Con ripetizione disattivata, il player si ferma alla fine della coda. Con ripetizione coda, riparte dall'inizio; con ripetizione traccia, ricomincia il contenuto corrente. Shuffle modifica l'ordine di avanzamento senza perdere la coda originale.

I controlli non disponibili per un particolare contenuto restano visibili ma disabilitati, con stato comprensibile e accessibile.

### File locali

L'utente può selezionare più file con un input nativo `audio/*` oppure trascinarli nell'area del player. I file vengono riprodotti direttamente tramite URL locali temporanei e non vengono caricati o copiati fuori dal dispositivo.

La coda conserva l'ordine di selezione, salvo shuffle. File non decodificabili vengono rifiutati con un messaggio vicino al player; non vengono imposti limiti artificiali a numero o dimensione.

Gli URL temporanei vengono rilasciati quando la coda viene svuotata o la pagina viene chiusa.

### YouTube

L'utente può incollare URL pubblici di singoli video o playlist. Più video singoli possono essere aggiunti alla coda YouTube corrente. L'inserimento di una playlist in una coda YouTube già popolata richiede conferma e sostituisce quella coda.

La riproduzione usa la YouTube IFrame Player API caricata soltanto dopo l'inserimento del primo URL YouTube. Autoplay, seeking, durata, Previous e Next rispettano le capacità e le restrizioni esposte da YouTube. Video privati, rimossi o non incorporabili producono un errore chiaro; l'app non tenta aggiramenti.

## Preferenze e persistenza

Le preferenze vengono salvate localmente, validate al caricamento e ripristinate con valori predefiniti quando risultano mancanti o non valide.

Vengono ricordati:

- durate delle tre modalità;
- numero di Focus per ciclo;
- avvio automatico delle pause;
- avvio automatico dei Focus;
- volume e mute della musica;
- volume degli avvisi;
- indicazione che la richiesta delle notifiche è già stata tentata; il permesso effettivo viene sempre letto dal browser;
- movimento ridotto;
- sorgente usata più recentemente, impiegata soltanto per dare priorità alla relativa azione nel player vuoto.

Non vengono conservati coda, file, URL YouTube, posizione di riproduzione, sessione timer corrente o avanzamento del ciclo. Un refresh produce timer e coda nuovi mantenendo solo le preferenze.

## Notifiche e PWA

La V1 include manifest, icone e service worker essenziale per essere installabile. Non introduce una strategia complessa di cache offline.

Le notifiche richiedono un contesto sicuro. Su iPhone e iPad sono disponibili solo per l'app aggiunta alla schermata Home; in una normale scheda Safari l'interfaccia spiega il limite senza bloccare il timer.

Senza backend o Web Push remoto non è possibile garantire notifiche future mentre il dispositivo è completamente sospeso. Il service worker non viene presentato come soluzione a tale limite.

## Direzione visiva

L'interfaccia non rappresenta stanze, pioggia, finestre, personaggi, piante o altri scenari illustrati. Usa forme astratte morbide, vagamente floreali, come linguaggio comune di timer, player, pannelli e pulsanti.

Principi visivi:

- colori pastello piatti e nessun gradiente;
- contorni scuri morbidi e leggermente irregolari;
- angoli e sagome organiche, non semplici rettangoli arrotondati uniformi;
- ampio spazio libero e gerarchia tipografica netta;
- font display rotondo nello spirito di Cooper Black, con licenza adatta e peso contenuto;
- contrasto sufficiente per testo e controlli;
- differenza immediatamente riconoscibile tra Focus e pause senza cambiare l'intera interfaccia.

Le forme respirano con cicli di 8–14 secondi e spostamenti di pochi pixel. Click e cambi di modalità producono una risposta leggermente più visibile. `prefers-reduced-motion` e la preferenza interna disattivano il movimento non essenziale.

## Accessibilità e interazioni

Tutti i controlli sono raggiungibili da tastiera, hanno focus visibile, etichette accessibili e aree di interazione adeguate al touch. Colore e animazione non sono gli unici segnali di stato. Slider e progress bar usano controlli nativi dove possibile.

Le micro-interazioni comunicano pressione, cambio di stato, completamento e caricamento; non rallentano operazioni o lettura. Gli errori appaiono vicino all'azione che li ha causati e non cancellano dati validi già presenti.

## Architettura

Si mantiene Preact, TypeScript e Vite senza dipendenze runtime aggiuntive.

La soluzione separa soltanto le responsabilità che hanno logica propria:

- modello puro del timer e del ciclo;
- stato dell'app e persistenza delle preferenze;
- player locale basato su `HTMLAudioElement`;
- integrazione YouTube caricata su richiesta;
- player UI condiviso;
- scena UI e stili.

Locale e YouTube non vengono forzati dentro una gerarchia estensibile per sorgenti future. Condividono lo stato e i comandi necessari alla UI; le differenze restano nei due piccoli motori concreti.

Il segnale di campana usa Web Audio, evitando una libreria audio. Le forme organiche sono CSS e SVG leggero; non vengono introdotti canvas continuo, WebGL o grandi asset raster.

## Gestione degli errori

- Preferenze corrotte: ignorare i campi non validi e usare i valori predefiniti.
- File locale non riproducibile: saltarlo senza invalidare gli altri file scelti.
- URL YouTube non riconosciuto: mantenere invariata la coda e mostrare l'errore.
- Contenuto YouTube non incorporabile: segnalarlo e consentire Next o rimozione.
- API YouTube non caricabile: mantenere il timer operativo e offrire un nuovo tentativo.
- Permesso notifiche negato: non richiederlo ripetutamente; mostrare lo stato nelle impostazioni.
- Audio bloccato dal browser: riprovare soltanto dopo una successiva interazione utente.

## Verifica

La logica pura lascia almeno un controllo eseguibile per:

- transizioni del ciclo, incluse quelle manuali;
- riconciliazione del timer dopo inattività;
- parsing degli URL YouTube;
- modalità di ripetizione e avanzamento della coda.

Il build TypeScript/Vite deve riuscire senza errori. Una verifica manuale copre file locali, drag-and-drop, YouTube, seek, volume, notifiche, installazione PWA, layout mobile, tastiera e movimento ridotto.

## Criteri di accettazione

La V1 è pronta quando un nuovo utente può:

1. iniziare un Focus in un click;
2. lasciare la tab inattiva e ritrovare un tempo corretto;
3. sentire la campana senza perdere volume o riproduzione musicale;
4. usare una coda locale o YouTube dalla stessa interfaccia;
5. cambiare sorgente soltanto svuotando la coda;
6. ricaricare la pagina e ritrovare le preferenze, ma non la coda;
7. usare le funzioni principali da tastiera e su uno schermo mobile;
8. installare la PWA senza che l'app dipenda da un backend.
