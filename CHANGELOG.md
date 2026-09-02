# Changelog

*[Readme](README.md)* · *[Version française](README.fr.md)*

All notable changes to Gestock. Dates are release dates; the project follows no formal versioning
yet, so entries are grouped by the change that shipped them.

## Unreleased

### Added

- **Mealie link (optional).** With `MEALIE_URL` and `MEALIE_TOKEN` set, a Recettes tab crosses
  the recipe book with the pantry: open a recipe and every ingredient says whether you already
  have it, where and until when — so nothing gets bought twice. Missing items copy out as a
  shopping list, and a filter surfaces the recipes that would save a lot about to expire. Mealie is read from the server (the token never reaches the browser) into a
  daily index of recipe ingredients, so the answer is instant and survives a Mealie outage.
  Mapping a Mealie food to a product is explicit, with a name-based proposal and a "toujours là"
  state for what is never inventoried. Recipes whose ingredients are entirely free text are set
  aside and counted rather than reported as complete.
- **A drawing of each place.** "Ouvrir" on a freezer or cupboard stacks its sections like the
  drawers they are, with their contents and an *Ajouter ici* button per drawer, so storing starts
  from where you are looking rather than from a general menu.
- **Linking a product to a recipe ingredient while entering it**, rather than only in bulk
  afterwards — the moment the name is in mind is the moment to say what it is.
- **First version.** Inventory of what is left in the freezer and the cupboards, by place and
  section, with quantities, storage dates and expiry dates.
- **Barcode scanning** from the phone camera, with a lookup in Open Food Facts that pre-fills the
  name, brand, aisle and picture. The native `BarcodeDetector` is used where it exists; elsewhere
  a WebAssembly reader is loaded on demand, and its `.wasm` is served by the app rather than a
  CDN so that scanning survives an internet outage.
- **Products separate from lots.** A product is described once; each lot records one exemplar in
  one place, with its own quantity and dates. Scanning a product already owned goes straight to
  the lot form.
- **Shared household inventory.** The first account is the administrator and invites the others
  with a code, valid seven days and usable once. Every lot keeps the name of who stored it, and
  the inventory reloads when a phone comes back to the foreground.
- **Alerts** in three buckets — expired, within three days, within the month — each lot shown
  with the place and section to head for. The tab carries the count of the first two.
- **Places and sections** are editable: removing a section moves its lots up to the place rather
  than deleting them, and a place still holding lots refuses to be deleted.
- **JSON export** of the whole inventory from the account page, plus a `tools/motdepasse.js`
  shipped inside the image to reset a forgotten password from the host.
