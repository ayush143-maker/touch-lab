# Touch Lab classifier: design, data, and evaluation

## Target

This is an experimental, browser-only binary classifier for **thumb-like vs index/other-like contacts** using features that a normal browser can expose. It does not identify a named person, prove the phone owner is touching, or provide authentication-grade assurance.

## Why the public 90%+ result cannot be copied here

The public [CapFingerId dataset and model code](https://github.com/interactionlab/CapFingerId) contains 455,709 *capacitive images*. The associated paper reports over 92% accuracy for position-invariant left-thumb vs right-thumb classification from those images: [Le, Mayer & Henze, IUI 2019](https://doi.org/10.1145/3301275.3302295). Those inputs are low-resolution sensor/capacitive images, not JavaScript PointerEvent objects. Standard web APIs do not expose that image matrix, so loading the paper's model into this page would be a modality mismatch and its score would not transfer.

The public [AITouch dataset](https://data.mendeley.com/datasets/9v7bxv3dcc/2) provides touch positions, timestamps, and contact-surface measurements for user/gesture research, but its public labels are not a verified thumb-vs-index ground truth. It is not used as labeled finger data here.

## How the integrated model works

- **Local capture:** pressing “Record thumb” or “Record index / other” arms an explicitly labeled batch. Contact samples are read only from the Touch surface. Stylus/mouse pointers are excluded.
- **Features:** contact duration; normalized path and displacement; straightness; mean/max/variation of speed; reported pressure, pressure spread/range; reported contact width/height and ratio; sample rate; tilt; turns/reversals; pauses; tangential pressure; and TouchEvent radius/force where the browser exposes them.
- **Training:** standardized, distance-weighted k-nearest neighbours (k up to 5); feature scaling is calculated from the training examples.
- **Evaluation:** grouped leave-one-batch-out validation. All contacts from a held-out capture batch are tested against examples from other batches, reducing contact-level leakage. Metrics include accuracy, balanced accuracy, and per-class recall.
- **Prediction:** a predicted class and neighbour agreement are shown. Neighbour agreement is *not* a calibrated probability.
- **Data transport:** export/import JSON contains derived features, explicit labels, capture batch IDs, and sample counts only. No raw coordinate traces or image data are retained by the model module.

## How to collect useful examples

Use the same phone, browser, orientation, grip, and gesture type for both labels. Record one finger per batch. Aim for 8–15 contacts per batch and at least five different batches per label. Finish a batch before switching labels. Capture thumb and index/other examples in repeated, separate rounds rather than collecting all one class first and never repeating it.

The model can train after at least five contacts per label and at least two separate batches per label. Two batches per label are only a minimal exploratory evaluation; five or more batches per label are recommended. A reported score belongs only to that user/device/collection protocol. Validation on additional sessions and devices is necessary before any claim about general accuracy.

## Current status and limitations

- No public dataset is silently relabeled as thumb/index data.
- No weights or accuracy are claimed until this app has labeled examples from its own input modality.
- Contact width/height, pressure, touch radius, and force can be absent, constant, synthetic, or browser/device dependent.
- Web input captures are CSS-pixel/browser-event measurements, not raw sensor scan timings or capacitive electrode values.
- The model has no server component and no localStorage persistence. Refreshing the page clears its in-memory examples/model; export the dataset if it should be retained.
- A “thumb” prediction means the contact resembles samples labeled “thumb” in this dataset. It cannot tell whether the thumb belongs to the phone owner.
