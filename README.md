# sky + mo

Child First caseload board for Skylar (FRP) and Mo (clinician). A phone-first
board for the day's visits, what to bring, what is open on each family, the
texts that go out the night before, and a printable list for teaming.

## The one thing to know first

**The passcode is currently `1234`, and that is not real protection.**

The caseload is genuinely encrypted (AES-256-GCM, PBKDF2-SHA256 at 600,000
iterations), and the published site contains ciphertext only. But a four digit
passcode is ten thousand guesses. Anyone who downloads `caseload.enc.json` can
work through all ten thousand offline, and no amount of key stretching fixes
that. It is fine while nobody has the link. It is not fine as the only thing
standing between a stranger and this content.

Changing it is two commands:

```bash
export SKYMO_PASSCODE='a longer passphrase you will remember'
npm run data:encrypt && npm run build
```

A passphrase of four or five unrelated words takes brute force off the table
entirely. Everything else about the setup is already sound.

## How the data is handled

Client information never enters this repository and never reaches the server
in readable form.

```
data/caseload.source.mjs     plaintext, gitignored, never deployed
        │  npm run data:encrypt
        ▼
public/caseload.enc.json     ciphertext, committed, deployed
        │  fetched by the browser, decrypted after unlock
        ▼
        in memory only, for as long as the tab is open
```

- `npm run data:encrypt` reads the plaintext and writes the encrypted payload.
- `npm run data:decrypt` goes the other way, so the encrypted file can be the
  only copy that survives a fresh clone. You need the passcode.
- `npm run check:leaks` fails the build if any caseload sentence, six-word
  phrase, or name appears anywhere in `dist/`. This runs on every build.

The passcode is never stored. When "stay unlocked on this device" is ticked,
the derived AES key is cached in that browser instead, which unlocks instantly
and keeps the passcode itself out of storage. The lock button in the header
clears it.

## Everyday use

```bash
npm install
export SKYMO_PASSCODE=1234        # or your real one
npm run data:encrypt              # only when the caseload changed
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Icons, bundle, service worker, leak check |
| `npm test` | Drives the built app in a real browser, online and offline |
| `npm run verify` | Lint, build and test together |
| `npm run data:encrypt` | Plaintext caseload → encrypted payload |
| `npm run data:decrypt` | Encrypted payload → plaintext caseload |

Append `?date=2026-09-08` to pin the board to a particular day, which is handy
for a walkthrough or a screenshot.

`npm test` needs `SKYMO_PASSCODE` for the same reason the app does: the suite
decrypts the caseload at runtime so no client content sits in a test file. It
derives the shared-board write token from that same key, so nothing else needs
setting. If the bundled Chromium is missing, point `CHROMIUM` at one.

## Backups matter here

Ticks, lanes, supplies, drops and anything typed in live in one browser's local
storage. Clearing site data, switching phones or reinstalling takes it with
them. The `⋯` menu writes a backup file locally and restores from one. Nothing
is uploaded.

## Working offline

Registered as an installable app with a service worker that precaches the whole
bundle, so once the board has been opened on a device it keeps opening with no
signal. Add it to the home screen and it behaves like an app.

## Layout

```
data/            plaintext caseload (gitignored)
public/          encrypted payload, icons, manifest, service worker
scripts/         encrypt, decrypt, icon generation, sw stamping, leak check
src/lib/         dates, schedule, crypto, storage, clipboard, parsing, board state
src/components/  the screens
src/data/        message templates, the share library, build settings (no client content)
tests/           browser suites, online and offline
```

Two rules worth keeping:

- Nothing about a family goes anywhere except `data/caseload.source.mjs`.
  Not a placeholder, not an example, not a comment. The leak check enforces it.
- Seeded tasks read their wording from the caseload every load. Only what a
  person changes (done, lane) is saved, so editing the source file actually
  reaches the board instead of being masked by a stale saved copy.
