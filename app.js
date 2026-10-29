(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const MAX_EVENTS = 100000;
  const POINTER_KEYS = ["pointerId","pointerType","isPrimary","button","buttons","clientX","clientY","pageX","pageY","screenX","screenY","offsetX","offsetY","pressure","tangentialPressure","width","height","tiltX","tiltY","twist","movementX","movementY","altitudeAngle","azimuthAngle"];
  const EVENT_KEYS = ["type","timeStamp","detail","cancelable","bubbles","composed","eventPhase","defaultPrevented","isTrusted","targetTagName","targetId","targetClassName","currentTargetTagName","viewAvailable","altKey","ctrlKey","metaKey","shiftKey"];
  const TOUCH_KEYS = ["identifier","clientX","clientY","pageX","pageY","screenX","screenY","radiusX","radiusY","rotationAngle","force"];
  const CAPABILITY_PROPERTIES = [
    ["PointerEvent","PointerEvent API","window.PointerEvent"],["pointerId","pointer.pointerId","pointer"],["pointerType","pointer.pointerType","pointer"],
    ["isPrimary","pointer.isPrimary","pointer"],["button","pointer.button","pointer"],["buttons","pointer.buttons","pointer"],["clientX","pointer.clientX","pointer"],
    ["clientY","pointer.clientY","pointer"],["pageX","pointer.pageX","pointer"],["pageY","pointer.pageY","pointer"],["screenX","pointer.screenX","pointer"],
    ["screenY","pointer.screenY","pointer"],["offsetX","pointer.offsetX","pointer"],["offsetY","pointer.offsetY","pointer"],["pressure","pointer.pressure","pointer"],
    ["tangentialPressure","pointer.tangentialPressure","pointer"],["width","pointer.width","pointer"],["height","pointer.height","pointer"],["tiltX","pointer.tiltX","pointer"],
    ["tiltY","pointer.tiltY","pointer"],["twist","pointer.twist","pointer"],["movementX","pointer.movementX","pointer"],["movementY","pointer.movementY","pointer"],
    ["altitudeAngle","pointer.altitudeAngle","pointer"],["azimuthAngle","pointer.azimuthAngle","pointer"],["timeStamp","event.timeStamp","event"],["detail","event.detail","event"],
    ["cancelable","event.cancelable","event"],["bubbles","event.bubbles","event"],["composed","event.composed","event"],["getCoalescedEvents","getCoalescedEvents()","method"],
    ["getPredictedEvents","getPredictedEvents()","method"],["pointerrawupdate","pointerrawupdate event","eventType"],["TouchEvent","TouchEvent API","window.TouchEvent"],
    ["touches","touches[]","touchEvent"],["targetTouches","targetTouches[]","touchEvent"],["changedTouches","changedTouches[]","touchEvent"],
    ["identifier","Touch.identifier","touch"],["radiusX","Touch.radiusX","touch"],["radiusY","Touch.radiusY","touch"],["rotationAngle","Touch.rotationAngle","touch"],
    ["force","Touch.force","touch"],["navigator.maxTouchPoints","navigator.maxTouchPoints","navigator"]
  ];
  const state = {
    running:false,startTime:null,endTime:null,events:[],samples:[],contacts:[],active:new Map(),activePositions:new Map(),
    trials:[],activeTrial:null,selectedEventIndex:null,nextContactId:1,maxConcurrentPointers:0,tapIntervals:[],
    completedTapUps:[],multiSamples:[],overLimit:false,lastElapsedRender:0,pendingRender:false,sessionId:makeSessionId(),
    observationCounts:Object.create(null),trailStartSampleIndex:0
  };
  CAPABILITY_PROPERTIES.forEach(function (item) { state.observationCounts[item[0]]=0; });
  function makeSessionId(){return "tl-"+new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)+"-"+Math.random().toString(36).slice(2,7);}
  function isoNow(){return new Date().toISOString();}
  function isNum(v){return typeof v==="number"&&Number.isFinite(v);}
  function nOrNull(o,k){try{return o&&k in o&&isNum(o[k])?o[k]:null;}catch(_){return null;}}
  function vOrNull(o,k){try{if(!o||!(k in o))return null;const v=o[k];if(v===undefined||typeof v==="function")return null;if(v===null||typeof v==="string"||typeof v==="boolean"||isNum(v))return v;return null;}catch(_){return null;}}
  function cleanExtraValue(v){if(v===undefined)return null;if(v===null||typeof v==="string"||typeof v==="boolean"||isNum(v))return v;if(Array.isArray(v))return "[array:"+v.length+"]";return "["+Object.prototype.toString.call(v).slice(8,-1)+"]";}
  function eventTargetInfo(t){if(!t||!t.tagName)return{targetTagName:null,targetId:null,targetClassName:null};return{targetTagName:String(t.tagName).toLowerCase(),targetId:t.id||null,targetClassName:typeof t.className==="string"?t.className:null};}
  function localCoords(x,y){const r=$("touchSurface").getBoundingClientRect();return{surfaceX:isNum(x)?Math.round((x-r.left)*100)/100:null,surfaceY:isNum(y)?Math.round((y-r.top)*100)/100:null};}
  function snapshotPointer(e){
    const s={};POINTER_KEYS.forEach(function(k){s[k]=vOrNull(e,k);});
    EVENT_KEYS.forEach(function(k){if(["targetTagName","targetId","targetClassName","currentTargetTagName","viewAvailable"].indexOf(k)>=0)return;s[k]=vOrNull(e,k);});
    const t=eventTargetInfo(e.target);s.targetTagName=t.targetTagName;s.targetId=t.targetId;s.targetClassName=t.targetClassName;
    s.currentTargetTagName=e.currentTarget&&e.currentTarget.tagName?String(e.currentTarget.tagName).toLowerCase():null;s.viewAvailable=!!e.view;
    const local=localCoords(s.clientX,s.clientY);s.surfaceX=local.surfaceX;s.surfaceY=local.surfaceY;s.modifierStates={};
    if(typeof e.getModifierState==="function"){["Alt","Control","Meta","Shift","CapsLock","NumLock","ScrollLock","Fn","Symbol"].forEach(function(k){try{s.modifierStates[k]=!!e.getModifierState(k);}catch(_){s.modifierStates[k]=null;}});}
    s.enumerableExtras={};try{Object.keys(e).forEach(function(k){if(k in s||["target","currentTarget","view","path"].indexOf(k)>=0)return;s.enumerableExtras[k]=cleanExtraValue(e[k]);});}catch(_){}
    return s;
  }
  function snapshotTouch(t){const o={};TOUCH_KEYS.forEach(function(k){o[k]=vOrNull(t,k);});const i=eventTargetInfo(t&&t.target);o.targetTagName=i.targetTagName;o.targetId=i.targetId;o.targetClassName=i.targetClassName;return o;}
  function touchList(list){if(!list||typeof list.length!=="number")return null;const a=[];for(let i=0;i<list.length;i+=1)a.push(snapshotTouch(list[i]));return a;}
  function eventBase(e,source,index){
    const t=eventTargetInfo(e.target);
    return{index:index,source:source,type:e.type||null,capturedAt:isoNow(),properties:{type:vOrNull(e,"type"),timeStamp:vOrNull(e,"timeStamp"),detail:vOrNull(e,"detail"),cancelable:vOrNull(e,"cancelable"),bubbles:vOrNull(e,"bubbles"),composed:vOrNull(e,"composed"),eventPhase:vOrNull(e,"eventPhase"),defaultPrevented:vOrNull(e,"defaultPrevented"),isTrusted:vOrNull(e,"isTrusted"),targetTagName:t.targetTagName,targetId:t.targetId,targetClassName:t.targetClassName,altKey:vOrNull(e,"altKey"),ctrlKey:vOrNull(e,"ctrlKey"),metaKey:vOrNull(e,"metaKey"),shiftKey:vOrNull(e,"shiftKey")},coalescedSamples:null,predictedSamples:null,touchData:null,activePointerCount:state.active.size,pointerDistancesPx:null,notes:source==="touch-secondary"?"Secondary Touch Event record; excluded from derived pointer metrics to avoid double-counting.":null};
  }
  function distance(a,b){if(!a||!b||!isNum(a.clientX)||!isNum(a.clientY)||!isNum(b.clientX)||!isNum(b.clientY))return null;return Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);}
  function pairwiseDistances(){const points=Array.from(state.activePositions.values()),out=[];for(let i=0;i<points.length;i+=1)for(let j=i+1;j<points.length;j+=1)out.push({pointerIds:[points[i].pointerId,points[j].pointerId],distancePx:distance(points[i],points[j])});return out;}
  function pushSample(contact,snapshot,eventIndex,source){
    if(!snapshot)return;const sample=Object.assign({},snapshot,{sampleIndex:state.samples.length,contactId:contact?contact.contactId:null,sourceEventIndex:eventIndex,sampleSource:source||"pointer",monotonicTimeMs:isNum(snapshot.timeStamp)?snapshot.timeStamp:null});
    state.samples.push(sample);if(contact)contact.samples.push(sample);
  }
  function updateSurfaceMarker(e){
    const id=String(e.pointerId),local=localCoords(nOrNull(e,"clientX"),nOrNull(e,"clientY")),layer=$("pointerLayer");
    let marker=layer.querySelector('[data-pointer-id="'+id.replace(/"/g,"")+'"]');
    if(["pointerup","pointercancel","pointerleave","lostpointercapture"].indexOf(e.type)>=0){if(marker)marker.remove();return;}
    if(!marker){marker=document.createElement("span");marker.className="pointer-marker";marker.dataset.pointerId=id;layer.appendChild(marker);}
    marker.dataset.type=e.pointerType||"unknown";marker.style.left=(local.surfaceX===null?0:local.surfaceX)+"px";marker.style.top=(local.surfaceY===null?0:local.surfaceY)+"px";
    $("liveCoordinates").textContent=(local.surfaceX===null?"—":local.surfaceX.toFixed(1))+" / "+(local.surfaceY===null?"—":local.surfaceY.toFixed(1));$("surfacePrompt").style.opacity="0";
  }
  function logPointerEvent(e){
    updateSurfaceMarker(e);if(!state.running||state.overLimit)return;
    if(state.events.length>=MAX_EVENTS){state.overLimit=true;stopSession();$("surfaceStatus").textContent="Safety limit reached — export captured data";return;}
    const type=e.type,id=String(vOrNull(e,"pointerId")),snap=snapshotPointer(e);let contact=state.active.get(id)||null;
    if(type==="pointerdown"){contact={contactId:state.nextContactId++,pointerId:vOrNull(e,"pointerId"),pointerType:vOrNull(e,"pointerType"),isPrimary:vOrNull(e,"isPrimary"),startedAt:isoNow(),startTimeMs:isNum(snap.timeStamp)?snap.timeStamp:null,endedAt:null,endTimeMs:null,endType:null,samples:[],pathLengthPx:0,maxSpeedPxS:null,moved:false};state.contacts.push(contact);state.active.set(id,contact);}
    const tracked=state.active.get(id)||contact;
    if(isNum(snap.clientX)&&isNum(snap.clientY))state.activePositions.set(id,{pointerId:vOrNull(e,"pointerId"),clientX:snap.clientX,clientY:snap.clientY});
    if(type==="pointerdown")state.maxConcurrentPointers=Math.max(state.maxConcurrentPointers,state.active.size);
    const index=state.events.length,raw=eventBase(e,"pointer",index);raw.properties=snap;raw.activePointerCount=state.active.size;raw.pointerDistancesPx=pairwiseDistances();
    let coalesced=[],predicted=[];
    if(type==="pointermove"&&typeof e.getCoalescedEvents==="function"){try{coalesced=Array.from(e.getCoalescedEvents()).map(snapshotPointer);}catch(_){coalesced=[];}}
    if(typeof e.getPredictedEvents==="function"){try{predicted=Array.from(e.getPredictedEvents()).map(snapshotPointer);}catch(_){predicted=[];}}
    raw.coalescedSamples=coalesced.length?coalesced:null;raw.predictedSamples=predicted.length?predicted:null;
    if(coalesced.length)raw.properties.coalescedEventCount=coalesced.length;if(predicted.length)raw.properties.predictedEventCount=predicted.length;
    state.events.push(raw);updateObservedCounts(raw);
    const eligible=["pointerdown","pointermove","pointerup","pointercancel"].indexOf(type)>=0;
    if(tracked&&eligible){const candidates=type==="pointermove"&&coalesced.length?coalesced:[snap];candidates.forEach(function(s){pushSample(tracked,s,index,coalesced.length&&s!==snap?"coalesced":"pointer");});updateContactIncremental(tracked);}
    if(state.active.size>=2)state.multiSamples.push({timeStamp:snap.timeStamp,capturedAt:raw.capturedAt,activePointerCount:state.active.size,pointerDistancesPx:raw.pointerDistancesPx});
    if(type==="pointerup"||type==="pointercancel"){if(tracked){tracked.endedAt=isoNow();tracked.endTimeMs=isNum(snap.timeStamp)?snap.timeStamp:null;tracked.endType=type;finalizeContact(tracked);}state.active.delete(id);state.activePositions.delete(id);const marker=$("pointerLayer").querySelector('[data-pointer-id="'+id.replace(/"/g,"")+'"]');if(marker)marker.remove();}
    if(state.events.length===1)$("surfacePrompt").style.opacity="0";$("surfaceStatus").textContent=state.running?"Capturing browser events":"Capture is paused";scheduleRender();
  }
  function updateContactIncremental(c){const s=c.samples;if(s.length<2)return;const a=s[s.length-2],b=s[s.length-1],d=distance(a,b),dt=isNum(a.timeStamp)&&isNum(b.timeStamp)?b.timeStamp-a.timeStamp:null;if(d!==null&&d>.75)c.moved=true;if(d!==null&&dt!==null&&dt>0)c.pathLengthPx+=d;}
  function finalizeContact(c){
    const valid=c.samples.filter(function(s){return isNum(s.clientX)&&isNum(s.clientY);});
    const path=c.samples.reduce(function(sum,s,i){if(!i)return sum;const d=distance(c.samples[i-1],s);return sum+(d===null?0:d);},0);
    c.pathLengthPx=path;c.displacementPx=valid.length>1?distance(valid[0],valid[valid.length-1]):null;
    c.durationMs=isNum(c.startTimeMs)&&isNum(c.endTimeMs)?Math.max(0,c.endTimeMs-c.startTimeMs):null;c.isTap=c.durationMs!==null&&c.durationMs<=500&&path<=32;
    if(c.isTap&&c.endTimeMs!==null){const prior=state.completedTapUps[state.completedTapUps.length-1];if(prior!==undefined)state.tapIntervals.push(c.endTimeMs-prior);state.completedTapUps.push(c.endTimeMs);}
    if(state.activeTrial&&!state.activeTrial.contactIds.includes(c.contactId))state.activeTrial.contactIds.push(c.contactId);
  }
  function logTouchEvent(e){
    if(!state.running||state.overLimit)return;
    if(state.events.length>=MAX_EVENTS){state.overLimit=true;stopSession();$("surfaceStatus").textContent="Safety limit reached — export captured data";return;}
    const index=state.events.length,raw=eventBase(e,"touch-secondary",index);
    raw.properties.touches=e.touches?e.touches.length:null;raw.properties.targetTouches=e.targetTouches?e.targetTouches.length:null;raw.properties.changedTouches=e.changedTouches?e.changedTouches.length:null;
    raw.touchData={touches:touchList(e.touches),targetTouches:touchList(e.targetTouches),changedTouches:touchList(e.changedTouches)};
    raw.notes=window.PointerEvent?"Secondary Touch Event record; not used for derived metrics because Pointer Events are canonical.":"Touch fallback record.";
    state.events.push(raw);updateObservedCounts(raw);scheduleRender();
  }
  function updateObservedCounts(event){
    const props=event.properties||{};
    CAPABILITY_PROPERTIES.forEach(function(item){
      const key=item[0];let count=0;
      if(key==="PointerEvent"&&event.source==="pointer")count=1;
      else if(key==="TouchEvent"&&event.source==="touch-secondary")count=1;
      else if(key==="getCoalescedEvents"&&event.coalescedSamples)count=event.coalescedSamples.length;
      else if(key==="getPredictedEvents"&&event.predictedSamples)count=event.predictedSamples.length;
      else if(key==="pointerrawupdate"&&event.type==="pointerrawupdate")count=1;
      else if(["touches","targetTouches","changedTouches"].indexOf(key)>=0&&event.touchData&&event.touchData[key])count=event.touchData[key].length;
      else {
        if(Object.prototype.hasOwnProperty.call(props,key)&&props[key]!==null&&props[key]!==undefined)count+=1;
        (event.coalescedSamples||[]).forEach(function(s){if(Object.prototype.hasOwnProperty.call(s,key)&&s[key]!==null)count+=1;});
        if(event.touchData)["touches","targetTouches","changedTouches"].forEach(function(n){(event.touchData[n]||[]).forEach(function(t){if(Object.prototype.hasOwnProperty.call(t,key)&&t[key]!==null)count+=1;});});
      }
      state.observationCounts[key]=(state.observationCounts[key]||0)+count;
    });
  }
  function mean(values){const a=values.filter(isNum);return a.length?a.reduce(function(s,x){return s+x;},0)/a.length:null;}
  function max(values){const a=values.filter(isNum);return a.length?Math.max.apply(null,a):null;}
  function min(values){const a=values.filter(isNum);return a.length?Math.min.apply(null,a):null;}
  function sd(values){const a=values.filter(isNum);if(a.length<2)return null;const m=mean(a);return Math.sqrt(mean(a.map(function(x){return Math.pow(x-m,2);}))); }
  function cv(values){const m=mean(values),s=sd(values);return m&&s!==null?(s/Math.abs(m))*100:null;}
  function sampleSpeed(a,b){const d=distance(a,b),dt=isNum(a.timeStamp)&&isNum(b.timeStamp)?b.timeStamp-a.timeStamp:null;return d!==null&&dt!==null&&dt>0?d/(dt/1000):null;}
  function summarize(samples,contacts,multi){
    const valid=samples.filter(function(s){return isNum(s.clientX)&&isNum(s.clientY);}),durations=contacts.map(function(c){return c.durationMs;}).filter(isNum);
    const paths=[],displacements=[],dxs=[],dys=[],speeds=[],accelerations=[],intervals=[],pauseIntervals=[];let movementCount=0,stationary=0,pauseDuration=0;
    contacts.forEach(function(c){const ss=c.samples.filter(function(s){return isNum(s.clientX)&&isNum(s.clientY);});if(!ss.length)return;let path=0;
      for(let i=1;i<ss.length;i+=1){const d=distance(ss[i-1],ss[i]),dt=isNum(ss[i-1].timeStamp)&&isNum(ss[i].timeStamp)?ss[i].timeStamp-ss[i-1].timeStamp:null;if(dt!==null&&dt>0)intervals.push(dt);
        if(d!==null){path+=d;if(d>1)movementCount+=1;if(dt!==null&&dt>0&&d<=1)stationary+=dt;if(dt!==null&&dt>250){pauseIntervals.push(dt);pauseDuration+=Math.max(0,dt-250);}const v=sampleSpeed(ss[i-1],ss[i]);if(v!==null)speeds.push({value:v,t:ss[i].timeStamp});}}
      paths.push(path);const a=ss[0],b=ss[ss.length-1];displacements.push(distance(a,b));dxs.push(b.clientX-a.clientX);dys.push(b.clientY-a.clientY);
    });
    for(let i=1;i<speeds.length;i+=1){const dt=(speeds[i].t-speeds[i-1].t)/1000;if(dt>0)accelerations.push(Math.abs(speeds[i].value-speeds[i-1].value)/dt);}
    const path=paths.length?paths.reduce(function(a,b){return a+b;},0):null,disp=displacements.length?displacements.filter(isNum).reduce(function(a,b){return a+b;},0):null;
    const dx=dxs.length?dxs.reduce(function(a,b){return a+b;},0):null,dy=dys.length?dys.reduce(function(a,b){return a+b;},0):null;
    const angle=dx!==null&&dy!==null&&Math.hypot(dx,dy)>0?(Math.atan2(dy,dx)*180/Math.PI+360)%360:null;
    const times=valid.map(function(s){return s.timeStamp;}).filter(isNum),elapsed=times.length>1?Math.max.apply(null,times)-Math.min.apply(null,times):null;
    const width=samples.map(function(s){return s.width;}).filter(function(v){return isNum(v)&&v>0;}),height=samples.map(function(s){return s.height;}).filter(function(v){return isNum(v)&&v>0;});
    const ratios=samples.map(function(s){return isNum(s.width)&&isNum(s.height)&&s.height!==0?s.width/s.height:null;}).filter(isNum),pressures=samples.map(function(s){return s.pressure;}).filter(isNum);
    const taps=contacts.filter(function(c){return c.isTap;}),tapDurations=taps.map(function(c){return c.durationMs;}).filter(isNum),tapDisplacements=taps.map(function(c){return c.displacementPx;}).filter(isNum),tapIntervals=[];
    for(let i=1;i<taps.length;i+=1)if(isNum(taps[i-1].endTimeMs)&&isNum(taps[i].endTimeMs))tapIntervals.push(taps[i].endTimeMs-taps[i-1].endTimeMs);
    const expected=samples.length*POINTER_KEYS.length;let missing=0;samples.forEach(function(s){POINTER_KEYS.forEach(function(k){if(s[k]===null||s[k]===undefined)missing+=1;});});
    const distances=[];(multi||[]).forEach(function(m){(m.pointerDistancesPx||[]).forEach(function(p){if(isNum(p.distancePx))distances.push(p.distancePx);});});
    const summedContactTime=durations.length?durations.reduce(function(a,b){return a+b;},0):null,meanTap=mean(tapIntervals);
    return{
      sampleCount:samples.length,validCoordinateSamples:valid.length,contactCount:contacts.length,completedContactCount:contacts.filter(function(c){return c.endedAt!==null;}).length,
      activeContactCount:contacts.filter(function(c){return c.endedAt===null;}).length,totalContactDurationMs:summedContactTime,longestContactDurationMs:max(durations),averageContactDurationMs:mean(durations),
      tapCount:taps.length,averageInterTapIntervalMs:meanTap,tapFrequencyHz:meanTap>0?1000/meanTap:null,totalPathLengthPx:path,totalStraightDisplacementPx:disp,
      xDisplacementPx:dx,yDisplacementPx:dy,pathToDisplacementRatio:disp>0?path/disp:null,lastInstantaneousSpeedPxS:speeds.length?speeds[speeds.length-1].value:null,
      averageSpeedPxS:summedContactTime>0&&path!==null?path/(summedContactTime/1000):null,maxSpeedPxS:speeds.length?max(speeds.map(function(s){return s.value;})):null,
      maxAccelerationPxS2:max(accelerations),movementDirectionDeg:angle,meanSampleIntervalMs:mean(intervals),sampleFrequencyHz:elapsed>0?(valid.length-1)/(elapsed/1000):null,
      pauseGapCount:pauseIntervals.length,estimatedPauseDurationMs:pauseDuration,movementCount:movementCount,stationaryContactDurationMs:stationary,
      meanWidthPx:mean(width),meanHeightPx:mean(height),meanWidthHeightRatio:mean(ratios),maxWidthChangePx:width.length>1?max(width)-min(width):null,
      maxHeightChangePx:height.length>1?max(height)-min(height):null,pressureMin:min(pressures),pressureMax:max(pressures),pressureMean:mean(pressures),pressureStdDev:sd(pressures),
      multiTouchSampleCount:(multi||[]).length,maxObservedMultiTouchDistancePx:max(distances),meanMultiTouchDistancePx:mean(distances),tapDurationCVPercent:cv(tapDurations),
      tapDisplacementCVPercent:cv(tapDisplacements),interTapIntervalCVPercent:cv(tapIntervals),missingPointerFieldPercent:expected?(missing/expected)*100:null,
      missingPointerFieldCount:missing,expectedPointerFieldCount:expected,tapDurationValidCount:tapDurations.length,tapDisplacementValidCount:tapDisplacements.length,
      interTapIntervalValidCount:tapIntervals.length,speedValidCount:speeds.length,pressureValidCount:pressures.length,dimensionValidCount:Math.min(width.length,height.length),
      sampleIntervalValidCount:intervals.length,accelerationValidCount:accelerations.length,multiTouchDistanceValidCount:distances.length
    };
  }
  function metricsModel(){
    const now=performance.now(),contacts=state.contacts.map(function(c){if(c.endedAt)return c;const copy=Object.assign({},c);copy.durationMs=isNum(c.startTimeMs)?Math.max(0,now-c.startTimeMs):null;return copy;});
    return summarize(state.samples,contacts,state.multiSamples);
  }
  function fmt(v,d){if(!isNum(v))return "n/a";const places=d===undefined?2:d;if(Math.abs(v)>=10000)return Math.round(v).toLocaleString("en-US");return Number(v.toFixed(places)).toString();}
  function escapeHtml(v){return String(v===null||v===undefined?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
  function metricCard(label,value,unit,count,note){return '<article class="metric-card"><div class="metric-card-label">'+escapeHtml(label)+'</div><div class="metric-value-line"><strong class="metric-value">'+escapeHtml(fmt(value))+'</strong><span class="metric-unit">'+escapeHtml(unit||"")+'</span></div><div class="metric-count">'+escapeHtml(count===null||count===undefined?"N VALID VALUES":count+" VALID VALUES")+'</div>'+(note?'<div class="metric-note">'+escapeHtml(note)+'</div>':"")+"</article>";}
  function renderMetrics(){
    const m=metricsModel();
    const a=[["Longest contact duration",m.longestContactDurationMs,"ms",m.completedContactCount,"Completed contacts"],["Average contact duration",m.averageContactDurationMs,"ms",m.completedContactCount,"Completed contacts"],["Active / total contact time",m.totalContactDurationMs,"ms",m.contactCount,"Sum across contacts"],["Inter-tap interval",m.averageInterTapIntervalMs,"ms",m.interTapIntervalValidCount,"Tap-to-tap mean"],["Tap frequency",m.tapFrequencyHz,"Hz",m.interTapIntervalValidCount,"Inverse mean interval"]];
    const b=[["Path length",m.totalPathLengthPx,"px",m.validCoordinateSamples,"Sum across contacts"],["Straight displacement",m.totalStraightDisplacementPx,"px",m.contactCount,"Sum of contact endpoints"],["Instantaneous speed",m.lastInstantaneousSpeedPxS,"px/s",m.speedValidCount,"Last valid segment"],["Average speed estimate",m.averageSpeedPxS,"px/s",m.completedContactCount,"Path / completed contact time"],["Maximum speed estimate",m.maxSpeedPxS,"px/s",m.speedValidCount,"Peak valid segment"],["Maximum acceleration estimate",m.maxAccelerationPxS2,"px/s²",m.accelerationValidCount,"Absolute speed change / time"],["Movement direction",m.movementDirectionDeg,"°",m.contactCount,"0° is +X"],["X / Y displacement",null,"",m.contactCount,"See paired values"]];
    const c=[["Mean sample interval",m.meanSampleIntervalMs,"ms",m.sampleIntervalValidCount,"Positive intervals only"],["Sample frequency estimate",m.sampleFrequencyHz,"Hz",m.validCoordinateSamples,"Samples / elapsed time"],["Pause-gap count",m.pauseGapCount,"gaps",m.sampleIntervalValidCount,"Interval above 250 ms"],["Estimated pause duration",m.estimatedPauseDurationMs,"ms",m.pauseGapCount,"Gap time beyond 250 ms"],["Movement count",m.movementCount,"steps",m.validCoordinateSamples,"Adjacent samples > 1 px"],["Stationary-contact duration",m.stationaryContactDurationMs,"ms",m.sampleIntervalValidCount,"Adjacent samples ≤ 1 px"]];
    const d=[["Mean contact width",m.meanWidthPx,"px",m.dimensionValidCount,"Browser reported"],["Mean contact height",m.meanHeightPx,"px",m.dimensionValidCount,"Browser reported"],["Mean width / height ratio",m.meanWidthHeightRatio,"ratio",m.dimensionValidCount,"Width divided by height"],["Maximum width change",m.maxWidthChangePx,"px",m.dimensionValidCount,"Max minus min"],["Maximum height change",m.maxHeightChangePx,"px",m.dimensionValidCount,"Max minus min"],["Minimum reported pressure",m.pressureMin,"nominal",m.pressureValidCount,"Uncalibrated"],["Mean reported pressure",m.pressureMean,"nominal",m.pressureValidCount,"Uncalibrated"],["Maximum reported pressure",m.pressureMax,"nominal",m.pressureValidCount,"Uncalibrated"],["Pressure standard deviation",m.pressureStdDev,"nominal",m.pressureValidCount,"Population spread"]];
    const r=[["Active pointer count now",state.active.size,"pointers",state.active.size,"Tracked pointer contacts"],["Maximum simultaneous pointers",state.maxConcurrentPointers,"pointers",state.samples.length,"Observed this session"],["Multi-touch samples",m.multiTouchSampleCount,"events",m.multiTouchSampleCount,"2+ active pointers"],["Maximum pair distance",m.maxObservedMultiTouchDistancePx,"px",m.multiTouchDistanceValidCount,"Between active pointers"],["Mean pair distance",m.meanMultiTouchDistancePx,"px",m.multiTouchDistanceValidCount,"Across observed pairs"],["Tap duration variability",m.tapDurationCVPercent,"% CV",m.tapDurationValidCount,"Exploratory repeatability"],["Tap displacement variability",m.tapDisplacementCVPercent,"% CV",m.tapDisplacementValidCount,"Exploratory repeatability"],["Inter-tap variability",m.interTapIntervalCVPercent,"% CV",m.interTapIntervalValidCount,"Exploratory repeatability"]];
    $("contactMetrics").innerHTML=a.map(function(x){return metricCard.apply(null,x);}).join("");
    $("motionMetrics").innerHTML=b.map(function(x){if(x[0]==="X / Y displacement")return '<article class="metric-card"><div class="metric-card-label">X / Y displacement</div><div class="metric-value-line"><strong class="metric-value">'+escapeHtml(fmt(m.xDisplacementPx))+" / "+escapeHtml(fmt(m.yDisplacementPx))+'</strong><span class="metric-unit">px</span></div><div class="metric-count">'+m.contactCount+' CONTACTS</div><div class="metric-note">Net per-contact axis displacement sum</div></article>';return metricCard.apply(null,x);}).join("")+metricCard("Path / displacement ratio",m.pathToDisplacementRatio,"ratio",m.contactCount,"Undefined when displacement is zero");
    $("samplingMetrics").innerHTML=c.map(function(x){return metricCard.apply(null,x);}).join("");
    $("contactSignalMetrics").innerHTML=d.map(function(x){return metricCard.apply(null,x);}).join("");
    $("repeatMetrics").innerHTML=r.map(function(x){return metricCard.apply(null,x);}).join("");
    $("missingPercent").textContent=m.missingPointerFieldPercent===null?"n/a":fmt(m.missingPointerFieldPercent,1)+"%";$("validSamples").textContent=String(m.validCoordinateSamples);$("maxPointers").textContent=String(state.maxConcurrentPointers);
  }
  function scheduleRender(){
    if(state.pendingRender)return;state.pendingRender=true;
    requestAnimationFrame(function(){state.pendingRender=false;renderQuickStats();renderMetrics();renderTimeline();renderCapabilityReport();renderPlots();drawTrail();});
  }
  function renderQuickStats(){
    const done=state.contacts.filter(function(c){return c.endedAt!==null;}).length;
    $("quickEventCount").textContent=state.events.length.toLocaleString("en-US");$("quickSampleCount").textContent=state.samples.length.toLocaleString("en-US");$("quickContactCount").textContent=done+" / "+state.active.size;
    let ms=0;if(state.startTime)ms=(state.endTime?new Date(state.endTime).getTime():Date.now())-new Date(state.startTime).getTime();$("quickElapsed").textContent=formatDuration(ms);
    $("timelineCount").textContent=String(state.events.length);$("startButton").disabled=state.running;$("stopButton").disabled=!state.running;
    $("sessionBadge").dataset.state=state.running?"recording":(state.startTime?"stopped":"idle");$("sessionBadge").textContent=state.running?"RECORDING":(state.startTime?"STOPPED":"IDLE");
    $("surfaceStatus").textContent=state.running?"Capturing browser events":"Capture is paused";document.querySelector(".surface-status").classList.toggle("recording",state.running);
    $("surfacePrompt").style.opacity=state.samples.length?"0":(state.running?".55":"1");
    const rect=$("touchSurface").getBoundingClientRect();$("surfaceDimensions").textContent="SURFACE "+Math.round(rect.width)+" × "+Math.round(rect.height);
    $("beginTrialButton").disabled=!!state.activeTrial;$("endTrialButton").disabled=!state.activeTrial;
    $("trialStatus").textContent=state.activeTrial?"Active: "+state.activeTrial.label+" · "+state.activeTrial.protocol+" · event #"+state.activeTrial.startEventIndex:state.trials.length+" saved trial(s). No active trial.";
  }
  function formatDuration(ms){if(!isNum(ms)||ms<0)return"00:00";const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return h?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");}
  function renderTimeline(){
    const root=$("eventTimeline");if(!state.events.length){root.innerHTML='<div class="empty-state">No events captured yet.</div>';$("selectedEventTitle").textContent="Waiting for an event";$("rawInspector").textContent="Select an event from the timeline to inspect its raw values.";$("copySelectedButton").disabled=true;return;}
    root.innerHTML=state.events.slice(-120).reverse().map(function(e){const active=e.index===state.selectedEventIndex,time=e.capturedAt?e.capturedAt.slice(11,23):"—";const detail=e.properties&&e.properties.pointerType?e.properties.pointerType+" · id "+e.properties.pointerId:e.source==="touch-secondary"?"TouchEvent secondary record":"event snapshot";return '<button type="button" class="event-row" data-event-index="'+e.index+'" aria-pressed="'+active+'"><span class="event-index">'+String(e.index).padStart(4,"0")+'</span><span><span class="event-name">'+escapeHtml(e.type||"unknown")+'<span class="event-source-tag">'+escapeHtml(e.source)+'</span></span><span class="event-detail">'+escapeHtml(detail)+'</span></span><span class="event-time">'+escapeHtml(time)+'</span></button>';}).join("");
    if(state.selectedEventIndex===null||!state.events[state.selectedEventIndex])state.selectedEventIndex=state.events[state.events.length-1].index;
    const selected=state.events[state.selectedEventIndex];if(selected){$("selectedEventTitle").textContent="#"+selected.index+" · "+selected.type+" · "+selected.source;$("rawInspector").textContent=JSON.stringify(selected,null,2);$("copySelectedButton").disabled=false;}
  }
  function isSupportedProperty(key,group){
    try{
      if(group==="window.PointerEvent")return typeof window.PointerEvent==="function";if(group==="window.TouchEvent")return typeof window.TouchEvent==="function";if(group==="navigator")return isNum(navigator.maxTouchPoints);
      if(group==="method"){if(key==="getCoalescedEvents")return !!(window.PointerEvent&&window.PointerEvent.prototype&&typeof window.PointerEvent.prototype.getCoalescedEvents==="function");if(key==="getPredictedEvents")return !!(window.PointerEvent&&window.PointerEvent.prototype&&typeof window.PointerEvent.prototype.getPredictedEvents==="function");}
      if(group==="eventType")return key==="pointerrawupdate"&&("onpointerrawupdate"in window);if(group==="touchEvent")return typeof window.TouchEvent==="function";
      let ps=[];if(group==="pointer"){if(window.PointerEvent)ps.push(window.PointerEvent.prototype);if(window.MouseEvent)ps.push(window.MouseEvent.prototype);if(window.Event)ps.push(window.Event.prototype);}
      else if(group==="event"){if(window.Event)ps.push(window.Event.prototype);}else if(group==="touch"){if(window.Touch)ps.push(window.Touch.prototype);}
      return ps.some(function(p){return p&&key in p;});
    }catch(_){return false;}
  }
  function observedCount(key){return state.observationCounts[key]||0;}
  function renderCapabilityReport(){
    $("capabilityTableBody").innerHTML=CAPABILITY_PROPERTIES.map(function(s){const key=s[0],label=s[1],supported=isSupportedProperty(key,s[2]),seen=observedCount(key),status=seen>0?"observed":(supported?"supported":"unavailable"),txt=status==="observed"?"OBSERVED":(status==="supported"?"SUPPORTED · NOT SEEN":"UNAVAILABLE / NOT OBSERVED");return '<tr><td>'+escapeHtml(label)+'</td><td><span class="status-tag '+(supported?"supported":"unavailable")+'">'+(supported?"AVAILABLE":"NOT EXPOSED")+'</span></td><td><span class="status-tag '+status+'">'+txt+'</span></td><td>'+seen+'</td></tr>';}).join("");
  }
  function renderDeviceInfo(){
    const data=[["User agent",navigator.userAgent||"not exposed"],["Platform",(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||"not exposed"],["Language",navigator.language||"not exposed"],["Viewport",window.innerWidth+" × "+window.innerHeight+" CSS px"],["Screen",window.screen?window.screen.width+" × "+window.screen.height:"not exposed"],["Pixel ratio",isNum(window.devicePixelRatio)?window.devicePixelRatio:"not exposed"],["maxTouchPoints",isNum(navigator.maxTouchPoints)?navigator.maxTouchPoints:"not exposed"],["Pointer Events",window.PointerEvent?"available":"not available"],["Touch Events",window.TouchEvent?"available":"not available"],["Online flag",typeof navigator.onLine==="boolean"?(navigator.onLine?"online":"offline"):"not exposed"]];
    $("deviceInfo").innerHTML=data.map(function(r){return '<div class="device-row"><span>'+escapeHtml(r[0])+'</span><span>'+escapeHtml(r[1])+"</span></div>";}).join("");
  }
  function setupCanvas(canvas){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx:ctx,width:r.width,height:r.height};}
  function drawTrail(){
    const s=setupCanvas($("trailCanvas")),ctx=s.ctx,w=s.width,h=s.height;ctx.clearRect(0,0,w,h);if(!$("trailToggle").checked)return;const groups=new Map();
    state.samples.slice(state.trailStartSampleIndex).forEach(function(p){if(!isNum(p.surfaceX)||!isNum(p.surfaceY))return;const id=p.contactId===null?"unknown":String(p.contactId);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);});
    groups.forEach(function(ps){if(ps.length<2)return;ctx.beginPath();ps.forEach(function(p,i){if(!i)ctx.moveTo(p.surfaceX,p.surfaceY);else ctx.lineTo(p.surfaceX,p.surfaceY);});ctx.strokeStyle="rgba(98,231,242,.44)";ctx.lineWidth=1.4;ctx.stroke();const p=ps[ps.length-1];ctx.beginPath();ctx.arc(p.surfaceX,p.surfaceY,2.4,0,Math.PI*2);ctx.fillStyle="#62e7f2";ctx.fill();});
  }
  function drawLineChart(id,entries,options){
    const s=setupCanvas($(id)),ctx=s.ctx,w=s.width,h=s.height,pad={left:32,right:12,top:10,bottom:22},pw=Math.max(1,w-pad.left-pad.right),ph=Math.max(1,h-pad.top-pad.bottom);ctx.clearRect(0,0,w,h);ctx.strokeStyle="rgba(84,105,125,.22)";ctx.lineWidth=1;
    for(let i=0;i<=3;i+=1){const y=pad.top+ph*i/3;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(w-pad.right,y);ctx.stroke();}
    const points=entries.filter(function(p){return isNum(p.x)&&isNum(p.y);});if(points.length<2){ctx.fillStyle="#657789";ctx.font="10px ui-monospace, monospace";ctx.textAlign="center";ctx.fillText("Waiting for samples",w/2,h/2);return;}
    let minX=Math.min.apply(null,points.map(function(p){return p.x;})),maxX=Math.max.apply(null,points.map(function(p){return p.x;})),minY=options&&isNum(options.minY)?options.minY:Math.min.apply(null,points.map(function(p){return p.y;})),maxY=options&&isNum(options.maxY)?options.maxY:Math.max.apply(null,points.map(function(p){return p.y;}));
    if(maxX===minX)maxX=minX+1;if(maxY===minY){maxY=minY+1;minY=Math.max(0,minY-1);}const px=function(x){return pad.left+((x-minX)/(maxX-minX))*pw;},py=function(y){return pad.top+ph-((y-minY)/(maxY-minY))*ph;};
    ctx.fillStyle="#6e8091";ctx.font="9px ui-monospace, monospace";ctx.textAlign="right";ctx.fillText(fmt(maxY,1),pad.left-5,pad.top+4);ctx.fillText(fmt(minY,1),pad.left-5,pad.top+ph);
    ctx.strokeStyle="#62e7f2";ctx.lineWidth=1.5;ctx.beginPath();points.forEach(function(p,i){if(!i)ctx.moveTo(px(p.x),py(p.y));else ctx.lineTo(px(p.x),py(p.y));});ctx.stroke();
    if(options&&options.secondary){const second=options.secondary.filter(function(p){return isNum(p.x)&&isNum(p.y);});if(second.length>1){let lo=Math.min.apply(null,second.map(function(p){return p.y;})),hi=Math.max.apply(null,second.map(function(p){return p.y;}));if(hi===lo)hi=lo+1;ctx.strokeStyle="#c5a6ff";ctx.lineWidth=1.1;ctx.beginPath();second.forEach(function(p,i){const y=pad.top+ph-((p.y-lo)/(hi-lo))*ph;if(!i)ctx.moveTo(px(p.x),y);else ctx.lineTo(px(p.x),y);});ctx.stroke();}}
  }
  function renderPlots(){
    const ss=state.samples.filter(function(s){return isNum(s.timeStamp);});
    if(!ss.length){["speedChart","pressureChart","dimensionsChart"].forEach(function(id){drawLineChart(id,[],{});});const s=setupCanvas($("trajectoryChart"));s.ctx.clearRect(0,0,s.width,s.height);s.ctx.fillStyle="#657789";s.ctx.font="10px ui-monospace, monospace";s.ctx.textAlign="center";s.ctx.fillText("Waiting for samples",s.width/2,s.height/2);return;}
    const origin=ss[0].timeStamp,speed=[],pressure=[],width=[],height=[];
    for(let i=0;i<ss.length;i+=1){const p=ss[i],x=p.timeStamp-origin;if(isNum(p.pressure))pressure.push({x:x,y:p.pressure});if(isNum(p.width))width.push({x:x,y:p.width});if(isNum(p.height))height.push({x:x,y:p.height});if(i>0&&ss[i].contactId===ss[i-1].contactId){const v=sampleSpeed(ss[i-1],p);if(isNum(v))speed.push({x:x,y:v});}}
    const canvas=$("trajectoryChart"),s=setupCanvas(canvas),ctx=s.ctx;ctx.clearRect(0,0,s.width,s.height);const pts=ss.filter(function(p){return isNum(p.surfaceX)&&isNum(p.surfaceY);});
    if(pts.length<2){ctx.fillStyle="#657789";ctx.font="10px ui-monospace, monospace";ctx.textAlign="center";ctx.fillText("Waiting for positions",s.width/2,s.height/2);}
    else{const xs=pts.map(function(p){return p.surfaceX;}),ys=pts.map(function(p){return p.surfaceY;}),loX=Math.min.apply(null,xs),hiX=Math.max.apply(null,xs),loY=Math.min.apply(null,ys),hiY=Math.max.apply(null,ys),pad=12,pw=s.width-pad*2,ph=s.height-pad*2;
      const sx=function(x){return pad+((x-loX)/(hiX===loX?1:hiX-loX))*pw;},sy=function(y){return pad+((y-loY)/(hiY===loY?1:hiY-loY))*ph;};ctx.strokeStyle="#62e7f2";ctx.lineWidth=1.5;ctx.beginPath();pts.forEach(function(p,i){if(!i)ctx.moveTo(sx(p.surfaceX),sy(p.surfaceY));else ctx.lineTo(sx(p.surfaceX),sy(p.surfaceY));});ctx.stroke();}
    drawLineChart("speedChart",speed,{});drawLineChart("pressureChart",pressure,{minY:0,maxY:1});drawLineChart("dimensionsChart",width,{secondary:height});
  }
  function deviceSnapshot(){return{userAgent:navigator.userAgent||null,platform:(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||null,language:navigator.language||null,viewport:{width:window.innerWidth,height:window.innerHeight},screen:window.screen?{width:window.screen.width,height:window.screen.height}:null,devicePixelRatio:isNum(window.devicePixelRatio)?window.devicePixelRatio:null,maxTouchPoints:isNum(navigator.maxTouchPoints)?navigator.maxTouchPoints:null,pointerEvents:!!window.PointerEvent,touchEvents:!!window.TouchEvent,online:typeof navigator.onLine==="boolean"?navigator.onLine:null};}
  function sessionPayload(){
    return{schemaVersion:"1.0.0",app:"Touch Lab",sessionId:state.sessionId,exportedAt:isoNow(),privacy:{processing:"in-memory browser only",remoteUpload:false,localStorageUsed:false},
      session:{startedAt:state.startTime,endedAt:state.endTime||(state.startTime?null:isoNow()),runningAtExport:state.running,eventSafetyCap:MAX_EVENTS,safetyCapReached:state.overLimit},
      device:deviceSnapshot(),capabilities:CAPABILITY_PROPERTIES.map(function(r){return{property:r[1],apiCheck:isSupportedProperty(r[0],r[2]),observedCount:observedCount(r[0])};}),
      summaryMetrics:metricsModel(),trials:state.trials,activeTrial:state.activeTrial,events:state.events,samples:state.samples,contacts:state.contacts,multiTouchObservations:state.multiSamples};
  }
  function downloadBlob(filename,data,type){const blob=new Blob([data],{type:type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  function safeFilename(ext){return"touch-lab-"+(state.sessionId||"session")+"."+ext;}
  function csvCell(value){let text;if(value===null||value===undefined)text="";else if(typeof value==="object")text=JSON.stringify(value);else text=String(value);return '"'+text.replace(/"/g,'""')+'"';}
  function sessionCsv(){
    const p=sessionPayload(),rows=[];p.events.forEach(function(e){const r=Object.assign({},e,e.properties||{});r.rowType="event";r.rawJSON=JSON.stringify(e);rows.push(r);});
    p.samples.forEach(function(s){const r=Object.assign({},s);r.rowType="sample";r.rawJSON=JSON.stringify(s);rows.push(r);});
    Object.keys(p.summaryMetrics).forEach(function(k){rows.push({rowType:"metric",metric:k,value:p.summaryMetrics[k],rawJSON:JSON.stringify({metric:k,value:p.summaryMetrics[k]})});});
    const columns=[],seen=new Set();rows.forEach(function(r){Object.keys(r).forEach(function(k){if(!seen.has(k)){seen.add(k);columns.push(k);}});});
    return[columns.map(csvCell).join(","),rows.map(function(r){return columns.map(function(k){return csvCell(r[k]);}).join(",");}).join("\r\n")].join("\r\n");
  }
  function copyText(text){if(navigator.clipboard&&typeof navigator.clipboard.writeText==="function"){navigator.clipboard.writeText(text).then(function(){flashStatus("Copied to clipboard");}).catch(function(){fallbackCopy(text);});}else fallbackCopy(text);}
  function fallbackCopy(text){const el=document.createElement("textarea");el.value=text;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.select();let ok=false;try{ok=document.execCommand("copy");}catch(_){}el.remove();flashStatus(ok?"Copied to clipboard":"Copy failed — use export instead");}
  let flashTimer=null;function flashStatus(message){const el=$("surfaceStatus");el.textContent=message;if(flashTimer)clearTimeout(flashTimer);flashTimer=setTimeout(function(){el.textContent=state.running?"Capturing browser events":"Capture is paused";},1800);}
  function beginSession(){if(!state.startTime)state.startTime=isoNow();state.endTime=null;state.running=true;state.overLimit=false;$("surfacePrompt").style.opacity="0";scheduleRender();}
  function thisSamples(start,end){return state.samples.filter(function(s){return s.sampleIndex>=start&&s.sampleIndex<end;});}
  function endActiveTrial(){if(!state.activeTrial)return;const t=state.activeTrial;t.endedAt=isoNow();t.endEventIndex=state.events.length?state.events[state.events.length-1].index:null;t.endSampleIndex=state.samples.length;
    const cs=state.contacts.filter(function(c){return t.contactIds.indexOf(c.contactId)>=0;});t.summary=summarize(thisSamples(t.startSampleIndex,t.endSampleIndex),cs,state.multiSamples);state.trials.push(t);state.activeTrial=null;}
  function stopSession(){state.running=false;state.endTime=isoNow();endActiveTrial();scheduleRender();}
  function resetSession(keepRunning){
    state.events=[];state.samples=[];state.contacts=[];state.active.clear();state.activePositions.clear();state.trials=[];state.activeTrial=null;state.selectedEventIndex=null;state.nextContactId=1;state.maxConcurrentPointers=0;state.tapIntervals=[];state.completedTapUps=[];state.multiSamples=[];state.overLimit=false;state.trailStartSampleIndex=0;
    state.observationCounts=Object.create(null);CAPABILITY_PROPERTIES.forEach(function(r){state.observationCounts[r[0]]=0;});state.sessionId=makeSessionId();state.startTime=keepRunning?isoNow():null;state.endTime=null;state.running=!!keepRunning;
    $("pointerLayer").innerHTML="";$("liveCoordinates").textContent="— / —";$("surfacePrompt").style.opacity=keepRunning?".45":"1";$("selfTestResults").textContent="Self-check has not run.";delete $("selfTestResults").dataset.state;scheduleRender();
  }
  function beginTrial(){if(!state.running)beginSession();const protocol=$("protocolSelect").value,label=$("trialLabel").value.trim()||(protocol+" trial "+(state.trials.length+1));
    state.activeTrial={id:"trial-"+String(state.trials.length+1).padStart(2,"0"),label:label,protocol:protocol,startedAt:isoNow(),endedAt:null,startEventIndex:state.events.length,endEventIndex:null,startSampleIndex:state.samples.length,endSampleIndex:null,contactIds:[],summary:null};scheduleRender();}
  function clearTrail(){state.trailStartSampleIndex=state.samples.length;const c=$("trailCanvas"),ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);drawTrail();}
  function clickTimeline(e){const b=e.target.closest("[data-event-index]");if(!b)return;state.selectedEventIndex=Number(b.dataset.eventIndex);renderTimeline();}
  function runSelfCheck(){
    const results=[];function check(name,fn){try{results.push({name:name,pass:!!fn()});}catch(e){results.push({name:name,pass:false,error:String(e&&e.message||e)});}}
    check("Missing-field access returns null",function(){return vOrNull({},"pressure")===null&&nOrNull({},"clientX")===null;});
    check("Euclidean distance returns 5 px",function(){return Math.abs(distance({clientX:0,clientY:0},{clientX:3,clientY:4})-5)<.0001;});
    check("10 px over 100 ms returns 100 px/s",function(){return Math.abs(sampleSpeed({clientX:0,clientY:0,timeStamp:100},{clientX:10,clientY:0,timeStamp:200})-100)<.0001;});
    check("CSV doubles embedded quotes",function(){return csvCell('a,"b"')==='"a,""b"""';});
    check("JSON serialization preserves null",function(){return JSON.parse(JSON.stringify({pressure:null})).pressure===null;});
    check("Capability result is boolean",function(){return typeof isSupportedProperty("pointerId","pointer")==="boolean";});
    const failed=results.filter(function(r){return!r.pass;});$("selfTestResults").dataset.state=failed.length?"fail":"pass";
    $("selfTestResults").textContent=(failed.length?"SELF-CHECK FAILED: ":"SELF-CHECK PASSED: ")+results.filter(function(r){return r.pass;}).length+"/"+results.length+" checks. "+failed.map(function(r){return r.name+(r.error?" ("+r.error+")":"");}).join("; ");
  }

  $("startButton").addEventListener("click",beginSession);$("stopButton").addEventListener("click",stopSession);
  $("resetButton").addEventListener("click",function(){resetSession(state.running);});$("clearButton").addEventListener("click",function(){resetSession(false);});
  $("beginTrialButton").addEventListener("click",beginTrial);$("endTrialButton").addEventListener("click",function(){endActiveTrial();scheduleRender();});$("clearTrailButton").addEventListener("click",clearTrail);
  $("trailToggle").addEventListener("change",drawTrail);$("eventTimeline").addEventListener("click",clickTimeline);
  $("copySelectedButton").addEventListener("click",function(){if(state.selectedEventIndex!==null&&state.events[state.selectedEventIndex])copyText(JSON.stringify(state.events[state.selectedEventIndex],null,2));});
  $("copyAllJsonButton").addEventListener("click",function(){copyText(JSON.stringify(sessionPayload(),null,2));});
  $("downloadJsonButton").addEventListener("click",function(){downloadBlob(safeFilename("json"),JSON.stringify(sessionPayload(),null,2),"application/json;charset=utf-8");});
  $("downloadCsvButton").addEventListener("click",function(){downloadBlob(safeFilename("csv"),sessionCsv(),"text/csv;charset=utf-8");});
  $("selfTestButton").addEventListener("click",runSelfCheck);
  const surface=$("touchSurface");
  if(window.PointerEvent){["pointerdown","pointermove","pointerup","pointercancel","pointerover","pointerout","pointerenter","pointerleave","gotpointercapture","lostpointercapture","pointerrawupdate"].forEach(function(type){
    if(type==="pointerrawupdate"&&!("onpointerrawupdate"in window))return;surface.addEventListener(type,function(e){if(e.type==="pointerdown"){try{surface.setPointerCapture(e.pointerId);}catch(_){}}logPointerEvent(e);},{passive:true});
  });}
  if(window.TouchEvent){["touchstart","touchmove","touchend","touchcancel"].forEach(function(type){surface.addEventListener(type,logTouchEvent,{passive:true});});}
  window.addEventListener("resize",function(){renderDeviceInfo();drawTrail();renderPlots();},{passive:true});
  window.addEventListener("beforeunload",function(){if(state.activeTrial)endActiveTrial();});
  renderDeviceInfo();renderQuickStats();renderMetrics();renderCapabilityReport();renderTimeline();renderPlots();drawTrail();
  setInterval(function(){if(state.running&&Date.now()-state.lastElapsedRender>500){state.lastElapsedRender=Date.now();renderQuickStats();renderMetrics();}},500);
})();