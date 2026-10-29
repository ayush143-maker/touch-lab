# Finger-pattern experiment

This page uses a standardized, distance-weighted k-nearest-neighbours (k-NN) classifier over 27 derived browser-visible features. It compares each new contact with examples the current user explicitly labelled as thumb or index/other on this device.

## Feature groups
Contact duration; normalized path/displacement and straightness; mean/max/variation of movement speed; reported pressure and pressure variation; reported width/height and ratio; sample rate; tilt; direction changes/reversals; pauses; tangential pressure; and TouchEvent radius/force where supported.

## Evaluation
The page reports grouped leave-one-batch-out validation. Contacts from one batch are tested against examples in other batches, rather than randomly splitting neighbouring contacts from the same capture batch. Accuracy is only displayed when both classes have at least five examples from at least two batches each. Two batches per class are a minimum exploratory check; more independent batches and later sessions are recommended.

## Privacy and limitations
Only derived features and labels are stored in this browser's local storage. Raw coordinates/traces are not saved in the model dataset. JSON export is optional and remains a user-initiated download. Nothing is uploaded by this static site.

The model predicts **thumb-like vs index/other-like** from browser-visible measurements. It cannot directly sense the physical digit, infer a verified identity, or authenticate an owner. Missing/constant pressure, size or touch-radius fields are normal on some browsers. Model scores are specific to the collected device/protocol and are not general accuracy guarantees.
