(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const NM_METRES = 1852;
  const FT_PER_METRE = 3.280839895;
  const state = { target:null, watchId:null, fix:null, previousRange:null, previousTime:null, closingRates:[], lastEta:null };

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
      $("etaNote").textContent=`Closing at ${(median*1.943844).toFixed(1)} kt`;
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
    $("pointer").style.transform=`rotate(${result.bearing-state.track}deg)`;
    $("gs").textContent=fresh&&Number.isFinite(state.speed)?`GS ${(state.speed*1.943844).toFixed(0)} kt`:"GS — kt";

    $("positionAccuracy").textContent=Number.isFinite(accuracy) ? `±${Math.round(accuracy)} m` : "Unknown";
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
      const angle=Number($("angle").value), intermediate=active<route.length-1, delta=intermediate?-heightFeet/100:-slope-angle;
      const whites=delta>0.5?4:delta>0.2?3:delta< -0.5?0:delta< -0.2?1:2;
      $("papi").setAttribute("aria-label",intermediate?"Experimental altitude deviation lights":"Simulated geometric slope lights");
      $("papi").replaceChildren(...Array.from({length:4},(_,i)=>{const e=document.createElement("span");e.textContent="●";e.style.color=i<whites?"white":"#ff5555";return e;}));
      $("papi").style.visibility=fresh&&confidence!=="poor"&&(intermediate||(heightFeet<0&&result.metres>accuracy&&angle>=1&&angle<=10))?"visible":"hidden";
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

  let route=[], active=0, points=[], saved={}, routeName="";
  function nameOf(t){return t.name||`${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}`;}
  function clearForm(){for(const id of ["targetName","latitude","longitude","targetElevation"])$(id).value="";}
  function autoSave(){if(!route.length)return;routeName=nameOf(route[route.length-1]);saved[routeName]=route.map(t=>({...t}));localStorage.setItem("tvSaved",JSON.stringify(saved));listSaved();$("savedRoutes").value=routeName;}
  function parseCoord(value, limit) {
    let t=value.trim().toUpperCase(); if(!t) return NaN;
    const h=t.match(/[NSEW]/g)||[]; if(h.length>1||h.some(x=>limit===90?!/[NS]/.test(x):!/[EW]/.test(x))) return NaN;
    t=t.replace(/[NSEW]/g,"").trim().replace(/[°º'′"″:]/g," ").trim();
    if(!/^[+-]?\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){0,2}$/.test(t)) return NaN;
    const v=t.split(/\s+/).map(Number); if(v.slice(1).some(x=>x<0||x>=60))return NaN;
    if(h.length&&t.startsWith("-")&&/[NE]/.test(h[0]))return NaN;
    const n=(t.startsWith("-")||/[SW]/.test(h[0]||"")?-1:1)*(Math.abs(v[0])+(v[1]||0)/60+(v[2]||0)/3600);return Math.abs(n)<=limit?n:NaN;
  }
  function formTarget(){const lat=parseCoord($("latitude").value,90),lon=parseCoord($("longitude").value,180),t=$("targetElevation").value,elevation=t===""?null:Number(t);if(!Number.isFinite(lat)||!Number.isFinite(lon)||(t!==""&&!Number.isFinite(elevation)))throw Error("Invalid coordinates or altitude");return {name:$("targetName").value.trim(),lat,lon,elevation};}
  function fill(t){$("targetName").value=t.name||"";$("latitude").value=t.lat;$("longitude").value=t.lon;$("targetElevation").value=t.elevation??"";}
  function resetEta(){state.previousRange=null;state.previousTime=null;state.closingRates=[];}
  function select(){state.target=route[active]||null;resetEta();updateTargetSummary();saveTarget();localStorage.setItem("tvRoute",JSON.stringify({route,active}));$("routeProgress").replaceChildren(...route.map((t,i)=>{const el=document.createElement("div");el.className=i===active?"active-leg":"inactive-leg";el.textContent=`${i===active?"▶ ":""}${i+1}. ${nameOf(t)}${Number.isFinite(t.elevation)?` · ${t.elevation} ft`:""}${i===route.length-1?" · Destination":""}`;return el;}));$("routeList").textContent=route.map((t,i)=>`${i===active?"▶ ":""}${i+1}. ${t.name||t.lat+", "+t.lon}`).join(" · ");if(state.target&&state.fix)render();}
  function attempt(fn){try{fn()}catch(e){alert(e.message)}}
  $("targetForm").onsubmit=e=>{e.preventDefault();attempt(()=>{const t=formTarget();if(route.length&&!confirm("Start a new route? The existing saved route will remain."))return;route=[t];active=0;select();autoSave();clearForm()})};
  $("append").onclick=()=>attempt(()=>{if(!route.length)throw Error("Save the destination first");if(route.length>=3)throw Error("Maximum three targets");route.unshift(formTarget());active=0;select();autoSave();clearForm()});
  $("next").onclick=()=>{if(active+1<route.length){active++;select()}};
  $("clearTarget").onclick=()=>{route=[];active=0;select();for(const id of ["distance","bearing","slope","heightDiff","eta","etaNote"])$(id).textContent="—";$("pointer").style.visibility=$("papi").style.visibility="hidden";$("heightDiff").classList.remove("flash")};
  $("here").onclick=()=>attempt(()=>{if(!state.fix||Date.now()-state.fix.timestamp>15000)throw Error("Fresh GPS fix required");fill({name:"HERE",lat:state.fix.latitude,lon:state.fix.longitude,elevation:Number.isFinite(state.fix.altitude)?Math.round(state.fix.altitude*FT_PER_METRE):null});});
  $("importPoints").onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data)||!data.every(t=>typeof t.name==="string"&&Number.isFinite(t.lat)&&Math.abs(t.lat)<=90&&Number.isFinite(t.lon)&&Math.abs(t.lon)<=180))throw Error("Expected array of name, lat, lon records");points=data;localStorage.setItem("tvPoints",JSON.stringify(points));alert(`${points.length} points imported; verify cycle and coordinates.`)}catch(e){alert(e.message)}};
  $("findPoint").onclick=()=>attempt(()=>{const matches=points.filter(t=>t.name.toUpperCase()===$("lookup").value.trim().toUpperCase());if(matches.length!==1)throw Error(matches.length?"Ambiguous identifier; enter coordinates manually":"No matching imported waypoint");fill({...matches[0],elevation:null})});
  $("findWords").onclick=async()=>{try{const words=$("words").value.trim().replace(/^\/\/\//,"");if(!$("wkey").value)throw Error("API key required");const r=await fetch("https://api.what3words.com/v3/convert-to-coordinates?"+new URLSearchParams({words,key:$("wkey").value}));const d=await r.json();if(!r.ok||!d.coordinates)throw Error(d.error?.message||"Lookup failed");if(d.country!=="GB"&&!confirm(`Result country: ${d.country}. Use it?`))return;fill({name:words,lat:d.coordinates.lat,lon:d.coordinates.lng,elevation:null})}catch(e){alert(e.message)}};
  function listSaved(){$("savedRoutes").replaceChildren(...Object.keys(saved).map(k=>new Option(k,k)))}
  $("remember").onclick=()=>{if(!route.length)return;const name=prompt("Route name");if(name){saved[name]=route.map(t=>({...t}));localStorage.setItem("tvSaved",JSON.stringify(saved));listSaved()}};
  $("recall").onclick=()=>{const r=saved[$("savedRoutes").value];if(r){route=r.map(t=>({...t}));active=0;select();clearForm()}};
  let wake=null;async function keepAwake(){if(state.watchId===null||document.hidden)return;try{if(!wake||wake.released)wake=await navigator.wakeLock.request("screen");$("wakeStatus").textContent="Screen wake lock active"}catch(e){$("wakeStatus").textContent="Wake lock unavailable; check Auto-Lock settings"}}
  document.addEventListener("visibilitychange",keepAwake);
  function sequence(old){if(!old||active+1>=route.length||!state.target||!Number.isFinite(state.track))return;const t=state.target, a=distanceAndBearing(old.latitude,old.longitude,t.lat,t.lon),b=distanceAndBearing(state.fix.latitude,state.fix.longitude,t.lat,t.lon);const err=Math.max(old.accuracy,state.fix.accuracy);if(err>30||a.metres>Math.max(100,err*3)||b.metres<=a.metres)return;const diff=Math.abs(((b.bearing-state.track+540)%360)-180);if(diff>120){active++;select()}}
  function onPosition(position) {
    const c=position.coords; const old=state.fix;
    state.fix={latitude:c.latitude,longitude:c.longitude,altitude:c.altitude,altitudeAccuracy:c.altitudeAccuracy,accuracy:c.accuracy,timestamp:position.timestamp || Date.now()};
    state.speed=Number.isFinite(c.speed)?c.speed:null;state.track=state.speed>=2&&Number.isFinite(c.heading)&&c.accuracy<=30?c.heading:null;
    if(old&&c.accuracy<=30&&old.accuracy<=30){const d=distanceAndBearing(old.latitude,old.longitude,c.latitude,c.longitude),dt=(state.fix.timestamp-old.timestamp)/1000;if(dt>0&&dt<=20&&d.metres>Math.max(10,old.accuracy+c.accuracy)){if(state.speed===null)state.speed=d.metres/dt;if(state.track===null&&state.speed>=2)state.track=d.bearing;}}
    sequence(old);
    $("gpsStatus").textContent="GPS FIX RECEIVED";
    $("gpsStatus").style.color="var(--green)";
    if (state.target) render();
    else {
      $("positionAccuracy").textContent=Number.isFinite(c.accuracy)?`±${Math.round(c.accuracy)} m`:"Unknown";
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
    state.watchId=null; if(wake)wake.release(); $("wakeStatus").textContent="Screen wake lock released"; state.fix=null; $("heightDiff").classList.remove("flash"); $("pointer").style.visibility=$("papi").style.visibility="hidden"; $("distance").dataset.confidence="poor"; setConfidence("poor","GPS paused"); $("gs").textContent="GS — kt"; $("startGps").disabled=false; $("stopGps").disabled=true;
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

  try {const r=JSON.parse(localStorage.getItem("tvRoute")||"null");route=r?.route|| (state.target?[state.target]:[]);active=r?.active||0;points=JSON.parse(localStorage.getItem("tvPoints")||"[]");saved=Object.assign(Object.create(null),JSON.parse(localStorage.getItem("tvSaved")||"{}"));listSaved();select();clearForm();}catch(e){}
  setInterval(()=>{if(state.fix&&Date.now()-state.fix.timestamp>=15000){$("distance").dataset.confidence="poor";setConfidence("poor","Stale GPS fix");$("pointer").style.visibility=$("papi").style.visibility="hidden";$("heightDiff").classList.remove("flash");$("gs").textContent="GS — kt";$("eta").textContent="--:--";}},1000);
  for(const id of ["angle","flash"]){const v=localStorage.getItem("tv-"+id);if(v!==null)$(id).value=v;$(id).onchange=()=>{localStorage.setItem("tv-"+id,$(id).value);if(state.fix)render()}}
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  $("installHint").textContent = location.protocol === "file:" ? "For GPS and offline installation, publish on HTTPS (e.g. GitHub Pages)." : "Tip: use your browser menu → Add to Home Screen / Install.";
})();