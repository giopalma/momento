# Momento

[English](#english) · [Italiano](#italiano)

## English

Momento is a Pomodoro timer for doing one thing at a time.

The name is the idea: stay in the moment you are in. You choose a goal, start
the timer and let everything else wait. The interface is calm and quiet, with a
soft lofi look and slowly moving shapes, so it can stay open on your screen for
hours without pulling your attention away from the work.

Everything runs in your browser. There is no account, no server and no
tracking: your tasks and preferences stay on your device, and music files you
add are played locally, never uploaded.

### Features

- **Timer**: Focus, short break and long break, grouped into cycles of four
  Focus sessions. Durations and cycle length can be changed in the settings.
- **Tasks**: write down what you want to get done next to the timer. New tasks
  appear at the top; completed ones are crossed out and removed.
- **Background music**: play your own audio files, or a public YouTube video or
  playlist. Timer and music are independent of each other.
- **Gentle signal**: a single soft bell marks the end of a session, with an
  optional system notification.
- **Installable**: Momento can be installed as an app from the browser.

YouTube needs an internet connection; everything else works on your device.

### Run it

With [pnpm](https://pnpm.io):

```sh
pnpm install
pnpm dev
```

Or with Docker, serving the built app on port 8080:

```sh
docker build -t momento .
docker run -p 8080:8080 momento
```

Run the tests with `pnpm test`.

## Italiano

Momento è un timer Pomodoro per fare una cosa alla volta.

Il nome è l'idea: restare nel momento in cui sei. Scegli un obiettivo, avvii il
timer e lasci che tutto il resto aspetti. L'interfaccia è calma e silenziosa,
con un'estetica lofi morbida e forme che si muovono lentamente, così può restare
aperta sullo schermo per ore senza distogliere l'attenzione dal lavoro.

Tutto funziona nel browser. Non ci sono account, server o tracciamento: task e
preferenze restano sul tuo dispositivo, e i file musicali che aggiungi vengono
riprodotti in locale, mai caricati online.

### Funzionalità

- **Timer**: Focus, pausa breve e pausa lunga, raggruppati in cicli di quattro
  Focus. Durate e lunghezza del ciclo si cambiano dalle impostazioni.
- **Task**: annota accanto al timer ciò che vuoi portare a termine. Le nuove
  task compaiono in cima; quelle completate vengono cancellate a matita e
  rimosse.
- **Musica di sottofondo**: riproduci i tuoi file audio, oppure un video o una
  playlist pubblica di YouTube. Timer e musica sono indipendenti tra loro.
- **Segnale discreto**: un solo tocco di campana leggero segna la fine di una
  sessione, con una notifica di sistema facoltativa.
- **Installabile**: Momento si può installare come app dal browser.

YouTube richiede una connessione a internet; tutto il resto funziona sul tuo
dispositivo.

### Avvio

Con [pnpm](https://pnpm.io):

```sh
pnpm install
pnpm dev
```

Oppure con Docker, che serve l'app compilata sulla porta 8080:

```sh
docker build -t momento .
docker run -p 8080:8080 momento
```

I test si lanciano con `pnpm test`.

## License / Licenza

[PolyForm Noncommercial License 1.0.0](LICENSE.md)
