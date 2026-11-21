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
    $("bearing").textContent=`${String(roundTo2(result.bearing)).padStart(3,"0")}°T`;
    updateEta(result.metres,state.fix.timestamp);

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
      setConfidence(confidence,note);
    } else {
      $("slope").textContent="—";
      $("heightDiff").textContent="—";
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

  $("targetForm").addEventListener("submit", event => {
    event.preventDefault();
    const lat=Number($("latitude").value), lon=Number($("longitude").value);
    const elevText=$("targetElevation").value.trim();
    const elevation=elevText==="" ? null : Number(elevText);
    if (!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lon)||lon < -180||lon > 180) {
      alert("Enter a valid latitude (−90 to 90) and longitude (−180 to 180)."); return;
    }
    if (elevText!=="" && !Number.isFinite(elevation)) { alert("Enter a valid target elevation in feet AMSL, or leave it blank."); return; }
    state.target={name:$("targetName").value.trim(),lat,lon,elevation};
    state.previousRange=null; state.previousTime=null; state.closingRates=[];
    saveTarget(); updateTargetSummary();
    if (state.fix) render();
  });

  $("clearTarget").addEventListener("click", () => {
    state.target=null; state.previousRange=null; state.previousTime=null; state.closingRates=[];
    saveTarget(); updateTargetSummary();
    $("distance").textContent="—.—"; $("bearing").textContent="——°T";
    $("slope").textContent="—"; $("heightDiff").textContent="—"; $("eta").textContent="--:--";
    setConfidence("none","Target elevation required");
  });

  function onPosition(position) {
    const c=position.coords;
    state.fix={latitude:c.latitude,longitude:c.longitude,altitude:c.altitude,altitudeAccuracy:c.altitudeAccuracy,accuracy:c.accuracy,timestamp:position.timestamp || Date.now()};
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
    $("startGps").disabled=true; $("stopGps").disabled=false;
  });

  $("stopGps").addEventListener("click", () => {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId=null; $("startGps").disabled=false; $("stopGps").disabled=true;
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

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  $("installHint").textContent = location.protocol === "file:" ? "For GPS and offline installation, publish on HTTPS (e.g. GitHub Pages)." : "Tip: use your browser menu → Add to Home Screen / Install.";
})();