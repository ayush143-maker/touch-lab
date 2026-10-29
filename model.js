(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var surface = $("touchSurface");
  if (!surface) return;

  var STORAGE_KEY = "touchlab-finger-pattern-v1";
  var LABEL_THUMB = "thumb";
  var LABEL_OTHER = "other";
  var MAX_EXAMPLES = 12000;
  var FEATURE_KEYS = [
    "duration", "path", "displacement", "straightness", "meanSpeed",
    "maxSpeed", "speedSpread", "pressureMean", "pressureSpread",
    "pressureRange", "widthMean", "heightMean", "widthHeightRatio",
    "widthSpread", "heightSpread", "sampleRate", "tiltMean", "tiltSpread",
    "turnMean", "reversals", "pauseRatio", "tangentialMean",
    "radiusXMean", "radiusYMean", "radiusRatio", "forceMean", "forceSpread"
  ];
  var examples = [];
  var activeBatch = null;
  var activeContact = null;
  var currentPointer = null;
  var batchNumber = 0;
  var totalTouches = 0;
  var modelReady = false;
  var validation = null;
  var lastResult = "Ready";

  function num(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
  function avg(a) {
    a = a.filter(function (v) { return num(v) !== null; });
    return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null;
  }
  function std(a) {
    a = a.filter(function (v) { return num(v) !== null; });
    if (a.length < 2) return null;
    var m = avg(a);
    return Math.sqrt(avg(a.map(function (v) { return (v - m) * (v - m); })));
  }
  function span(a) {
    a = a.filter(function (v) { return num(v) !== null; });
    return a.length ? Math.max.apply(null, a) - Math.min.apply(null, a) : null;
  }
  function meanAbs(a) {
    return avg(a.filter(function (v) { return num(v) !== null; }).map(Math.abs));
  }
  function round(v, places) {
    if (num(v) === null) return null;
    var f = Math.pow(10, places || 3);
    return Math.round(v * f) / f;
  }
  function setResult(title, detail, active) {
    $("fingerResult").textContent = title;
    $("fingerDetail").textContent = detail;
    $("liveDot").classList.toggle("active", !!active);
    lastResult = title;
  }
  function setBatchStatus(text, active) {
    $("batchStatus").textContent = text;
    $("batchIndicator").classList.toggle("active", !!active);
  }
  function setEvaluation(text) {
    $("evaluationText").textContent = text;
  }
  function getRect() { return surface.getBoundingClientRect(); }
  function sampleFromEvent(e) {
    var r = getRect();
    return {
      t: num(e.timeStamp),
      x: r.width > 0 ? (e.clientX - r.left) / r.width : null,
      y: r.height > 0 ? (e.clientY - r.top) / r.height : null,
      pressure: num(e.pressure),
      width: num(e.width) !== null && r.width > 0 ? e.width / r.width : null,
      height: num(e.height) !== null && r.height > 0 ? e.height / r.height : null,
      tiltX: num(e.tiltX),
      tiltY: num(e.tiltY),
      tangential: num(e.tangentialPressure),
      radiusX: null, radiusY: null, force: null
    };
  }
  function addSample(contact, e) {
    var s = sampleFromEvent(e);
    var last = contact.samples[contact.samples.length - 1];
    if (!last || last.t !== s.t || last.x !== s.x || last.y !== s.y) contact.samples.push(s);
    var p = getRect();
    $("surfacePosition").textContent =
      round(e.clientX - p.left, 1) + " / " + round(e.clientY - p.top, 1);
    $("surfacePrompt").style.opacity = "0";
    var feedback = $("touchFeedback");
    feedback.style.left = (e.clientX - p.left) + "px";
    feedback.style.top = (e.clientY - p.top) + "px";
    feedback.classList.remove("visible");
    void feedback.offsetWidth;
    feedback.classList.add("visible");
  }
  function enrichFromTouch(e) {
    if (!activeContact || !e.changedTouches) return;
    var r = getRect();
    if (!r.width || !r.height) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var x = (t.clientX-r.left)/r.width, y = (t.clientY-r.top)/r.height;
      var last = activeContact.samples[activeContact.samples.length-1];
      if (!last || last.x === null || last.y === null) continue;
      if (Math.hypot(last.x-x,last.y-y) < 0.08) {
        last.radiusX = num(t.radiusX) !== null ? t.radiusX/r.width : null;
        last.radiusY = num(t.radiusY) !== null ? t.radiusY/r.height : null;
        last.force = num(t.force);
      }
    }
  }
  function makeFeatures(c) {
    var ss = c.samples, r = getRect(), diagonal = Math.max(1, Math.hypot(r.width || 1, r.height || 1));
    var totalPath = 0, speeds = [], turns = [], pauses = 0, moves = [], directions = [], reversals = 0;
    for (var i = 1; i < ss.length; i++) {
      var a = ss[i-1], b = ss[i];
      if (a.x === null || a.y === null || b.x === null || b.y === null) continue;
      var dx = (b.x-a.x)*(r.width||1), dy = (b.y-a.y)*(r.height||1), d = Math.hypot(dx,dy);
      var dt = a.t !== null && b.t !== null ? b.t-a.t : null;
      totalPath += d;
      moves.push(d/diagonal);
      if (dt !== null && dt > 0) {
        speeds.push((d/diagonal)/(dt/1000));
        if (dt > 120 && d/diagonal < 0.0012) pauses++;
      }
      if (d > 0.35) directions.push(Math.atan2(dy,dx));
    }
    for (var j=1;j<directions.length;j++) {
      var delta = Math.abs(((directions[j]-directions[j-1]+3*Math.PI)%(2*Math.PI))-Math.PI);
      turns.push(delta*180/Math.PI);
      if (delta > Math.PI*0.72) reversals++;
    }
    var valid = ss.filter(function (s) { return s.x !== null && s.y !== null; });
    var displacement = 0;
    if (valid.length > 1) {
      var first=valid[0], last=valid[valid.length-1];
      displacement = Math.hypot((last.x-first.x)*(r.width||1),(last.y-first.y)*(r.height||1));
    }
    var widths=ss.map(function(s){return s.width;}), heights=ss.map(function(s){return s.height;});
    var ratios=ss.map(function(s){return num(s.width)!==null&&num(s.height)!==null&&s.height>0?s.width/s.height:null;});
    var pressure=ss.map(function(s){return s.pressure;}), tilt=ss.map(function(s){return num(s.tiltX)!==null&&num(s.tiltY)!==null?Math.hypot(s.tiltX,s.tiltY):null;});
    var tang=ss.map(function(s){return s.tangential;}), rx=ss.map(function(s){return s.radiusX;}), ry=ss.map(function(s){return s.radiusY;}), force=ss.map(function(s){return s.force;});
    var radiusRatio=ss.map(function(s){return num(s.radiusX)!==null&&num(s.radiusY)!==null&&s.radiusY>0?s.radiusX/s.radiusY:null;});
    var duration=c.endTime!==null&&c.startTime!==null?Math.max(0,c.endTime-c.startTime):null;
    var path=totalPath/diagonal, disp=displacement/diagonal;
    var out = {
      duration: duration, path: path, displacement: disp, straightness: path>0?disp/path:(path===0?0:null),
      meanSpeed: avg(speeds), maxSpeed: speeds.length?Math.max.apply(null,speeds):null, speedSpread:std(speeds),
      pressureMean:avg(pressure), pressureSpread:std(pressure), pressureRange:span(pressure),
      widthMean:avg(widths), heightMean:avg(heights), widthHeightRatio:avg(ratios),
      widthSpread:std(widths), heightSpread:std(heights),
      sampleRate:duration>0?Math.max(0,ss.length-1)/(duration/1000):null,
      tiltMean:meanAbs(tilt), tiltSpread:std(tilt), turnMean:avg(turns), reversals:reversals,
      pauseRatio:moves.length?pauses/moves.length:null, tangentialMean:avg(tang),
      radiusXMean:avg(rx), radiusYMean:avg(ry), radiusRatio:avg(radiusRatio), forceMean:avg(force), forceSpread:std(force)
    };
    FEATURE_KEYS.forEach(function(k){ if(num(out[k])===null) out[k]=null; });
    return out;
  }
  function counts() {
    var c={thumb:0,other:0,thumbBatches:new Set(),otherBatches:new Set()};
    examples.forEach(function(e){
      if(e.label===LABEL_THUMB){c.thumb++;c.thumbBatches.add(e.batchId);}
      if(e.label===LABEL_OTHER){c.other++;c.otherBatches.add(e.batchId);}
    });
    return c;
  }
  function renderCounts() {
    var c=counts(), minContacts=Math.min(c.thumb,c.other), step=Math.min(100, minContacts/30*100);
    $("exampleCount").textContent=String(examples.length);
    $("touchCount").textContent=String(totalTouches).padStart(2,"0")+" TOUCHES";
    $("modelState").textContent=modelReady?"CALIBRATED":"NOT CALIBRATED";
    $("progressFill").style.width=step+"%";
    if(modelReady) $("progressText").textContent="Ready to estimate on this device";
    else if(c.thumb===0) $("progressText").textContent="Start with a thumb batch";
    else if(c.other===0) $("progressText").textContent="Now collect index / other";
    else $("progressText").textContent="Collect more examples from separate batches";
  }
  function store() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({v:1, examples:examples.slice(-MAX_EXAMPLES)}));
    } catch (_) {
      setBatchStatus("Private storage is full. Export or reset calibration.", false);
    }
  }
  function restore() {
    try {
      var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      if(!saved||saved.v!==1||!Array.isArray(saved.examples)) return;
      examples=saved.examples.filter(validExample).slice(-MAX_EXAMPLES);
    } catch (_) { examples=[]; }
  }
  function validExample(e) {
    if(!e||!e.features||(e.label!==LABEL_THUMB&&e.label!==LABEL_OTHER)||typeof e.batchId!=="string") return false;
    return FEATURE_KEYS.some(function(k){return num(e.features[k])!==null;});
  }
  function featureStats(rows) {
    var result={};
    FEATURE_KEYS.forEach(function(k){
      var vals=rows.map(function(e){return e.features[k];}).filter(function(v){return num(v)!==null;});
      var s=std(vals);
      result[k]={mean:avg(vals),std:s&&s>1e-8?s:1};
    });
    return result;
  }
  function predict(rows, f) {
    if(!rows||rows.length<2) return null;
    var stats=featureStats(rows);
    var nearest=rows.map(function(e){
      var sum=0,n=0;
      FEATURE_KEYS.forEach(function(k){
        var a=num(f[k]),b=num(e.features[k]);
        if(a===null||b===null) return;
        var z=(a-stats[k].mean)/stats[k].std-(b-stats[k].mean)/stats[k].std;
        sum+=z*z;n++;
      });
      return {label:e.label,distance:n>=2?sum/n:Infinity};
    }).filter(function(x){return Number.isFinite(x.distance);});
    nearest.sort(function(a,b){return a.distance-b.distance;});
    nearest=nearest.slice(0,Math.min(5,nearest.length));
    if(!nearest.length) return null;
    var votes={thumb:0,other:0};
    nearest.forEach(function(x){votes[x.label]+=1/(.15+x.distance);});
    var label=votes.thumb>=votes.other?LABEL_THUMB:LABEL_OTHER;
    var agreement=Math.round(100*nearest.filter(function(x){return x.label===label;}).length/nearest.length);
    return {label:label,agreement:agreement};
  }
  function evaluate(rows) {
    var groups=Array.from(new Set(rows.map(function(e){return e.batchId;}))), tested=[];
    groups.forEach(function(g){
      var test=rows.filter(function(e){return e.batchId===g;}), train=rows.filter(function(e){return e.batchId!==g;});
      var labels=new Set(train.map(function(e){return e.label;}));
      if(!labels.has(LABEL_THUMB)||!labels.has(LABEL_OTHER)) return;
      test.forEach(function(e){var p=predict(train,e.features);if(p)tested.push({actual:e.label,predicted:p.label});});
    });
    var correct=tested.filter(function(e){return e.actual===e.predicted;}).length;
    var th=tested.filter(function(e){return e.actual===LABEL_THUMB;}), oth=tested.filter(function(e){return e.actual===LABEL_OTHER;});
    var tr=th.length?th.filter(function(e){return e.predicted===LABEL_THUMB;}).length/th.length:null;
    var or=oth.length?oth.filter(function(e){return e.predicted===LABEL_OTHER;}).length/oth.length:null;
    return {n:tested.length,accuracy:tested.length?correct/tested.length:null,balanced:tr!==null&&or!==null?(tr+or)/2:null,thumbRecall:tr,otherRecall:or,groups:groups.length};
  }
  function train() {
    var c=counts(), enough=c.thumb>=5&&c.other>=5&&c.thumbBatches.size>=2&&c.otherBatches.size>=2;
    modelReady=enough;
    validation=enough?evaluate(examples):null;
    renderCounts();
    if(modelReady) {
      var v=validation;
      var message=v&&v.accuracy!==null ?
        "Held-out batch accuracy "+(v.accuracy*100).toFixed(1)+"% · balanced "+(v.balanced*100).toFixed(1)+"%. "+
          (c.thumbBatches.size<5||c.otherBatches.size<5?"Preliminary: collect at least 5 batches per label for a more useful test.":"Measured on your collected batches; not a general-device guarantee.") :
        "Model ready for this device; collect more separate batches to calculate a score.";
      setEvaluation(message);
      if(!$("evaluationText").dataset) return;
      $("evaluationText").dataset.state="ready";
    } else {
      setEvaluation("Need at least 5 contacts per label across 2 separate batches per label before estimates turn on.");
    }
  }
  function beginBatch(label) {
    if(activeBatch) {
      setBatchStatus("Finish the current batch first.",false);
      return;
    }
    if(!window.PointerEvent) {
      setBatchStatus("This browser does not expose the needed touch events.",false);
      return;
    }
    batchNumber++;
    activeBatch={id:"batch-"+Date.now().toString(36)+"-"+batchNumber,label:label,mode:"label",contacts:[],startedAt:new Date().toISOString()};
    $("thumbButton").disabled=true;$("otherButton").disabled=true;
    $("finishBatchButton").disabled=false;
    $("finishBatchButton").classList.add("ready");
    setBatchStatus("Collecting "+(label===LABEL_THUMB?"thumb":"index / other")+" — make several separate touches.",true);
    setResult("Collecting "+(label===LABEL_THUMB?"thumb":"index / other"),"Only touches in the test area are added to this labelled batch.",true);
    $("surfaceHint").textContent="LABEL COLLECTION ACTIVE";
  }
  function finishBatch() {
    if(!activeBatch) return;
    if(!activeBatch.contacts.length) {
      setBatchStatus("No completed touch yet. Touch the large area first.",true);
      return;
    }
    var batch=activeBatch;
    batch.contacts.forEach(function(f,i){
      examples.push({id:batch.id+"-"+(i+1),batchId:batch.id,label:batch.label,features:f});
    });
    examples=examples.slice(-MAX_EXAMPLES);
    activeBatch=null;activeContact=null;currentPointer=null;
    $("thumbButton").disabled=false;$("otherButton").disabled=false;
    $("finishBatchButton").disabled=true;$("finishBatchButton").classList.remove("ready");
    $("surfaceHint").textContent="PRESS · MOVE · RELEASE";
    store();train();renderCounts();
    setBatchStatus("Saved "+batch.contacts.length+" "+(batch.label===LABEL_THUMB?"thumb":"index / other")+" example(s).",false);
    if(modelReady) setResult("Ready to estimate","Touch again to see which learned pattern your contact resembles.",false);
    else setResult("Touch recorded","Keep collecting separate batches for both labels to enable estimates.",true);
  }
  function handleStart(e) {
    if(e.pointerType!=="touch") {
      setResult("Use a touchscreen","This test needs finger input from a touchscreen.",false);
      return;
    }
    if(activeContact || e.isPrimary===false) return;
    currentPointer=e.pointerId;
    activeContact={startTime:num(e.timeStamp),endTime:null,samples:[]};
    addSample(activeContact,e);
    $("surfacePrompt").style.opacity="0";
  }
  function handleMove(e) {
    if(!activeContact||e.pointerId!==currentPointer||e.pointerType!=="touch") return;
    addSample(activeContact,e);
  }
  function handleEnd(e, cancelled) {
    if(!activeContact||e.pointerId!==currentPointer||e.pointerType!=="touch") return;
    addSample(activeContact,e);
    activeContact.endTime=num(e.timeStamp);
    var c=activeContact;activeContact=null;currentPointer=null;
    if(cancelled||c.samples.length<2) return;
    var features=makeFeatures(c);
    totalTouches++;
    if(activeBatch&&activeBatch.mode==="label") {
      activeBatch.contacts.push(features);
      setBatchStatus((activeBatch.label===LABEL_THUMB?"Thumb":"Index / other")+" batch: "+activeBatch.contacts.length+" contact(s). Finish when done.",true);
      setResult("Touch captured",""+activeBatch.contacts.length+" example(s) in the current labelled batch.",true);
    } else if(modelReady) {
      var p=predict(examples,features);
      if(p) {
        var name=p.label===LABEL_THUMB?"Thumb-like":"Index / other-like";
        setResult(name,"Neighbour agreement "+p.agreement+"% · estimate only, not a certainty.",true);
      } else setResult("Touch detected","Not enough comparable signal. Try a longer tap or a short drag.",true);
    } else {
      setResult("Touch detected","Collect labelled thumb and index/other examples below to enable a personal estimate.",true);
    }
    renderCounts();
  }
  function handleTouch(e) { if(activeContact) enrichFromTouch(e); }
  function reset() {
    if(activeBatch) {
      setBatchStatus("Finish or clear the current batch before resetting.",true);
      return;
    }
    if(!window.confirm("Reset all locally saved finger examples on this device?")) return;
    examples=[];modelReady=false;validation=null;totalTouches=0;
    try {localStorage.removeItem(STORAGE_KEY);} catch(_){}
    renderCounts();setEvaluation("Calibration reset. Record labelled examples to enable estimates.");
    setBatchStatus("Calibration cleared from this device.",false);
    setResult("Ready","Touch the test area to begin.",false);
  }
  function exportData() {
    var payload={schemaVersion:"touchlab-finger-pattern-v1",note:"User-labelled derived touch features. Estimated classes are not identity proof.",featureKeys:FEATURE_KEYS,examples:examples};
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    var url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="touch-lab-calibration.json";document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  $("thumbButton").addEventListener("click",function(){beginBatch(LABEL_THUMB);});
  $("otherButton").addEventListener("click",function(){beginBatch(LABEL_OTHER);});
  $("finishBatchButton").addEventListener("click",finishBatch);
  $("clearButton").addEventListener("click",reset);
  $("exportButton").addEventListener("click",exportData);
  surface.addEventListener("pointerdown",handleStart,{passive:true});
  surface.addEventListener("pointermove",handleMove,{passive:true});
  surface.addEventListener("pointerup",function(e){handleEnd(e,false);},{passive:true});
  surface.addEventListener("pointercancel",function(e){handleEnd(e,true);},{passive:true});
  if(window.TouchEvent) ["touchstart","touchmove","touchend"].forEach(function(type){surface.addEventListener(type,handleTouch,{passive:true});});

  restore();
  train();
  renderCounts();
  if(modelReady) setResult("Ready to estimate","Calibration restored from this device. Touch the area for a new estimate.",false);
  else if(examples.length) setResult("Calibration in progress","Your saved examples are here. Collect more balanced, separate batches.",false);
  setBatchStatus("No collection active",false);
})(); 
