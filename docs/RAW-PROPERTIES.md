# Raw property inventory

Touch Lab stores a snapshot of each captured event rather than converting raw values into one behavioral score. Properties that are not present or cannot be read are represented as `null`. Object-valued platform objects are summarized safely; primitive fields in the explicit inventories below are retained.

## Pointer / event properties

- Event identity and flags: `type`, `timeStamp`, `detail`, `cancelable`, `bubbles`, `composed`, `eventPhase`, `defaultPrevented`, `isTrusted`.
- Pointer identity/state: `pointerId`, `pointerType`, `isPrimary`, `button`, `buttons`.
- Coordinates: `clientX`, `clientY`, `pageX`, `pageY`, `screenX`, `screenY`, `offsetX`, `offsetY`, plus derived surface-local `surfaceX` / `surfaceY`.
- Contact / pressure: `pressure`, `tangentialPressure`, `width`, `height`.
- Stylus orientation: `tiltX`, `tiltY`, `twist`, `altitudeAngle`, `azimuthAngle`.
- Motion deltas: `movementX`, `movementY`.
- Context: `targetTagName`, `targetId`, `targetClassName`, `currentTargetTagName`, `viewAvailable`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`, `modifierStates`, and `enumerableExtras` for additional enumerable primitive fields.

Pointer records also retain samples exposed through `getCoalescedEvents()` and `getPredictedEvents()` in separate arrays. Predicted points are labeled as predictions and are not mixed into measured trajectory calculations. `pointerrawupdate` is saved as a raw event but intentionally excluded from derived samples to reduce duplicate movement accounting.

## Touch Event and Touch fields

Touch Events are stored as secondary raw records when available. Their `touchData` contains `touches`, `targetTouches`, and `changedTouches` arrays. Each Touch snapshot includes:

- `identifier`
- `clientX`, `clientY`, `pageX`, `pageY`, `screenX`, `screenY`
- `radiusX`, `radiusY`, `rotationAngle`, `force`
- Safe target metadata: `targetTagName`, `targetId`, `targetClassName`

Touch arrays are not included in derived pointer metrics when Pointer Events are available, avoiding duplicate counts for the same contact.

## Session / derived record fields

Each event has an index, source, type, wall-clock capture time, complete normalized properties, optional coalesced/predicted arrays, touch data, active pointer count, pairwise pointer distances, and notes. Each derived sample adds a sample index, contact ID, source event index, sample source, and the event's monotonic timestamp. Contact, trial, and session summaries are derived data, not raw hardware measurements.

## API and device context

The runtime report checks Pointer Events, Touch Events, coalesced/predicted-event methods, pointerrawupdate support, and `navigator.maxTouchPoints`. Device context uses standard browser values: user agent, platform where provided, language, viewport, screen size, pixel ratio, maximum touch points, event API availability, and online flag. It does not build a persistent fingerprint or send this information anywhere.