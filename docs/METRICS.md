# Calculated metrics and formulas

All calculations are estimates based on browser-observed pointer samples. Distances use CSS-pixel coordinates, not physical millimetres. A metric is shown as unavailable when no valid inputs support it. Metric cards list valid observation or supporting-contact counts; pointer-field missingness is separate.

## Timing and contacts

- **Contact duration:** `end.timeStamp - start.timeStamp` for a completed pointer contact when both timestamps are numeric. Active contacts use a live estimate.
- **Total contact duration:** sum of completed contact durations; **average / longest duration:** arithmetic mean / maximum of valid completed durations.
- **Tap classification:** duration at most 500 ms and path length at most 32 CSS px. This is a research heuristic, not a universal definition of a tap.
- **Inter-tap interval:** difference between end timestamps of consecutive classified taps. **Tap frequency:** `1000 / meanInterTapIntervalMs` when the interval is positive.
- **Mean sample interval:** arithmetic mean of positive timestamp differences between adjacent valid coordinate samples in each contact.
- **Sample frequency estimate:** (valid coordinate samples − 1) / total observed timestamp span in seconds. Irregular multi-contact sampling makes this an aggregate approximation.
- **Pause-gap count:** intervals greater than 250 ms. **Estimated pause duration:** sum of `max(0, intervalMs − 250)` for those intervals. This timing-gap heuristic does not prove the finger was physically still.
- **Stationary-contact duration:** sum of positive adjacent sample intervals whose coordinate distance is at most 1 CSS px.

## Motion and trajectory

For adjacent samples (x1, y1, t1) and (x2, y2, t2):

- **Segment distance:** `sqrt((x2 − x1)^2 + (y2 − y1)^2)`.
- **Path length:** sum of valid segment distances over contacts.
- **Straight displacement:** endpoint distance per contact, summed across contacts for the session.
- **X / Y displacement:** sum of each contact's final minus initial coordinate on that axis.
- **Instantaneous speed estimate:** `segmentDistancePx / (deltaTimeMs / 1000)` only when deltaTimeMs is positive.
- **Average speed estimate:** aggregate path length divided by summed completed contact duration, when duration is positive.
- **Maximum speed estimate:** maximum valid segment speed.
- **Acceleration estimate:** absolute difference between neighboring valid speed estimates divided by positive time between those estimates. It is sensitive to sampling jitter and is not a physical acceleration measurement.
- **Movement direction:** `atan2(sumDy, sumDx)` converted to degrees and normalized to [0, 360). A stationary/zero-net displacement has no defined direction.
- **Path-to-displacement ratio:** `totalPathLength / totalStraightDisplacement` when summed displacement is greater than zero.

## Contact dimensions and pressure

- **Mean width / height:** mean of positive reported pointer width and height values.
- **Mean width-to-height ratio:** mean of `width / height` for positive width and non-zero height pairs.
- **Maximum dimension change:** maximum reported value minus minimum reported value, requiring at least two valid samples.
- **Pressure min / max / mean:** extrema and arithmetic mean of numeric browser-reported `pressure` values.
- **Pressure variation:** population standard deviation of numeric pressure values, requiring at least two samples.

Pressure is browser-defined and can be constant or synthetic. Width/height can be estimated contact geometry. These are not calibrated force, fingertip area, or hardware sensor dimensions.

## Multi-touch and repeatability

- **Active pointer count:** number of pointer contacts the page currently tracks.
- **Maximum simultaneous pointers:** maximum active Pointer Event contacts observed.
- **Pairwise distance:** Euclidean CSS-pixel distance between pairs of active pointer coordinates at a logged pointer event. Mean and maximum are computed over valid observed pairs.
- **Coefficient of variation (CV):** `standardDeviation / abs(mean) × 100%` for tap durations, tap endpoint displacement, and inter-tap intervals. At least two valid observations and a non-zero mean are required.
- **Missing pointer-field percentage:** (null or unavailable tracked fields / (sample count × tracked property count)) × 100. The tracked set is the documented pointer-property inventory, not every platform property.

## Valid-sample counts and limitations

Each metric card lists valid value count or supporting-contact count. `n/a` means the required inputs were absent or the formula was undefined; it does not imply a measured zero. Coalesced samples may add several observed positions per dispatched event. Touch Event records are secondary and are not merged into pointer-derived calculations. Predicted events and pointerrawupdate records are retained in raw logs but excluded from derived trajectories to reduce duplication or prediction bias.

Metrics describe only samples exposed to this page in this browser session. They are not calibrated physical measurements and do not establish identity, uniqueness, or biometric reliability.