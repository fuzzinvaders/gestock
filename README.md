# Gestock

*[Version française](README.fr.md)* · *[Changelog](CHANGELOG.md)*

Know what is left in the freezer and the cupboards: which shelf or drawer, how much is left, when
it was stored and when it expires. Barcodes are scanned with the phone camera and looked up in
Open Food Facts, so a product is described once and never again. Installable as a PWA, shared by
the whole household. **Self-hosted**: a single Docker container, no external database, no
third-party account — your data stays on your own server or NAS, in a Docker volume.

## Run with Docker (recommended)

```bash
docker compose up -d
```

This pulls the published image `ghcr.io/fuzzinvaders/gestock:latest` — nothing to build. To run
from source instead (after changing the code), uncomment `build` in
[docker-compose.yml](docker-compose.yml) and run `docker compose up -d --build`.

Open `http://localhost:8080`. On first visit the app asks you to create the first account
(username + password); that account is the administrator and hands out invitation codes to the
rest of the household. Everyone then sees and edits the same inventory.

> **Camera and HTTPS.** Browsers only grant camera access in a secure context. Over plain `http`
> on a local IP, barcode *scanning* is unavailable — typing the code by hand still works. To scan
> from a phone, serve the app over HTTPS: see below.

Updating an existing instance:

```bash
docker compose pull && docker compose up -d
```

Data (accounts plus places, products and lots) lives in the Docker volume `gestock-data`, mounted
at `/data` — it survives `docker compose down` / `up`.

## Deploying behind Traefik

```bash
docker network create proxy   # if the network does not exist yet
docker compose -f docker-compose.traefik.yml up -d
```

Copy [.env.example](.env.example) to `.env` next to that file and set at least `DOMAIN` (for
example `gestock.example.org`) — `ORIGIN` is then derived automatically. No port is published on
the host: Traefik routes traffic over the shared `proxy` network, in HTTPS — which is also what
makes the camera available on phones.

## Development (without Docker)

Two processes side by side:

```bash
npm install
npm run dev:server   # API + data, on http://localhost:3000 (JSON files under ./.data)
npm run dev          # Vite front-end with hot reload, on http://localhost:5173
```

Open `http://localhost:5173` — Vite proxies `/api` to the server above, and `localhost` counts as
a secure context, so the camera works in development. `npm test` (vitest) covers calendar dates,
expiry levels, server-side validation and the inventory operations.

## How it works

- **Add** — scan a barcode, or type it, or pick a product you already have. An unknown code is
  looked up in Open Food Facts: name, brand, aisle and picture come back pre-filled, and you
  correct what is wrong. A code that is not in the public base is described by hand, once.
- **Product vs. lot** — a *product* is the jar of honey in general; a *lot* is that jar, on the
  second shelf, opened in March. Scanning a product you already own skips straight to the lot.
- **Places and sections** — a place is a freezer, a cupboard, a cellar; sections are its drawers
  and shelves. Removing a section does not delete anything: its lots move up to the place itself.
- **Quantities** — each lot carries what is left, in the product's unit. "J'en prends" subtracts
  what you take; when nothing is left, the lot disappears from the inventory.
- **Dates** — the storage date defaults to today, and the expiry can come from the product's
  usual shelf life or from the +1 week / +6 months shortcuts.
- **Alerts** — expired, to eat within three days, and within the month, each lot with the place
  and section to head for. The tab carries the count of the first two.
- **Household** — the first account invites the others with a code, valid seven days and usable
  once. Every lot keeps the name of who put it there.
- **Account** — password, invitations, members, and a JSON export of the whole inventory.

## Backing up

The Docker volume survives `docker compose down`, but **not the loss of the machine**. The
simplest backup copies its contents out:

```bash
docker run --rm -v gestock_gestock-data:/data -v "$PWD":/out alpine \
  tar czf /out/gestock-$(date +%F).tar.gz -C /data .
```

To restore, the reverse, with the container stopped:

```bash
docker compose down
docker run --rm -v gestock_gestock-data:/data -v "$PWD":/in alpine \
  sh -c "rm -rf /data/* && tar xzf /in/gestock-2026-09-01.tar.gz -C /data"
docker compose up -d
```

A single `cron` line on the host automates it. Failing that, the **Compte** page offers a JSON
export — lighter, but you have to remember it, and it does not include the accounts themselves.

## Forgotten password

Gestock sends no email, so no recovery screen could verify anyone's identity. The right comes
from access to the machine instead:

```bash
docker exec gestock node tools/motdepasse.js <username>
```

With no password argument one is drawn at random and printed — nothing goes through the shell
history. Every open session is closed; restart the container for it to take effect.

## Architecture

- Front-end: React + TypeScript + Vite + Tailwind, installable PWA ([vite.config.ts](vite.config.ts)).
- Back-end: [server/server.js](server/server.js), plain Node with **no npm dependency**, serving
  both the built static files and the REST API under `/api/*`.
- Data: JSON files under `DATA_DIR` ([server/store.js](server/store.js)) — `users.json` (accounts,
  session secret, invitations) and `inventaire.json` (the household's shared inventory). Atomic
  writes (temp file then rename); every write goes through `updateInventory`, which reads and
  saves without an `await` in between, so two phones cannot overwrite each other.
- Auth: scrypt-hashed passwords, session as an HMAC-SHA256 signed cookie (`httpOnly`,
  `SameSite=Lax`). Login and registration attempts are throttled (10 failures per quarter hour
  per IP).
- Barcodes: [src/lib/scan.ts](src/lib/scan.ts) uses the native `BarcodeDetector` where it exists
  (Chrome, Edge) and lazily loads a WebAssembly reader elsewhere (Safari, Firefox). The `.wasm`
  is served by the app itself, not by a CDN, so scanning survives an internet outage.
- Open Food Facts: queried **from the server** ([server/openfoodfacts.js](server/openfoodfacts.js)),
  which avoids CORS and caches answers for the whole household. The network is never required —
  an unknown code is typed in by hand.

## Licence

[AGPL-3.0-or-later](LICENSE).
