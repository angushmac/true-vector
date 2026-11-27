(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const NM_METRES = 1852;
  const FT_PER_METRE = 3.280839895;
  const state = { target:null, watchId:null, fix:null, previousRange:null, previousTime:null, closingRates:[], lastEta:null };

  let breadcrumbs=[];
  const trunc5 = n => Number(String(n).includes("e")?Math.trunc(n*100000)/100000:String(n).replace(/(\.\d{5})\d+$/, "$1"));
  const sortName = (a,b) => a.localeCompare(b,"en",{numeric:true,sensitivity:"base"});
  const fmt = (n, digits=1) => Number.isFinite(n) ? n.toFixed(digits) : "—";
  const norm360 = n => (n % 360 + 360) % 360;
  const roundTo2 = n => Math.round(n / 2) * 2;

  function distanceAndBearing(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180, R = 6371008.8;
    const p1=lat1*rad, p2=lat2*rad, dp=(lat2-lat1)*rad, dl=(lon2-lon1)*rad;
    const a=Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
    const y=Math.sin(dl)*Math.cos(p2);
    const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    return { metres:R*c, bearing:norm360(Math.atan2(y,x)/rad) };
  }

  function formatEta(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 99*3600+59*60) return "--:--";
    const total=Math.round(seconds), mins=Math.floor(total/60), secs=total%60;
    return `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  }

  function setConfidence(level, note) {
    $("slopeMetric").dataset.confidence=level;
    $("heightMetric").dataset.confidence=level;
    $("slopeNote").textContent=note;
    $("heightNote").textContent=note;
  }

  function updateEta(range, timestamp) {
    if (state.previousRange !== null && state.previousTime !== null) {
      const dt=(timestamp-state.previousTime)/1000;
      const dr=state.previousRange-range;
      if (dt >= 1 && dt <= 20 && Math.abs(dr) < 1000) {
        const rate=dr/dt;
        if (rate > 0.25) {
          state.closingRates.push(rate);
          if (state.closingRates.length>8) state.closingRates.shift();
        } else if (rate < -0.5) {
          state.closingRates=[];
        }
      }
    }
    state.previousRange=range;
    state.previousTime=timestamp;
    if (state.closingRates.length >= 3) {
      const sorted=[...state.closingRates].sort((a,b)=>a-b);
      const median=sorted[Math.floor(sorted.length/2)];
      const eta=range/median;
      $("eta").textContent=formatEta(eta);
      $("etaNote").replaceChildren(document.createTextNode("Closing at "),Object.assign(document.createElement("strong"),{textContent:`${(median*1.943844).toFixed(1)} kt`}));
    } else {
      $("eta").textContent="--:--";
      $("etaNote").textContent=state.closingRates.length ? "Establishing closing rate" : "Waiting for closing movement";
    }
  }

  function render() {
    if (!state.fix || !state.target) return;
    const {latitude,longitude,altitude,altitudeAccuracy,accuracy}=state.fix;
    const result=distanceAndBearing(latitude,longitude,state.target.lat,state.target.lon);
    const nm=result.metres/NM_METRES;
    $("distance").textContent=fmt(nm,1);
    $("bearing").textContent=`${String(norm360(roundTo2(result.bearing))).padStart(3,"0")}°T`;
    if(state.previousTime!==state.fix.timestamp) updateEta(result.metres,state.fix.timestamp);
    const fresh=Date.now()-state.fix.timestamp<15000;
    $("distance").dataset.confidence=!fresh||!Number.isFinite(accuracy)||accuracy>30?"poor":accuracy<=10?"good":"moderate";
    $("pointer").style.visibility=fresh&&Number.isFinite(state.track)&&result.metres>accuracy?"visible":"hidden";
    $("northPointer").style.visibility=fresh&&Number.isFinite(state.track)&&accuracy<=30?"visible":"hidden";
    $("northPointer").style.transform=`rotate(${-state.track}deg)`;
    $("pointer").style.transform=`rotate(${result.bearing-state.track}deg)`;
    $("gs").replaceChildren(Object.assign(document.createElement("span"),{textContent:"GS ",className:"gs-label"}),document.createTextNode(fresh&&Number.isFinite(state.speed)?`${(state.speed*1.943844).toFixed(0)} kt`:"— kt"));
    const following=route[active+1], arrow=$("secondaryArrow"); arrow.style.visibility=following&&nm<=0.5&&fresh&&Number.isFinite(state.track)&&accuracy<=30?"visible":"hidden"; $("nextTrack").style.visibility=arrow.style.visibility; if(following){const track=distanceAndBearing(state.target.lat,state.target.lon,following.lat,following.lon).bearing;$("nextTrack").textContent=`Next ${String(Math.round(track)%360).padStart(3,"0")}°T`;} if(following)arrow.style.transform=`rotate(${distanceAndBearing(latitude,longitude,following.lat,following.lon).bearing-state.track}deg)`;

    $("positionAccuracy").textContent=Number.isFinite(accuracy) ? `Horizontal ±${Math.round(accuracy)} m | Vertical ${Number.isFinite(altitudeAccuracy)?"±"+Math.round(altitudeAccuracy*FT_PER_METRE)+" ft":"unknown"}` : "Unknown";
    $("gpsAltitude").textContent=Number.isFinite(altitude) ? `${Math.round(altitude*FT_PER_METRE)} ft (GPS)` : "Unavailable";

    if (Number.isFinite(state.target.elevation) && Number.isFinite(altitude)) {
      const heightMetres=state.target.elevation/FT_PER_METRE-altitude;
      const heightFeet=heightMetres*FT_PER_METRE;
      const roundedHeight=Math.round(heightFeet/25)*25;
      $("heightDiff").textContent=`${roundedHeight>=0?"+":""}${roundedHeight.toLocaleString("en-GB")} ft`;
      const horizontal=Math.max(0.01,result.metres);
      const slope=Math.atan2(heightMetres,horizontal)*180/Math.PI;
      $("slope").textContent=`${slope>=0?"+":""}${slope.toFixed(1)}°`;

      // The browser may not expose vertical accuracy. A missing value is deliberately treated as poor.
      // Horizontal GPS error is also considered because it affects the slope calculation.
      let confidence="poor", note="Low confidence — GPS altitude/datum uncertain";
      if (Number.isFinite(altitudeAccuracy) && Number.isFinite(accuracy)) {
        const combined=Math.hypot(altitudeAccuracy,accuracy);
        if (combined <= 10) { confidence="good"; note=`Good sensor confidence (approx. ±${Math.round(combined)} m)`; }
        else if (combined <= 30) { confidence="moderate"; note=`Moderate sensor confidence (approx. ±${Math.round(combined)} m)`; }
        else { confidence="poor"; note=`Low sensor confidence (approx. ±${Math.round(combined)} m)`; }
      }
      setConfidence(fresh?confidence:"poor",fresh?note:"Stale GPS fix");
      $("heightDiff").classList.toggle("flash",fresh&&Math.abs(heightFeet)<Number($("flash").value));
      const prev=route[active-1], intermediate=active<route.length-1;
      let reference=null, profileAngle=null;
      const desiredAngle=clampAngle(routeAngle)??clampAngle(Number($("angle").value))??3.5;
      if(!intermediate){if(result.metres>0)reference=state.target.elevation+result.metres*FT_PER_METRE*Math.tan(desiredAngle*Math.PI/180);}
      else if(!prev){reference=state.target.elevation;profileAngle=0;}
      else if(prev&&Number.isFinite(prev.elevation)){
        const leg=distanceAndBearing(prev.lat,prev.lon,state.target.lat,state.target.lon);
        if(leg.metres>0)profileAngle=Math.atan2((prev.elevation-state.target.elevation)/FT_PER_METRE,leg.metres)*180/Math.PI;
        const pos=distanceAndBearing(prev.lat,prev.lon,latitude,longitude);
        const along=pos.metres*Math.cos((pos.bearing-leg.bearing)*Math.PI/180);
        if(leg.metres>0&&along>=-accuracy&&along<=leg.metres+accuracy)reference=prev.elevation+(state.target.elevation-prev.elevation)*Math.max(0,Math.min(1,along/leg.metres));
      }
      const delta=altitude*FT_PER_METRE-reference;
      const whites=intermediate?(delta>100?4:delta>50?3:delta>=0?2:delta>=-50?1:0):destinationWhites(-slope-desiredAngle);
      $("papi").classList.toggle("destination",!intermediate);
      $("papi").classList.toggle("intermediate",intermediate);
      $("papi").setAttribute("aria-label",intermediate?"Experimental intermediate altitude deviation lights":"Experimental destination angle lights");
      $("papi").replaceChildren(...Array.from({length:4},(_,i)=>{const e=document.createElement("span");e.textContent="●";e.style.color=i<whites?"white":intermediate?"#b69a38":"#ff5555";return e;}));
      const showLights=fresh&&confidence!=="poor"&&reference!==null;
      if(showLights){const label=document.createElement("span");label.className="angle-label";label.textContent=`${(intermediate?profileAngle:desiredAngle).toFixed(1)}°`;$("papi").append(label);}
      $("papi").style.visibility=showLights?"visible":"hidden";
      if(intermediate){
        const reason=!fresh?"stale GPS":prev&&!Number.isFinite(prev.elevation)?"previous altitude missing":!Number.isFinite(altitudeAccuracy)?"vertical accuracy unavailable":confidence==="poor"?"GPS accuracy insufficient":reference===null?"outside leg or zero-length leg":null;
        $("slopeNote").textContent=reason?`Profile lights hidden: ${reason}`:note+" | Experimental profile";
      }
    } else {
      $("slope").textContent="—";
      $("heightDiff").textContent="—";
      $("papi").style.visibility="hidden"; $("heightDiff").classList.remove("flash");
      setConfidence("none", Number.isFinite(state.target.elevation) ? "Phone altitude unavailable" : "Target elevation not supplied");
    }
  }

  function updateTargetSummary() {
    if (!state.target) {
      $("targetSummary").textContent="No target selected";
      $("targetMeta").textContent="Enter coordinates below";
      return;
    }
    $("targetSummary").textContent=state.target.name || `${state.target.lat.toFixed(5)}, ${state.target.lon.toFixed(5)}`;
    $("targetMeta").textContent=`${state.target.lat.toFixed(5)}, ${state.target.lon.toFixed(5)}${Number.isFinite(state.target.elevation) ? ` · ${state.target.elevation} ft AMSL` : " · elevation unknown"}`;
  }

  function saveTarget() {
    if (!state.target) localStorage.removeItem("trueVectorTarget");
    else localStorage.setItem("trueVectorTarget",JSON.stringify(state.target));
  }

  let route=[], active=0, points=[], saved={}, routeName="", routeAngle=null, savedAngles=Object.create(null);
  function clampAngle(v){return typeof v==="number"&&Number.isFinite(v)?Math.max(2.6,Math.min(6,v)):null;}
  function validAngle(v){return clampAngle(v)===v&&v!==null;}
  function destinationWhites(deltaDegrees){const minutes=deltaDegrees*60, eps=1e-9;return minutes>30+eps?4:minutes>10+eps?3:minutes>=-10-eps?2:minutes>=-30-eps?1:0;}
  function readRouteAngle(id){const raw=$(id).value.trim();if(!raw)return null;const v=clampAngle(Number(raw));if(v===null)throw Error("Enter a numeric glide angle");$(id).value=v;return v;}
  function persistAngles(){localStorage.setItem("tvRouteAngles",JSON.stringify(savedAngles));}
  let library=[], editing=null;
  const sameTarget=(a,b)=>a.name===b.name&&a.lat===b.lat&&a.lon===b.lon&&(a.elevation??null)===(b.elevation??null);
  function persistLibrary(){localStorage.setItem("tvLibrary",JSON.stringify(library));}
  function listLibrary(){for(const id of ["targetLibrary","dest","finalWp","initialWp","wp4","wp5"]){const el=$(id),old=el.value;el.replaceChildren(new Option(id==="targetLibrary"?"Choose a stored target":"Choose target / none", ""),...library.map((t,i)=>({t,i})).filter(({t,i})=>id!=="targetLibrary"||String(i)===old||nameOf(t).toLowerCase().includes($("targetSearch").value.toLowerCase())).sort((a,b)=>sortName(nameOf(a.t),nameOf(b.t))).map(({t,i})=>new Option(`${nameOf(t)} | ${t.elevation??"?"} ft | ${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}`,String(i))));el.value=old;}}
  function addLibrary(t){let i=library.findIndex(x=>sameTarget(x,t));if(i<0){library.push({...t});i=library.length-1;persistLibrary();}listLibrary();return i;}
  function chosen(){const v=$("targetLibrary").value;if(v===""||!library[Number(v)])throw Error("Choose a stored target first");return Number(v);}
  $("loadTarget").onclick=()=>attempt(()=>{editing=chosen();fill(library[editing]);$("updateStored").disabled=false;$("storeTarget").disabled=true;$("libraryStatus").textContent="Editing target. Save target changes when finished.";});
  $("newTarget").onclick=()=>{clearForm();$("targetName").focus();$("libraryStatus").textContent="Enter details and save new target.";};
  $("targetForm").onsubmit=e=>{e.preventDefault();attempt(()=>{if(editing!==null)throw Error("Use Save target changes");const t=formTarget();if(!t.name)throw Error("Enter a target name");const i=addLibrary(t);$("targetLibrary").value=String(i);$("libraryStatus").textContent="Target saved locally.";clearForm();});};
  $("updateStored").onclick=()=>attempt(()=>{if(editing===null)return;const t=formTarget();if(!t.name)throw Error("Enter a target name");if(!confirm("Update target? Saved routes retain their original details until edited."))return;library[editing]={...t};persistLibrary();listLibrary();clearForm();$("libraryStatus").textContent="Target updated.";});
  $("deleteTarget").onclick=()=>attempt(()=>{const i=chosen();if(!confirm("Delete "+nameOf(library[i])+" from library? Saved routes are unchanged."))return;library.splice(i,1);persistLibrary();clearForm();listLibrary();$("targetLibrary").value="";closeEditor();});
  $("useTarget").onclick=()=>attempt(()=>{const t=library[chosen()];breadcrumbs=[];route=[{...t}];active=0;routeName="";routeAngle=null;select();});
  function nameOf(t){return t.name||`${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}`;}
  function clearForm(){editing=null;$("updateStored").disabled=true;$("storeTarget").disabled=false;for(const id of ["targetName","latitude","longitude","targetElevation"])$(id).value="";}
  function parseCoord(value, limit) {
    let t=value.trim().toUpperCase(); if(!t) return NaN;
    const h=t.match(/[NSEW]/g)||[]; if(h.length>1||h.some(x=>limit===90?!/[NS]/.test(x):!/[EW]/.test(x))) return NaN;
    t=t.replace(/[NSEW]/g,"").trim().replace(/[°º'′"″:]/g," ").trim();
    if(!/^[+-]?\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){0,2}$/.test(t)) return NaN;
    const v=t.split(/\s+/).map(Number); if(v.slice(1).some(x=>x<0||x>=60))return NaN;
    if(h.length&&t.startsWith("-")&&/[NE]/.test(h[0]))return NaN;
    const n=(t.startsWith("-")||/[SW]/.test(h[0]||"")?-1:1)*(Math.abs(v[0])+(v[1]||0)/60+(v[2]||0)/3600);return Math.abs(n)<=limit?n:NaN;
  }
  function formTarget(){const lat=parseCoord($("latitude").value,90),lon=parseCoord($("longitude").value,180),t=$("targetElevation").value,elevation=t===""?null:Number(t);if(!Number.isFinite(lat)||!Number.isFinite(lon)||(t!==""&&!Number.isFinite(elevation)))throw Error("Invalid coordinates or altitude");return {name:$("targetName").value.trim(),lat:trunc5(lat),lon:trunc5(lon),elevation};}
  function fill(t){$("targetName").value=t.name||"";$("latitude").value=trunc5(t.lat);$("longitude").value=trunc5(t.lon);$("targetElevation").value=t.elevation??"";}
  function resetEta(){state.previousRange=null;state.previousTime=null;state.closingRates=[];}
  function select(){$("nextTrack").style.visibility="hidden";$("secondaryArrow").style.visibility="hidden";$("back").disabled=active===0;$("next").disabled=active+1>=route.length;state.target=route[active]||null;resetEta();updateTargetSummary();saveTarget();localStorage.setItem("tvRoute",JSON.stringify({route,active,routeName,routeAngle}));$("routeProgress").replaceChildren(...route.map((t,i)=>{const el=document.createElement("div");el.className=i===active?"active-leg":"inactive-leg";el.textContent=`${i===active?"▶ ":""}${i+1}. ${nameOf(t)}${Number.isFinite(t.elevation)?` · ${t.elevation} ft`:""}${i===route.length-1?" · Destination":""}`;return el;}));$("routeList").textContent=route.map((t,i)=>`${i===active?"▶ ":""}${i+1}. ${t.name||t.lat+", "+t.lon}`).join(" · ");if(state.target&&state.fix)render();}
  function attempt(fn){try{fn()}catch(e){alert(e.message)}}
  $("back").onclick=()=>{if(active>0){active--;select()}};
  $("routeSearch").oninput=listSaved;$("targetSearch").oninput=listLibrary;
  $("next").onclick=()=>{if(active+1<route.length){active++;select()}};
  function clearActive(){breadcrumbs=[];route=[];active=0;routeName="";routeAngle=null;select();for(const id of ["distance","bearing","slope","heightDiff","eta","etaNote"])$(id).textContent="—";$("nextTrack").style.visibility="hidden";$("northPointer").style.visibility=$("secondaryArrow").style.visibility=$("pointer").style.visibility=$("papi").style.visibility="hidden";$("heightDiff").classList.remove("flash");}
  $("clearTarget").onclick=clearActive;
  $("here").onclick=()=>attempt(()=>{if(!state.fix||Date.now()-state.fix.timestamp>15000)throw Error("Fresh GPS fix required");const name=prompt("Name this captured location (required)","");if(!name||!name.trim()||name.trim().toUpperCase()==="HERE")return;clearForm();fill({name:name.trim(),lat:state.fix.latitude,lon:state.fix.longitude,elevation:Number.isFinite(state.fix.altitude)?Math.round(state.fix.altitude*FT_PER_METRE):null});$("libraryStatus").textContent="Captured. Check details and save new target.";});
  $("importPoints").onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data)||!data.every(t=>typeof t.name==="string"&&Number.isFinite(t.lat)&&Math.abs(t.lat)<=90&&Number.isFinite(t.lon)&&Math.abs(t.lon)<=180))throw Error("Expected array of name, lat, lon records");points=data;localStorage.setItem("tvPoints",JSON.stringify(points));alert(`${points.length} points imported; verify cycle and coordinates.`)}catch(e){alert(e.message)}};
  $("findPoint").onclick=()=>attempt(()=>{const matches=points.filter(t=>t.name.toUpperCase()===$("lookup").value.trim().toUpperCase());if(matches.length!==1)throw Error(matches.length?"Ambiguous identifier; enter coordinates manually":"No matching imported waypoint");fill({...matches[0],elevation:null})});
  $("findWords").onclick=async()=>{try{const words=$("words").value.trim().replace(/^\/\/\//,"");if(!$("wkey").value)throw Error("API key required");const r=await fetch("https://api.what3words.com/v3/convert-to-coordinates?"+new URLSearchParams({words,key:$("wkey").value}));const d=await r.json();if(!r.ok||!d.coordinates)throw Error(d.error?.message||"Lookup failed");if(d.country!=="GB"&&!confirm(`Result country: ${d.country}. Use it?`))return;fill({name:words,lat:d.coordinates.lat,lon:d.coordinates.lng,elevation:null})}catch(e){alert(e.message)}};
  function previewRoute(){const r=saved[$("savedRoutes").value];$("savedPreview").textContent=r?r.map(t=>`${nameOf(t)} (${t.elevation??"?"} ft)`).join(" → ")+` | Final angle: ${savedAngles[$("savedRoutes").value]??"default"}${validAngle(savedAngles[$("savedRoutes").value])?"°":""}`:"No saved route selected";}
  $("savedRoutes").onchange=previewRoute;
  function listSaved(){const old=$("savedRoutes").value;$("savedRoutes").replaceChildren(new Option("Choose a saved route",""),...Object.keys(saved).filter(k=>k===old||k.toLowerCase().includes($("routeSearch").value.toLowerCase())).sort(sortName).map(k=>new Option(k,k)));$("savedRoutes").value=old;previewRoute();}
  let editingRoute=null;
  function closeEditor(){$("routeEditor").hidden=true;editingRoute=null;}
  function openEditor(key){editingRoute=key;const r=key===null?[]:saved[key];$("routeName").value=key??"";$("routeGlide").value=key===null?"":savedAngles[key]??"";for(const [id,t] of [["dest",r.at(-1)],["finalWp",r.at(-2)],["initialWp",r.at(-3)],["wp4",r.at(-4)],["wp5",r.at(-5)]])$(id).value=t?String(addLibrary(t)):"";$("routeEditor").hidden=false;}
  const routeSlots=["wp5","wp4","initialWp","finalWp","dest"];
  function removeRouteSlot(id){
    if($(id).value==="")return;
    const remaining=routeSlots.filter(k=>k!==id).map(k=>$(k).value).filter(v=>v!=="");
    routeSlots.forEach((k,i)=>$(k).value=remaining[i-(routeSlots.length-remaining.length)]??"");
  }
  for(const id of routeSlots)$("remove-"+id).onclick=()=>removeRouteSlot(id);
  $("newRoute").onclick=()=>openEditor(null);
  $("editRoute").onclick=()=>attempt(()=>{const k=$("savedRoutes").value;if(!saved[k])throw Error("Choose a saved route");openEditor(k);});
  $("cancelRoute").onclick=closeEditor;
  $("saveRoute").onclick=()=>attempt(()=>{if($("dest").value==="")throw Error("Choose a destination");const r=["wp5","wp4","initialWp","finalWp","dest"].map(id=>$(id).value).filter(v=>v!=="").map(v=>({...library[Number(v)]}));const k=$("routeName").value.trim()||nameOf(r.at(-1));const glide=readRouteAngle("routeGlide");if(k!==editingRoute&&saved[k]&&!confirm("Replace saved route "+k+"?"))return;if(editingRoute!==null&&editingRoute!==k){delete saved[editingRoute];delete savedAngles[editingRoute];}saved[k]=r;savedAngles[k]=glide;persistAngles();localStorage.setItem("tvSaved",JSON.stringify(saved));listSaved();$("savedRoutes").value=k;previewRoute();closeEditor();});
  $("deleteRoute").onclick=()=>attempt(()=>{const k=$("savedRoutes").value;if(!saved[k])throw Error("Choose a saved route");if(!confirm("Delete saved route "+k+"? Any active copy remains until cleared."))return;delete saved[k];delete savedAngles[k];persistAngles();localStorage.setItem("tvSaved",JSON.stringify(saved));listSaved();closeEditor();});
  $("recall").onclick=()=>attempt(()=>{const k=$("savedRoutes").value,r=saved[k];if(!r)throw Error("Choose a saved route");breadcrumbs=[];route=r.map(t=>({...t}));routeName=k;routeAngle=savedAngles[k]??null;active=0;select();});
  let pendingImport=null;
  function compactCoord(raw,limit){const m=raw.match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])$/i);if(!m||m[1].length!==(limit===90?2:3))throw Error("Invalid compact coordinate: "+raw);const n=parseCoord(`${m[1]} ${m[2]} ${m[3]}${m[4]}`,limit);if(!Number.isFinite(n))throw Error("Invalid coordinate: "+raw);return trunc5(n);}
  function parseRnp(text){const rows=[...text.matchAll(/(?:^|\s)([A-Z0-9]+)\s+(\d{3})\s+([A-Z]{2})\s+/g)];if(!rows.length||rows[0][2]!=="001")throw Error("Expected sequence 001 and path terminator");const targets=[],notes=[];for(let i=0;i<rows.length;i++){const m=rows[i],body=text.slice(m.index+m[0].length,rows[i+1]?.index??text.length).trim();if(Number(m[2])!==i+1)throw Error("Non-consecutive sequence");if(!["IF","TF"].includes(m[3])){notes.push(`${m[2]} ${m[3]} excluded: unsupported path terminator`);if(i!==rows.length-1)throw Error("Unsupported non-final leg");continue;}const c=body.match(/(\d{6}(?:\.\d+)?[NS])\s+(\d{7}(?:\.\d+)?[EW])/i);if(!c)throw Error("Missing coordinates at "+m[2]);const fields=body.slice(0,c.index).trim().split(/\s+/);const name=fields[0],level=fields.at(-2);if(!name||name==="-"||!/^(-|\d+)$/.test(level))throw Error("Unrecognised name or level at "+m[2]);targets.push({name,lat:compactCoord(c[1],90),lon:compactCoord(c[2],180),elevation:level==="-"?null:Number(level),path:m[3],sequence:m[2]});}if(!targets.length||targets.length>5)throw Error("Expected one to five coordinate targets");return {targets,notes};}
  function invalidateImport() {pendingImport=null;$("rnpSave").disabled=true;$("rnpReview").textContent="";}
  $("rnpText").oninput=$("rnpTitle").oninput=invalidateImport;
  $("rnpPreview").onclick=()=>{invalidateImport();attempt(()=>{const title=$("rnpTitle").value.trim();if(!title)throw Error("Enter route title");const {targets,notes}=parseRnp($("rnpText").value);pendingImport={title,targets};$("rnpReview").textContent=targets.map(t=>`${t.sequence} ${t.path} ${t.name} | ${t.lat}, ${t.lon} | ${t.elevation??"ALTITUDE UNKNOWN"}`).concat(notes,"Verify every coordinate and altitude. Plain text cannot preserve underlining or minimum constraints.").join("\n");$("rnpSave").disabled=false;});};
  $("rnpSave").onclick=()=>attempt(()=>{if(!pendingImport)return;const {title,targets}=pendingImport;if(!confirm("Save experimental route after checking source data?"))return;if(saved[title]&&!confirm("Replace "+title+"?"))return;const glide=readRouteAngle("rnpGlide");targets.forEach(addLibrary);saved[title]=targets;savedAngles[title]=glide;persistAngles();localStorage.setItem("tvSaved",JSON.stringify(saved));$("routeSearch").value="";listSaved();$("savedRoutes").value=title;previewRoute();invalidateImport();});
  let wake=null;async function keepAwake(){if(state.watchId===null||document.hidden)return;try{if(!wake||wake.released)wake=await navigator.wakeLock.request("screen");$("wakeStatus").textContent="Screen wake lock active"}catch(e){$("wakeStatus").textContent="Wake lock unavailable; check Auto-Lock settings"}}
  document.addEventListener("visibilitychange",keepAwake);
  function sequence(old){if(!old||active+1>=route.length||!state.target||!Number.isFinite(state.track))return;const t=state.target, a=distanceAndBearing(old.latitude,old.longitude,t.lat,t.lon),b=distanceAndBearing(state.fix.latitude,state.fix.longitude,t.lat,t.lon);const err=Math.max(old.accuracy,state.fix.accuracy);if(err>30||a.metres>Math.max(100,err*3)||b.metres<=a.metres)return;const diff=Math.abs(((b.bearing-state.track+540)%360)-180);if(diff>120){active++;select()}}
  function onPosition(position) {
    const c=position.coords; const old=state.fix;
    state.fix={latitude:c.latitude,longitude:c.longitude,altitude:c.altitude,altitudeAccuracy:c.altitudeAccuracy,accuracy:c.accuracy,timestamp:position.timestamp || Date.now()};
    state.speed=Number.isFinite(c.speed)?c.speed:null;state.track=state.speed>=2&&Number.isFinite(c.heading)&&c.accuracy<=30?c.heading:null;
    if(old&&c.accuracy<=30&&old.accuracy<=30){const d=distanceAndBearing(old.latitude,old.longitude,c.latitude,c.longitude),dt=(state.fix.timestamp-old.timestamp)/1000;if(dt>0&&dt<=20&&d.metres>Math.max(10,old.accuracy+c.accuracy)){if(state.speed===null)state.speed=d.metres/dt;if(state.track===null&&state.speed>=2)state.track=d.bearing;}}
    if(route.length&&c.accuracy<=30&&Date.now()-state.fix.timestamp<15000){const last=breadcrumbs.at(-1);if(!last||distanceAndBearing(last.latitude,last.longitude,c.latitude,c.longitude).metres>=Math.max(20,c.accuracy)){breadcrumbs.push({...state.fix});if(breadcrumbs.length>5000)breadcrumbs.shift();}}
    sequence(old);
    $("gpsStatus").textContent="GPS FIX RECEIVED";
    $("gpsStatus").style.color="var(--green)";
    if (state.target) render();
    else {
      $("positionAccuracy").textContent=Number.isFinite(c.accuracy)?`Horizontal ±${Math.round(c.accuracy)} m | Vertical ${Number.isFinite(c.altitudeAccuracy)?"±"+Math.round(c.altitudeAccuracy*FT_PER_METRE)+" ft":"unknown"}`:"Unknown";
      $("gpsAltitude").textContent=Number.isFinite(c.altitude)?`${Math.round(c.altitude*FT_PER_METRE)} ft (GPS)`:"Unavailable";
    }
  }

  function onGpsError(error) {
    const messages={1:"LOCATION PERMISSION DENIED",2:"POSITION UNAVAILABLE",3:"GPS TIMEOUT"};
    $("gpsStatus").textContent=messages[error.code] || "GPS ERROR";
    $("gpsStatus").style.color="var(--red)";
  }

  $("startGps").addEventListener("click", () => {
    if (!("geolocation" in navigator)) { $("gpsStatus").textContent="GPS NOT SUPPORTED"; return; }
    if (state.watchId !== null) return;
    $("gpsStatus").textContent="ACQUIRING GPS…";
    $("gpsStatus").style.color="var(--amber)";
    state.watchId=navigator.geolocation.watchPosition(onPosition,onGpsError,{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
    keepAwake(); $("startGps").disabled=true; $("stopGps").disabled=false;
  });

  $("stopGps").addEventListener("click", () => {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId=null; if(wake)wake.release(); $("wakeStatus").textContent="Screen wake lock released"; state.fix=null; $("heightDiff").classList.remove("flash"); $("nextTrack").style.visibility="hidden";$("northPointer").style.visibility=$("secondaryArrow").style.visibility=$("pointer").style.visibility=$("papi").style.visibility="hidden"; $("distance").dataset.confidence="poor"; setConfidence("poor","GPS paused"); $("gs").textContent="GS — kt"; $("startGps").disabled=false; $("stopGps").disabled=true;
    $("gpsStatus").textContent="GPS PAUSED"; $("gpsStatus").style.color="var(--muted)";
  });

  try {
    const saved=JSON.parse(localStorage.getItem("trueVectorTarget") || "null");
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
      state.target=saved;
      $("targetName").value=saved.name || "";
      $("latitude").value=saved.lat;
      $("longitude").value=saved.lon;
      $("targetElevation").value=saved.elevation ?? "";
      updateTargetSummary();
    }
  } catch (_) { localStorage.removeItem("trueVectorTarget"); }

  try {const r=JSON.parse(localStorage.getItem("tvRoute")||"null");route=r?.route|| (state.target?[state.target]:[]);active=r?.active||0;routeName=r?.routeName||"";routeAngle=clampAngle(r?.routeAngle);savedAngles=Object.assign(Object.create(null),JSON.parse(localStorage.getItem("tvRouteAngles")||"{}"));for(const k of Object.keys(savedAngles))savedAngles[k]=clampAngle(savedAngles[k]);persistAngles();points=JSON.parse(localStorage.getItem("tvPoints")||"[]");saved=Object.assign(Object.create(null),JSON.parse(localStorage.getItem("tvSaved")||"{}"));library=JSON.parse(localStorage.getItem("tvLibrary")||"[]");if(localStorage.getItem("tvLibrary")===null)for(const t of [...route,...Object.values(saved).flat()])addLibrary(t);listLibrary();listSaved();select();clearForm();}catch(e){$("libraryStatus").textContent="Could not restore local data: "+e.message;}
  setInterval(()=>{if(state.fix&&Date.now()-state.fix.timestamp>=15000){$("distance").dataset.confidence="poor";setConfidence("poor","Stale GPS fix");$("nextTrack").style.visibility="hidden";$("northPointer").style.visibility=$("secondaryArrow").style.visibility=$("pointer").style.visibility=$("papi").style.visibility="hidden";$("heightDiff").classList.remove("flash");$("gs").textContent="GS — kt";$("eta").textContent="--:--";}},1000);
  for(const id of ["angle","flash"]){const v=localStorage.getItem("tv-"+id);if(v!==null)$(id).value=v;if(id==="angle")$(id).value=clampAngle(Number($(id).value))??3.5;$(id).onchange=()=>{if(id==="angle")$(id).value=$(id).value.trim()?clampAngle(Number($(id).value))??3.5:3.5;localStorage.setItem("tv-"+id,$(id).value);if(state.fix)render()}}
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  // Hold-to-view: an orthographic, north-up schematic, not a terrain display.
  const viewButton=$("viewRoute"), viewPanel=$("routeView"), canvas=$("routeCanvas");
  let viewFrame=0, heldPointer=null, heldKey=null;
  function drawOverview(){
    if(viewPanel.hidden)return;
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(3,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const c=canvas.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    const text=(s,x,y,color="#dce7ef",size=12,align="left")=>{c.font=`${size}px system-ui,sans-serif`;c.fillStyle=color;c.textAlign=align;c.fillText(s,x,y);};
    const line=(a,b,color,width=1,dash=[])=>{c.beginPath();c.setLineDash(dash);c.strokeStyle=color;c.lineWidth=width;c.moveTo(...a);c.lineTo(...b);c.stroke();c.setLineDash([]);};
    text("ROUTE OVERVIEW · NORTH UP",16,30,"#dce7ef",14);
    const dest=route.at(-1);
    if(!dest){text("No active route or target",w/2,h/2,"#dce7ef",16,"center");return;}
    text((routeName||nameOf(dest)).slice(0,40),16,52,"#9cabb6",13);
    const fix=state.fix, fresh=fix&&Date.now()-fix.timestamp<15000;
    const datum=Number.isFinite(dest.elevation)?dest.elevation:null;
    const exaggeration=4;
    function point(lat,lon,alt){const q=distanceAndBearing(dest.lat,dest.lon,lat,lon),r=q.bearing*Math.PI/180;return {e:q.metres*Math.sin(r),n:q.metres*Math.cos(r),z:datum!==null&&Number.isFinite(alt)?(alt-datum)/FT_PER_METRE*exaggeration:null};}
    const pts=route.map(t=>point(t.lat,t.lon,t.elevation));
    const phone=fix&&Number.isFinite(fix.latitude)&&Number.isFinite(fix.longitude)?point(fix.latitude,fix.longitude,Number.isFinite(fix.altitude)?fix.altitude*FT_PER_METRE:null):null;
    const radius=10*NM_METRES,step=2*NM_METRES;
    const scale=Math.max(.000001,(w-16)/(8*NM_METRES));
    const cx=w/2,cy=h*.59;
    const project=(p,ground=false)=>[cx+p.e*scale,cy-(p.n*.55+(ground?0:p.z??0))*scale];
    const left=14,right=w-14,top=Math.min(h*.42,90+route.length*15),bottom=h-100;
    const inside=p=>{const a=project(p);return a[0]>=left&&a[0]<=right&&a[1]>=top&&a[1]<=bottom&&Math.hypot(p.e,p.n)<=radius;};
    const clipped=p=>{const a=project(p,true),dx=a[0]-cx,dy=a[1]-cy;const k=Math.min(1,radius/Math.max(1,Math.hypot(p.e,p.n)),dx>0?(right-cx)/dx:dx<0?(left-cx)/dx:Infinity,dy>0?(bottom-cy)/dy:dy<0?(top-cy)/dy:Infinity);return {e:p.e*k,n:p.n*k,z:null};};
    c.save();c.beginPath();c.rect(0,top,w,Math.max(0,bottom-top));c.clip();
    for(let r=step;r<=radius+.01;r+=step){c.beginPath();c.ellipse(cx,cy,r*scale,r*scale*.55,0,0,Math.PI*2);c.strokeStyle="#40505e";c.lineWidth=1;c.stroke();text(`${r/NM_METRES} NM`,cx+5,cy-r*scale*.55+12,"#9cabb6",10);}
    line([cx,top],[cx,bottom],"#40505e",1,[3,5]);line([0,cy],[w,cy],"#40505e",1,[3,5]);
    text("N",cx,top+12,"white",12,"center");text("S",cx,bottom-4,"#9cabb6",11,"center");text("W",5,cy-5,"#9cabb6",11);text("E",w-5,cy-5,"#9cabb6",11,"right");
    for(const f of breadcrumbs){const p=point(f.latitude,f.longitude,Number.isFinite(f.altitude)?f.altitude*FT_PER_METRE:null);if(inside(p)){c.beginPath();c.arc(...project(p),2,0,Math.PI*2);c.fillStyle="#b69a38";c.fill();}}
    // Clip each actual segment to the range circle, not merely its endpoints.
    function segment(a,b){const dx=b.e-a.e,dy=b.n-a.n,A=dx*dx+dy*dy,B=2*(a.e*dx+a.n*dy),C=a.e*a.e+a.n*a.n-radius*radius; if(!A)return inside(a)?[a,b]:null;const D=B*B-4*A*C;if(D<0)return null;const lo=Math.max(0,(-B-Math.sqrt(D))/(2*A)),hi=Math.min(1,(-B+Math.sqrt(D))/(2*A));if(lo>hi)return null;return [lo,hi].map(t=>({e:a.e+t*dx,n:a.n+t*dy,z:a.z!==null&&b.z!==null?a.z+t*(b.z-a.z):null}));}
    for(let i=1;i<pts.length;i++){const seg=segment(pts[i-1],pts[i]);if(!seg)continue;const color=i===active?"#ffffff":"#75cbe8";line(project(seg[0],true),project(seg[1],true),color,1.5,[4,4]);if(seg.every(p=>p.z!==null))line(project(seg[0]),project(seg[1]),color,2.5);}
    function edge(p,color){const a=project(clipped(p),true),dx=a[0]-cx,dy=a[1]-cy,ang=Math.atan2(dy,dx);c.beginPath();c.moveTo(a[0]+7*Math.cos(ang),a[1]+7*Math.sin(ang));for(const k of [-1,1])c.lineTo(a[0]-7*Math.cos(ang)+k*5*Math.sin(ang),a[1]-7*Math.sin(ang)-k*5*Math.cos(ang));c.closePath();c.fillStyle=color;c.fill();return a;}
    function marker(p,color,own=false){if(!inside(p))return edge(p,color);const a=project(p),g=project(p,true);if(p.z!==null)line(g,a,color,1,[3,3]);c.beginPath();if(own){c.moveTo(a[0],a[1]-7);c.lineTo(a[0]+7,a[1]);c.lineTo(a[0],a[1]+7);c.lineTo(a[0]-7,a[1]);c.closePath();}else c.arc(...a,5,0,Math.PI*2);c.fillStyle=color;c.fill();return a;}
    pts.forEach((p,i)=>{const color=i===active?"#ffffff":i===pts.length-1?"#75cbe8":"#a9bac6";const a=marker(p,color);text(String(i+1),a[0]+7,a[1]-6,color,11);});
    if(phone){const color=fresh?"#ffdb55":"#f07878",a=marker(phone,color,true);if(!inside(phone)){const label=`YOU ${(Math.hypot(phone.e,phone.n)/NM_METRES).toFixed(1)} NM${fresh?"":" STALE"}`;text(label,Math.max(75,Math.min(w-75,a[0])),Math.max(top+25,Math.min(bottom-12,a[1]+(a[1]<cy?18:-12))),color,12,"center");}else text("YOU",a[0]+9,a[1]-8,color,11);}
    c.restore();
    pts.forEach((p,i)=>text(`${i+1} ${nameOf(route[i]).slice(0,22)} · ${route[i].elevation??"?"} ft`,16,68+i*15,i===active?"white":"#a9bac6",11));
    text(`Vertical ×${exaggeration} · ${datum===null?"destination altitude unknown":"relative to destination"}`,16,h-84,"#9cabb6",11);
    text(!fix?"GPS unavailable — route only":!fresh?"STALE GPS — last known position":`GPS horizontal ±${Number.isFinite(fix.accuracy)?Math.round(fix.accuracy)+" m":"?"} · vertical ${Number.isFinite(fix.altitudeAccuracy)?"±"+Math.round(fix.altitudeAccuracy*FT_PER_METRE)+" ft":"unknown"}`,16,h-66,!fresh?"#f3c66b":"#9cabb6",11);
    text("Unknown heights shown on base plane · no terrain",16,h-48,"#9cabb6",11);
    text("BETA · NOT FOR FLIGHT NAVIGATION",16,h-30,"#f3c66b",11);
  }
  function viewLoop(){if(viewPanel.hidden)return;drawOverview();viewFrame=requestAnimationFrame(viewLoop);}
  function showView(){viewPanel.hidden=false;viewButton.setAttribute("aria-pressed","true");viewLoop();}
  function hideView(){heldPointer=null;heldKey=null;viewPanel.hidden=true;viewButton.setAttribute("aria-pressed","false");cancelAnimationFrame(viewFrame);}
  viewButton.addEventListener("pointerdown",e=>{if(!e.isPrimary||e.button!==0||!viewPanel.hidden)return;e.preventDefault();heldPointer=e.pointerId;viewButton.setPointerCapture(e.pointerId);showView();});
  viewButton.addEventListener("pointermove",e=>{if(e.pointerId!==heldPointer)return;const r=viewButton.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)hideView();});
  for(const event of ["pointerup","pointercancel","lostpointercapture"])viewButton.addEventListener(event,e=>{if(e.pointerId===heldPointer)hideView();});
  viewButton.addEventListener("contextmenu",e=>e.preventDefault());
  viewButton.addEventListener("keydown",e=>{if([" ","Enter"].includes(e.key)){e.preventDefault();if(viewPanel.hidden){heldKey=e.key;showView();}}});
  window.addEventListener("keyup",e=>{if(e.key===heldKey)hideView();});
  window.addEventListener("blur",hideView);window.addEventListener("pagehide",hideView);document.addEventListener("visibilitychange",()=>{if(document.hidden)hideView();});

  $("installHint").textContent = location.protocol === "file:" ? "For GPS and offline installation, publish on HTTPS (e.g. GitHub Pages)." : "Tip: use your browser menu → Add to Home Screen / Install.";
})();