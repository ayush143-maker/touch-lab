# Touch Lab capability and test report

## Verification run — 2026-10-30

This repository was checked after publishing commit \`c708b1f4f5c75526dd4bb26c372ebe8a61d22add\`.

| Check | Result | Scope / interpretation |
| --- | --- | --- |
| Published HTML | PASS — HTTP 200 | Live endpoint title and metadata identify Touch Lab |
| Published JavaScript | PASS — HTTP 200 | Served as \`application/javascript\` |
| Published stylesheet | PASS — HTTP 200 | Served as \`text/css\` |
| JavaScript syntax | PASS | \`node --check app.js\` using Node.js v24.22.1 |
| HTML / JS identifier audit | PASS | 54 HTML IDs; 44 unique literal \`$("id")\` references; none missing |
| CSS structural sanity | PASS | Opening / closing brace counts balance |
| Built-in deterministic checks | PASS — 6/6 | Null preservation, distance, speed, CSV quoting, JSON null, capability boolean |
| Simulated interaction smoke test | PASS | 12 serialized Pointer + Touch records; 9 pointer-derived samples; 3 contacts |
| Simulated multi-touch | PASS | Two simultaneous pointers observed; maximum pair distance 120 CSS px |
| Raw-value retention | PASS | Synthetic pointer pressure and Touch radius values preserved in export |
| Export handlers | PASS | JSON and CSV download handlers invoked without runtime exception in the simulated DOM harness |
| Pages settings / repo tree | PASS | GitHub Pages enabled; public repository on \`main\`; all nine expected tracked paths present |

**Important scope note:** the interaction smoke test ran in a simulated DOM/event harness, not in a full graphical browser. The HTTP checks validate that the live resources are served; neither those checks nor the simulated harness proves that every Android browser reports hardware signals the same way.

## Included deterministic self-checks

The page's **Run local self-check** action tests:

1. Missing-field access returns \`null\` instead of crashing.
2. Euclidean distance returns 5 px for a 3-4-5 segment.
3. Speed conversion returns 100 px/s for 10 px over 100 ms.
4. CSV values containing quotes are escaped by doubling embedded quotes.
5. JSON serialization preserves explicit null values.
6. Capability support detection returns a boolean.

## Manual validation matrix

| Area | How to test | Expected result |
| --- | --- | --- |
| JavaScript initialization | Open the site and inspect DevTools console | No startup exception; dashboard and empty states render |
| Pointer capture | Start a session, tap and drag on the surface | Pointer records appear, markers follow contact, counters update |
| Contact lifecycle | Press, hold, move, release | One contact trace closes with duration/path estimates |
| Missing properties | Use a browser that omits pressure or stylus data | Missing values remain null; capability report distinguishes API support from observed values |
| Coalesced / predicted events | Use a browser that exposes the methods | Separate arrays appear in raw JSON; predictions do not enter derived path |
| Multi-touch | Place two contacts on a compatible touch screen | Concurrent-pointer count and pairwise distances update |
| Touch secondary source | Inspect touch-capable browser logs | Touch arrays are captured where exposed and are not double-counted in pointer metrics |
| Charts | Drag and vary speed/pressure where supported | Position, speed, pressure, and dimension plots render from samples |
| Labeled trials | Begin a labeled protocol, perform gesture, end trial | Trial metadata and summary appear in exported JSON |
| JSON export | Download after capture, parse with a JSON parser | Complete raw and derived structures parse |
| CSV export | Open CSV in a spreadsheet or use a CSV parser | Quotes are escaped; each raw record has a complete JSON cell |
| Reset / clear | Reset or clear after a test | Counters, raw log, samples, contacts, and plots reset |
| Mobile layout | Test at 320, 360, 390, and 430 CSS px; rotate device | Sections stack, controls remain reachable, no intentional fixed-width page layout |
| Privacy | Inspect Network panel while using the page | No app-originated sample uploads or analytics requests |

## Verification boundaries

Physical-device tests have **not** been performed by this run. A real Android browser is required to validate pressure, contact dimensions, stylus angles, coalescing, pointer cancellation, multi-touch behavior, mobile browser chrome, and touch performance. Desktop emulation cannot confirm the device's actual touch-controller behavior. Several fields may never be observed on a normal phone.

## Known caveats

- Raw event cap: 100,000 records per session to protect page memory. Capture stops at the cap and export remains available.
- Pointer Events drive derived samples; Touch Events are retained as secondary raw records.
- \`pointerrawupdate\` data is raw-only. Predicted events are raw-only.
- Speed and acceleration are estimates based on CSS-pixel coordinates and browser timestamps.
- Tap threshold is 500 ms / 32 CSS px and should remain constant when comparing trial sets.
- Browser APIs cannot expose raw capacitive matrices, physical forces, or hardware touch scans.
- Device metadata uses standard browser fields, remains in memory, and is not sent remotely.