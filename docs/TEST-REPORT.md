# Touch Lab capability and test report

## Included deterministic self-checks

The page includes a **Run local self-check** action that tests:

1. Missing-field access returns `null` instead of crashing.
2. Euclidean distance returns 5 px for a 3-4-5 segment.
3. Speed conversion returns 100 px/s for 10 px over 100 ms.
4. CSV values containing quotes are escaped by doubling embedded quotes.
5. JSON serialization preserves explicit null values.
6. Capability support detection returns a boolean.

This is a deterministic in-page self-check of core helpers. It is not a substitute for device/hardware validation.

## Manual validation matrix

| Area | How to test | Expected result |
| --- | --- | --- |
| JavaScript initialization | Open the site and inspect DevTools console | No startup exception; dashboard and empty states render |
| Pointer capture | Start a session, tap and drag on the surface | Pointer records appear, markers follow contact, counters update |
| Contact lifecycle | Press, hold, move, release | One contact trace closes with duration/path estimates |
| Missing properties | Use a browser that omits pressure or stylus data | Missing values remain null; capability report distinguishes API support from observed values |
| Coalesced / predicted events | Use a browser that exposes the methods | Separate arrays appear in raw JSON; predictions do not enter derived path |
| Multi-touch | Place two contacts on a compatible touch screen | Concurrent-pointer count and pairwise distances update |
| Touch secondary source | Inspect touch-capable browser logs | Touch arrays are captured where exposed and not double-counted in pointer metrics |
| Charts | Drag and vary speed/pressure where the device supports it | Position, speed, pressure, and dimension plots render from samples |
| Labeled trials | Begin a labeled protocol, perform gesture, end trial | Trial metadata and summary appear in exported JSON |
| JSON export | Download after capture, parse with a JSON parser | Complete raw and derived structures parse |
| CSV export | Open CSV in a spreadsheet or use a CSV parser | Quotes are escaped; each raw record has a complete JSON cell |
| Reset / clear | Reset or clear after a test | Counters, raw log, samples, contacts, and plots reset |
| Mobile layout | Test at 320, 360, 390, and 430 CSS px; rotate device | Sections stack, controls remain reachable, no intentional fixed-width page layout |
| Privacy | Inspect Network panel while using the page | No app-originated sample uploads or analytics requests |

## Verification boundaries

The app includes deterministic helper checks and responsive CSS breakpoints, but a browser page scrape cannot prove real touchscreen behavior on every Android browser. Real-device checks for pressure, contact dimensions, stylus angles, coalescing, cancellation, and multi-touch must be performed on physical devices. Values vary by OS/browser, and several properties may never be observed on a normal phone.

## Known caveats

- Raw event cap: 100,000 records per session to protect page memory. Capture stops at the cap and export remains available.
- Pointer Events drive derived samples; Touch Events are retained as secondary raw records.
- pointerrawupdate data is raw-only. Predicted events are raw-only.
- Speed and acceleration are estimates based on CSS-pixel coordinates and browser timestamps.
- Tap threshold is 500 ms / 32 CSS px and should be kept constant when comparing trial sets.
- Browser APIs cannot expose raw capacitive matrices, physical forces, or hardware touch scans.
- Device metadata uses standard browser fields, remains in memory, and is not sent remotely.