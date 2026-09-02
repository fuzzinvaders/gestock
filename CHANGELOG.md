# Changelog

*[Readme](README.md)* · *[Version française](README.fr.md)*

All notable changes to Gestock. Dates are release dates; the project follows no formal versioning
yet, so entries are grouped by the change that shipped them.

## Unreleased

### Added

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
