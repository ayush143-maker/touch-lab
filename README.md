# Touch Lab — Raw Touch Signal Research

A static, mobile-first, local-only browser workbench for inspecting browser-exposed Pointer Events and Touch Events. It records raw event snapshots, preserves unsupported fields as `null`, derives clearly labeled estimates, plots session samples, labels trials, and exports JSON / CSV.

**Live site:** https://ayush143-maker.github.io/touch-lab/  
**Source:** https://github.com/ayush143-maker/touch-lab

## Run locally

No package manager, build step, backend, API key, analytics SDK, or external runtime dependency is required.

1. Download or clone this repository.
2. Open `index.html` in a modern browser, or serve the folder from any static HTTP server.
3. Press **Start**, then interact with the surface.
4. Label a protocol and use **Begin trial / End trial** to delimit repeatable trials.
5. Export JSON for a complete structured record or CSV for spreadsheet-friendly rows.

Some browser security features and Clipboard API access behave differently when opening a file directly versus using localhost/HTTPS. Export downloads use standard Blob URLs.

## What it captures

- Pointer event fields: ID/type/primary status, buttons, coordinate systems, pressure values, contact dimensions, tilt/twist, movement deltas, altitude/azimuth angles when exposed, event timestamps, event flags, target metadata, modifier keys, and additional enumerable primitive fields.
- `getCoalescedEvents()` samples and `getPredictedEvents()` samples when available. Predicted points are stored as predictions and are **not** added to measured trajectory metrics.
- Pointer raw-update event records when the browser exposes that event type. These records are raw-only to avoid counting the same movement path twice.
- Touch event arrays (`touches`, `targetTouches`, `changedTouches`) and each touch's identifier, coordinates, radius, rotation angle, and force where exposed.
- Session metadata, runtime capability checks, observed-property counts, trial labels, raw records, derived samples, contact segments, multi-touch pair distances, and summary metrics.

Read [docs/RAW-PROPERTIES.md](docs/RAW-PROPERTIES.md) for the property inventory and [docs/METRICS.md](docs/METRICS.md) for formulas and valid-sample rules.

## Privacy

All collected samples stay in page memory. The app makes no fetch/XHR requests, uses no remote backend, has no analytics, and does not write to localStorage or IndexedDB. Exported files are generated locally by the browser. Refreshing or closing the page discards unexported samples. Exports contain interaction traces; handle them as sensitive research data.

## Limits and scientific interpretation

This page cannot expose raw touchscreen electrodes, capacitive matrices, physical sensor voltages, fingerprint ridges, or touch-controller internals. Browser properties can be absent, normalized, quantized, synthesized, coalesced, or delayed by the OS/browser. Reported pressure is not calibrated force; reported width/height are not physical electrode dimensions. Mouse, stylus, and touch input can produce different values.

Touch Events are recorded as secondary raw records. Pointer Events are the canonical source for derived contact metrics, preventing Touch Events from being counted as a second gesture. Browsers without Pointer Events still expose device context and Touch Event raw snapshots, but derived pointer metrics may remain empty.

No metric or combination of metrics is claimed to uniquely identify a person. Repeatability statistics are exploratory summaries, not validated biometric or identity results.

## Quality checks

- Use the **Run local self-check** button to check core derived formulas, null preservation, and CSV escaping.
- Follow [docs/TEST-REPORT.md](docs/TEST-REPORT.md) for the manual cross-device matrix, export checks, and remaining limitations.
- Use a real Android browser for hardware-specific validation: desktop emulation cannot confirm a device's actual touch, pressure, radius, or multi-touch implementation.

## Repository layout

- `index.html` — semantic page structure and controls
- `styles.css` — responsive dark dashboard and touch-surface affordances
- `app.js` — event capture, formulas, capabilities, plots, session/trial handling, and exports
- `docs/RAW-PROPERTIES.md` — raw-property inventory
- `docs/METRICS.md` — calculated metric formulas
- `docs/TEST-REPORT.md` — test coverage and device-validation boundaries

## Experimental local touch classifier

Touch Lab now includes a browser-only, labeled **thumb-vs-index/other** k-NN experiment with grouped hold-out-batch evaluation. It trains only after examples are captured or imported; it does not ship with a fabricated 90% score. See [docs/ML-MODEL.md](docs/ML-MODEL.md) for the dataset modality caveat, evaluation approach, and privacy boundaries.

Public research: [CapFingerId](https://github.com/interactionlab/CapFingerId) reports 92%+ left-vs-right thumb classification from capacitive images. A normal webpage cannot access those images, so that result is not the accuracy of this app's model.
