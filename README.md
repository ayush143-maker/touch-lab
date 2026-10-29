# Touch Lab

**Live:** https://ayush143-maker.github.io/touch-lab/

A minimal, mobile-first finger-pattern experiment. Touch the surface to record a contact. The page can learn a personal **thumb-like vs index/other-like** pattern from explicitly labelled batches.

## Use
1. Open the live page on a touchscreen.
2. Select **Collect** beside Thumb, use only your thumb to make several separate touches, then tap **Finish batch**.
3. Repeat that process for Index / other, using only your index finger.
4. Collect at least 5 contacts across at least 2 separate batches for each label. For a more useful held-out test, aim for 5+ batches per label.
5. Touch the surface again. If there is enough data, the page shows a local estimate and neighbour agreement.

Calibration features are saved in this browser's local storage. They are not uploaded. Reset calibration removes the local examples. The optional JSON export contains derived features and labels, not raw coordinate traces.

## Important limits
A normal web page cannot directly read which physical finger made a touch. The estimate depends on the touch signals reported by the browser/device and your labelled examples. It may not generalise to another phone, grip, session, or user. Neighbour agreement is not a calibrated probability; this is not authentication or identity proof. The page does not claim an accuracy target before measuring one on held-out batches.

Public datasets based on raw capacitive images are not interchangeable with standard Pointer/Touch events.
