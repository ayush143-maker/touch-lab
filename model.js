(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var surface = $("touchSurface");
  if (!surface) return;

  var LABEL_THUMB = "thumb";
  var LABEL_OTHER = "other";
  var FEATURE_KEYS = [
    "durationMs", "pathNorm", "displacementNorm", "straightness",
    "meanSpeedNorm", "maxSpeedNorm", "speedStdNorm", "meanPressure",
    "pressureStd", "pressureRange", "meanWidthNorm", "meanHeightNorm",
    "widthHeightRatio", "widthStdNorm", "heightStdNorm", "sampleRateHz",
    "meanAbsTilt", "tiltStd", "meanTurnDeg", "reversalCount",
    "pauseRatio", "meanTangentialPressure", "meanRadiusXNorm",
    "meanRadiusYNorm", "radiusRatio", "meanTouchForce", "touchForceStd"
  ];
  var examples = [];
  var activeBatch = null;
  var activePointers = new Map();
  var trainedExamples = null;
  var batchCounter = 0;
  var predictionLog = [];
  var MAX_EXAMPLES = 20000;
  var MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  function numeric(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  function average(values) {
    var a = values.filter(function (v) { return typeof v === "number" && Number.isFinite(v); });
    return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null;
  }
  function deviation(values) {
    var a = values.filter(function (v) { return typeof v === "number" && Number.isFinite(v); });
    if (a.length < 2) return null;
    var m = average(a);
    return Math.sqrt(average(a.map(function (v) { return (v - m) * (v - m); })));
  }
  function range(values) {
    var a = values.filter(function (v) { return typeof v === "number" && Number.isFinite(v); });
    return a.length ? Math.max.apply(null, a) - Math.min.apply(null, a) : null;
  }
  function meanAbs(values) {
    return average(values.filter(function (v) { return typeof v === "number" && Number.isFinite(v); }).map(Math.abs));
  }
  function eventPosition(e) {
    var r = surface.getBoundingClientRect();
    return {
      x: r.width > 0 ? (e.clientX - r.left) / r.width : null,
      y: r.height > 0 ? (e.clientY - r.top) / r.height : null,
      width: r.width || 1,
      height: r.height || 1
    };
  }
  function sampleEvent(e) {
    var p = eventPosition(e);
    return {
      t: numeric(e.timeStamp),
      x: numeric(p.x),
      y: numeric(p.y),
      pressure: numeric(e.pressure),
      width: numeric(e.width) !== null ? e.width / p.width : null,
      height: numeric(e.height) !== null ? e.height / p.height : null,
      tiltX: numeric(e.tiltX),
      tiltY: numeric(e.tiltY),
      tangentialPressure: numeric(e.tangentialPressure),
      radiusX: null,
      radiusY: null,
      touchForce: null
    };
  }
  function appendPointerSample(record, e) {
    var s = sampleEvent(e);
    var last = record.samples[record.samples.length - 1];
    if (!last || last.t !== s.t || last.x !== s.x || last.y !== s.y) record.samples.push(s);
  }
  function attachTouchSignals(e) {
    if (!activeBatch || !e.changedTouches) return;
    var rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    for (var i = 0; i < e.changedTouches.length; i += 1) {
      var touch = e.changedTouches[i];
      var x = (touch.clientX - rect.left) / rect.width;
      var y = (touch.clientY - rect.top) / rect.height;
      var best = null;
      var bestDistance = Infinity;
      activePointers.forEach(function (record) {
        var sample = record.samples[record.samples.length - 1];
        if (!sample || sample.t === null || numeric(e.timeStamp) === null) return;
        if (Math.abs(sample.t - e.timeStamp) > 160 || sample.x === null || sample.y === null) return;
        var d = Math.hypot(sample.x - x, sample.y - y);
        if (d < bestDistance && d < 0.09) { best = sample; bestDistance = d; }
      });
      if (best) {
        best.radiusX = numeric(touch.radiusX) !== null ? touch.radiusX / rect.width : null;
        best.radiusY = numeric(touch.radiusY) !== null ? touch.radiusY / rect.height : null;
        best.touchForce = numeric(touch.force);
      }
    }
  }
  function summarizeContact(record) {
    var ss = record.samples;
    var rect = surface.getBoundingClientRect();
    var diagon = Math.max(1, Math.hypot(rect.width || 1, rect.height || 1));
    var path = 0;
    var speeds = [];
    var turns = [];
    var reversals = 0;
    var pauses = 0;
    var directions = [];
    var distances = [];
    var dtValues = [];
    for (var i = 1; i < ss.length; i += 1) {
      var a = ss[i - 1], b = ss[i];
      if (a.x === null || a.y === null || b.x === null || b.y === null) continue;
      var dx = (b.x - a.x) * (rect.width || 1);
      var dy = (b.y - a.y) * (rect.height || 1);
      var d = Math.hypot(dx, dy);
      var dt = a.t !== null && b.t !== null ? b.t - a.t : null;
      path += d;
      distances.push(d / diagon);
      if (dt !== null && dt > 0) {
        dtValues.push(dt);
        speeds.push((d / diagon) / (dt / 1000));
        if (dt > 120 && d / diagon < 0.0012) pauses += 1;
      }
      if (d > 0.3) directions.push(Math.atan2(dy, dx));
    }
    for (var j = 1; j < directions.length; j += 1) {
      var delta = Math.abs(((directions[j] - directions[j - 1] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      turns.push(delta * 180 / Math.PI);
      if (delta > Math.PI * 0.72) reversals += 1;
    }
    var validPositions = ss.filter(function (s) { return s.x !== null && s.y !== null; });
    var disp = 0;
    if (validPositions.length > 1) {
      var first = validPositions[0], last = validPositions[validPositions.length - 1];
      disp = Math.hypot((last.x - first.x) * (rect.width || 1), (last.y - first.y) * (rect.height || 1));
    }
    var widths = ss.map(function (s) { return s.width; });
    var heights = ss.map(function (s) { return s.height; });
    var ratios = ss.map(function (s) {
      return typeof s.width === "number" && typeof s.height === "number" && s.height > 0 ? s.width / s.height : null;
    });
    var pressures = ss.map(function (s) { return s.pressure; });
    var tangential = ss.map(function (s) { return s.tangentialPressure; });
    var absTilt = ss.map(function (s) {
      return typeof s.tiltX === "number" && typeof s.tiltY === "number" ? Math.hypot(s.tiltX, s.tiltY) : null;
    });
    var radiusX = ss.map(function (s) { return s.radiusX; });
    var radiusY = ss.map(function (s) { return s.radiusY; });
    var radiusRatios = ss.map(function (s) {
      return typeof s.radiusX === "number" && typeof s.radiusY === "number" && s.radiusY > 0 ? s.radiusX / s.radiusY : null;
    });
    var forces = ss.map(function (s) { return s.touchForce; });
    var duration = record.endTime !== null && record.startTime !== null ? Math.max(0, record.endTime - record.startTime) : null;
    var meanPath = path / diagon;
    var meanDisplacement = disp / diagon;
    var features = {
      durationMs: duration,
      pathNorm: meanPath,
      displacementNorm: meanDisplacement,
      straightness: meanPath > 0 ? meanDisplacement / meanPath : (meanPath === 0 ? 0 : null),
      meanSpeedNorm: average(speeds),
      maxSpeedNorm: speeds.length ? Math.max.apply(null, speeds) : null,
      speedStdNorm: deviation(speeds),
      meanPressure: average(pressures),
      pressureStd: deviation(pressures),
      pressureRange: range(pressures),
      meanWidthNorm: average(widths),
      meanHeightNorm: average(heights),
      widthHeightRatio: average(ratios),
      widthStdNorm: deviation(widths),
      heightStdNorm: deviation(heights),
      sampleRateHz: duration > 0 ? Math.max(0, ss.length - 1) / (duration / 1000) : null,
      meanAbsTilt: meanAbs(absTilt),
      tiltStd: deviation(absTilt),
      meanTurnDeg: average(turns),
      reversalCount: reversals,
      pauseRatio: distances.length ? pauses / distances.length : null,
      meanTangentialPressure: average(tangential),
      meanRadiusXNorm: average(radiusX),
      meanRadiusYNorm: average(radiusY),
      radiusRatio: average(radiusRatios),
      meanTouchForce: average(forces),
      touchForceStd: deviation(forces)
    };
    FEATURE_KEYS.forEach(function (key) {
      if (numeric(features[key]) === null) features[key] = null;
    });
    return { features: features, sampleCount: ss.length };
  }
  function setStatus(text, state) {
    var el = $("modelBatchStatus");
    el.textContent = text;
    if (state) el.dataset.state = state;
    else delete el.dataset.state;
  }
  function setResults(text, state) {
    var el = $("modelResults");
    el.textContent = text;
    if (state) el.dataset.state = state;
    else delete el.dataset.state;
  }
  function updateButtons() {
    $("modelStartThumb").disabled = !!activeBatch;
    $("modelStartOther").disabled = !!activeBatch;
    $("modelStartPredict").disabled = !!activeBatch || !trainedExamples;
    $("modelFinishBatch").disabled = !activeBatch;
  }
  function counts() {
    var out = { thumb: 0, other: 0, batches: { thumb: new Set(), other: new Set() } };
    examples.forEach(function (ex) {
      if (ex.label === LABEL_THUMB) { out.thumb += 1; out.batches.thumb.add(ex.batchId); }
      if (ex.label === LABEL_OTHER) { out.other += 1; out.batches.other.add(ex.batchId); }
    });
    return out;
  }
  function updateCounts() {
    var c = counts();
    $("modelExampleCount").textContent = String(examples.length);
    $("modelThumbCount").textContent = String(c.thumb);
    $("modelOtherCount").textContent = String(c.other);
    $("modelBatchCount").textContent = String(new Set(examples.map(function (ex) { return ex.batchId; })).size);
    updateButtons();
  }
  function startBatch(label) {
    if (activeBatch) { setStatus("Finish the current batch first.", "error"); return; }
    activeBatch = {
      id: "batch-" + Date.now().toString(36) + "-" + (++batchCounter),
      label: label,
      mode: label ? "label" : "predict",
      startedAt: new Date().toISOString(),
      activePointers: new Map(),
      contacts: []
    };
    activePointers = activeBatch.activePointers;
    predictionLog = [];
    $("modelPredictions").textContent = label ? "Batch is recording. Predictions are paused." : "Prediction batch is active. Touch the surface above.";
    setStatus((label === LABEL_THUMB ? "Recording THUMB batch." : label === LABEL_OTHER ? "Recording INDEX / OTHER batch." : "Prediction batch active.") +
      " Make several separate touches on the Touch surface, then tap Finish batch.", "active");
    updateButtons();
  }
  function startPredictionBatch() {
    if (!trainedExamples) { setStatus("Train the model before starting a prediction batch.", "error"); return; }
    startBatch(null);
  }
  function onPointerDown(e) {
    if (!activeBatch || e.pointerType !== "touch") return;
    var id = String(e.pointerId);
    var rec = { pointerId: id, startTime: numeric(e.timeStamp), endTime: null, samples: [] };
    appendPointerSample(rec, e);
    activePointers.set(id, rec);
  }
  function onPointerMove(e) {
    if (!activeBatch || e.pointerType !== "touch") return;
    var rec = activePointers.get(String(e.pointerId));
    if (rec) appendPointerSample(rec, e);
  }
  function onPointerEnd(e, canceled) {
    if (!activeBatch || e.pointerType !== "touch") return;
    var id = String(e.pointerId);
    var rec = activePointers.get(id);
    if (!rec) return;
    appendPointerSample(rec, e);
    rec.endTime = numeric(e.timeStamp);
    activePointers.delete(id);
    if (canceled || rec.samples.length < 2) return;
    var result = summarizeContact(rec);
    var contact = { features: result.features, sampleCount: result.sampleCount };
    activeBatch.contacts.push(contact);
    if (activeBatch.mode === "predict") {
      var prediction = predict(trainedExamples, contact.features);
      if (prediction) {
        predictionLog.unshift({
          label: prediction.label,
          agreement: prediction.agreement,
          sampleCount: contact.sampleCount,
          at: new Date().toLocaleTimeString()
        });
        predictionLog = predictionLog.slice(0, 10);
        renderPredictions();
      } else {
        predictionLog.unshift({ label: "Unknown", agreement: 0, sampleCount: contact.sampleCount, at: new Date().toLocaleTimeString() });
        predictionLog = predictionLog.slice(0, 10);
        renderPredictions();
      }
      setStatus("Prediction batch: " + activeBatch.contacts.length + " contact(s). Finish the batch when done.", "active");
    } else {
      setStatus("Recording " + (activeBatch.label === LABEL_THUMB ? "THUMB" : "INDEX / OTHER") +
        ": " + activeBatch.contacts.length + " contact(s) captured in this batch.", "active");
    }
  }
  function onTouch(e) {
    if (activeBatch && activeBatch.mode === "label") attachTouchSignals(e);
  }
  function finishBatch() {
    if (!activeBatch) return;
    if (!activeBatch.contacts.length) {
      setStatus("No completed touch was captured. Keep one finger on the Touch surface, make contacts, then finish.", "error");
      activePointers.clear();
      return;
    }
    var finished = activeBatch;
    activePointers.clear();
    activeBatch = null;
    activePointers = new Map();
    if (finished.mode === "label") {
      finished.contacts.forEach(function (c, i) {
        examples.push({
          id: finished.id + "-contact-" + (i + 1),
          batchId: finished.id,
          label: finished.label,
          capturedAt: finished.startedAt,
          features: c.features,
          sampleCount: c.sampleCount
        });
      });
      if (examples.length > MAX_EXAMPLES) examples = examples.slice(examples.length - MAX_EXAMPLES);
      trainedExamples = null;
      setResults("Dataset changed. Train & evaluate again to refresh the model.", "warn");
      setStatus("Saved " + finished.contacts.length + " labeled contact(s) in one " +
        (finished.label === LABEL_THUMB ? "THUMB" : "INDEX / OTHER") + " batch. Nothing was uploaded.", "pass");
      updateCounts();
    } else {
      setStatus("Prediction batch finished. " + finished.contacts.length + " contact(s) were classified; they were not added to training data.", "pass");
      renderPredictions();
    }
    updateButtons();
  }
  function featureStats(rows) {
    var stats = {};
    FEATURE_KEYS.forEach(function (key) {
      var values = rows.map(function (ex) { return ex.features[key]; }).filter(function (v) { return numeric(v) !== null; });
      var m = average(values);
      var d = deviation(values);
      stats[key] = { mean: m, std: d && d > 1e-8 ? d : 1 };
    });
    return stats;
  }
  function predict(trainRows, features) {
    if (!trainRows || !trainRows.length) return null;
    var stats = featureStats(trainRows);
    var neighbours = trainRows.map(function (ex) {
      var sum = 0, n = 0;
      FEATURE_KEYS.forEach(function (key) {
        var a = numeric(features[key]), b = numeric(ex.features[key]);
        if (a === null || b === null) return;
        var z = (a - b) / stats[key].std;
        sum += z * z;
        n += 1;
      });
      return { label: ex.label, distance: n >= 2 ? sum / n : Infinity };
    }).filter(function (neighbour) { return Number.isFinite(neighbour.distance); });
    neighbours.sort(function (a, b) { return a.distance - b.distance; });
    var selected = neighbours.slice(0, Math.min(5, neighbours.length));
    if (!selected.length) return null;
    var votes = { thumb: 0, other: 0 };
    selected.forEach(function (row) { votes[row.label] += 1 / (0.15 + row.distance); });
    var total = votes.thumb + votes.other;
    var label = votes.thumb >= votes.other ? LABEL_THUMB : LABEL_OTHER;
    var agreement = Math.round(100 * selected.filter(function (row) { return row.label === label; }).length / selected.length);
    return { label: label, agreement: agreement, votes: votes, total: total, neighbourCount: selected.length };
  }
  function runGroupedValidation(rows) {
    var groups = Array.from(new Set(rows.map(function (ex) { return ex.batchId; })));
    var all = [];
    groups.forEach(function (groupId) {
      var test = rows.filter(function (ex) { return ex.batchId === groupId; });
      var train = rows.filter(function (ex) { return ex.batchId !== groupId; });
      var trainLabels = new Set(train.map(function (ex) { return ex.label; }));
      if (!trainLabels.has(LABEL_THUMB) || !trainLabels.has(LABEL_OTHER)) return;
      test.forEach(function (ex) {
        var p = predict(train, ex.features);
        if (p) all.push({ actual: ex.label, predicted: p.label, batchId: groupId });
      });
    });
    var correct = all.filter(function (r) { return r.actual === r.predicted; }).length;
    var thumbRows = all.filter(function (r) { return r.actual === LABEL_THUMB; });
    var otherRows = all.filter(function (r) { return r.actual === LABEL_OTHER; });
    var thumbRecall = thumbRows.length ? thumbRows.filter(function (r) { return r.predicted === LABEL_THUMB; }).length / thumbRows.length : null;
    var otherRecall = otherRows.length ? otherRows.filter(function (r) { return r.predicted === LABEL_OTHER; }).length / otherRows.length : null;
    return {
      groups: groups.length,
      evaluated: all.length,
      accuracy: all.length ? correct / all.length : null,
      thumbRecall: thumbRecall,
      otherRecall: otherRecall,
      balanced: thumbRecall !== null && otherRecall !== null ? (thumbRecall + otherRecall) / 2 : null
    };
  }
  function train() {
    if (activeBatch) { setResults("Finish the active batch before training.", "warn"); return; }
    var c = counts();
    var enoughBatches = c.batches.thumb.size >= 2 && c.batches.other.size >= 2;
    if (c.thumb < 5 || c.other < 5 || !enoughBatches) {
      trainedExamples = null;
      setResults("Not trained yet.\nNeed at least 5 contacts per label and at least 2 separate labeled batches for BOTH labels. Recommended for a more useful test: 5+ batches per label, 8–15 contacts per batch.", "warn");
      updateButtons();
      return;
    }
    trainedExamples = examples.map(function (ex) {
      return { label: ex.label, batchId: ex.batchId, features: Object.assign({}, ex.features) };
    });
    var cv = runGroupedValidation(examples);
    var lines = [
      "Model: standardized, distance-weighted k-nearest neighbors (k ≤ 5).",
      "Training contacts: " + examples.length + " across " + new Set(examples.map(function (ex) { return ex.batchId; })).size + " separate labeled batches.",
      "Grouped leave-one-batch-out evaluation: " + (cv.evaluated ? cv.evaluated + " contacts from held-out batches" : "not enough independent batches to score") + "."
    ];
    if (cv.accuracy !== null) {
      lines.push("Accuracy: " + (100 * cv.accuracy).toFixed(1) + "%");
      lines.push("Balanced accuracy: " + (100 * cv.balanced).toFixed(1) + "%");
      lines.push("Thumb recall: " + (100 * cv.thumbRecall).toFixed(1) + "% · Index/other recall: " + (100 * cv.otherRecall).toFixed(1) + "%");
      if (c.batches.thumb.size < 5 || c.batches.other.size < 5) {
        lines.push("Quality flag: preliminary — fewer than 5 independent batches for at least one label. Scores may be unstable.");
      } else {
        lines.push("Quality flag: batch-separated evaluation completed; still validate on another phone/session before relying on the score.");
      }
    } else {
      lines.push("No accuracy shown: collect more independent batches before evaluating.");
    }
    lines.push("Important: this is a local, user-calibrated thumb-vs-index/other experiment, not proof of user identity.");
    setResults(lines.join("\n"), cv.accuracy !== null && cv.accuracy >= 0.9 && c.batches.thumb.size >= 5 && c.batches.other.size >= 5 ? "pass" : "warn");
    updateButtons();
  }
  function renderPredictions() {
    if (!predictionLog.length) {
      $("modelPredictions").textContent = "No predictions yet.";
      return;
    }
    $("modelPredictions").textContent = predictionLog.map(function (p, i) {
      return (i + 1) + ". " + p.at + " · " + (p.label === LABEL_THUMB ? "THUMB-like" : p.label === LABEL_OTHER ? "INDEX / OTHER-like" : "UNKNOWN") +
        " · neighbor agreement " + p.agreement + "% · " + p.sampleCount + " samples";
    }).join("\n");
  }
  function exportData() {
    var payload = {
      schemaVersion: "touch-lab-classifier-data-1",
      modelTarget: "thumb-vs-index-or-other",
      note: "User-labeled features; not identity proof. Only browser-exposed features are included.",
      featureKeys: FEATURE_KEYS,
      exportedAt: new Date().toISOString(),
      examples: examples
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "touch-lab-classifier-data.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Export created. The file contains labels and derived features; it is not uploaded.", "pass");
  }
  function validExample(ex) {
    if (!ex || (ex.label !== LABEL_THUMB && ex.label !== LABEL_OTHER) || typeof ex.batchId !== "string" || !ex.batchId) return false;
    if (!ex.features || typeof ex.features !== "object") return false;
    var hasFeature = false;
    for (var i = 0; i < FEATURE_KEYS.length; i += 1) {
      var v = ex.features[FEATURE_KEYS[i]];
      if (v !== null && v !== undefined && (typeof v !== "number" || !Number.isFinite(v))) return false;
      if (typeof v === "number") hasFeature = true;
    }
    return hasFeature;
  }
  function importData(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setStatus("Import rejected: JSON file exceeds 5 MB.", "error"); return; }
    file.text().then(function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || parsed.schemaVersion !== "touch-lab-classifier-data-1" || !Array.isArray(parsed.examples)) {
        throw new Error("Unsupported dataset file. Import a Touch Lab classifier JSON export.");
      }
      if (parsed.examples.length > MAX_EXAMPLES || !parsed.examples.every(validExample)) {
        throw new Error("Dataset contains invalid examples or exceeds the safety limit.");
      }
      examples = parsed.examples.map(function (ex) {
        var features = {};
        FEATURE_KEYS.forEach(function (key) {
          features[key] = numeric(ex.features[key]);
        });
        return {
          id: String(ex.id || "imported-" + Math.random().toString(36).slice(2)),
          batchId: ex.batchId,
          label: ex.label,
          capturedAt: typeof ex.capturedAt === "string" ? ex.capturedAt : null,
          sampleCount: Number.isInteger(ex.sampleCount) && ex.sampleCount >= 0 ? ex.sampleCount : 0,
          features: features
        };
      });
      trainedExamples = null;
      predictionLog = [];
      updateCounts();
      setResults("Imported " + examples.length + " labeled contacts from JSON. Train & evaluate to build a local model.", "warn");
      setStatus("Import complete. Data stayed in this browser; nothing was uploaded.", "pass");
      renderPredictions();
    }).catch(function (error) {
      setStatus("Import failed: " + String(error && error.message || error), "error");
    });
  }
  function clearData() {
    if (activeBatch) { setStatus("Finish the active batch before clearing the dataset.", "error"); return; }
    examples = [];
    trainedExamples = null;
    predictionLog = [];
    setResults("No model trained. Collect labeled examples first.", "");
    $("modelPredictions").textContent = "No predictions yet.";
    setStatus("Training dataset cleared from this page's memory.", "pass");
    updateCounts();
  }

  $("modelStartThumb").addEventListener("click", function () { startBatch(LABEL_THUMB); });
  $("modelStartOther").addEventListener("click", function () { startBatch(LABEL_OTHER); });
  $("modelStartPredict").addEventListener("click", startPredictionBatch);
  $("modelFinishBatch").addEventListener("click", finishBatch);
  $("modelTrain").addEventListener("click", train);
  $("modelClear").addEventListener("click", clearData);
  $("modelExport").addEventListener("click", exportData);
  $("modelImport").addEventListener("change", function (e) {
    importData(e.target.files && e.target.files[0]);
    e.target.value = "";
  });

  surface.addEventListener("pointerdown", onPointerDown, { passive: true });
  surface.addEventListener("pointermove", onPointerMove, { passive: true });
  surface.addEventListener("pointerup", function (e) { onPointerEnd(e, false); }, { passive: true });
  surface.addEventListener("pointercancel", function (e) { onPointerEnd(e, true); }, { passive: true });
  if (window.TouchEvent) {
    ["touchstart", "touchmove", "touchend"].forEach(function (type) {
      surface.addEventListener(type, onTouch, { passive: true });
    });
  }
  updateCounts();
  updateButtons();
})(); 
