# True Vector

A first-stage, installable web app for iPhone and Android. It calculates horizontal great-circle distance, initial true bearing, indicative slope/height difference, and ETA based on measured reduction in range.

## Current prototype features

- Manual target entry: decimal latitude/longitude and optional elevation in feet AMSL.
- Live device position using the browser Geolocation API.
- Distance in nautical miles to one decimal place.
- Initial true bearing rounded to the nearest 2 degrees.
- Slope and height difference when both target elevation and phone GPS altitude are available.
- Slope/height confidence colour based on reported GPS altitude accuracy and horizontal position accuracy.
- ETA from a rolling median of measured range-closing rates; it does not assume the phone is travelling directly at the target.
- Target saved locally on the device.
- PWA manifest and service worker for installation and basic offline app-shell use.

## Important limitations in this first prototype

1. **Altitude datum:** browser GPS altitude is generally referenced to the WGS‑84 ellipsoid. A published aerodrome elevation is normally AMSL/orthometric. Without a geoid correction model, comparing these directly can introduce a systematic error. The slope and height display is therefore explicitly indicative. Do not use it for operational flight decisions.
2. **Sensor confidence:** many browsers do not expose `altitudeAccuracy`. When it is absent, the app deliberately shows dim red/poor confidence rather than implying a reliable vertical solution.
3. **Barometer:** standard browser APIs do not provide a cross-platform barometric-altitude reading. The option is not enabled in this version.
4. **Aerodata:** the UK aerodrome and navigation-aid database, name/identifier lookup, and automatic 100 NM refresh are not yet included. This version is the manual-coordinate prototype.
5. **ETA:** needs several valid GPS fixes showing consistent range reduction. It is an estimate based on recent closing rate, not a route prediction. It will show `--:--` when stationary, diverging, or insufficient data is available.
6. **Offline:** the app shell and saved target are cached locally after first successful visit. GPS still requires the device's location services; mobile data is not required once the app is installed and cached.

## Run locally

For layout testing, opening `index.html` directly is possible, but browser GPS and service workers generally require HTTPS or localhost.

A simple local server can be used for development:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` on the development computer. For phone testing, deploy to HTTPS (GitHub Pages is suitable).

## Publish with GitHub Pages

1. Create a new GitHub repository, e.g. `true-vector`.
2. Upload all files in this folder to the repository root.
3. In repository **Settings → Pages**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish the HTTPS site.
6. Open the published address in Safari (iPhone) or Chrome (Android).
7. Allow location access, then use the browser's Share/menu option to **Add to Home Screen** or **Install app**.
8. Open the installed app once while online so the service worker can cache the app shell.

## Testing checklist

- Verify manual coordinate validation at the latitude/longitude limits.
- Compare distance and bearing against a trusted geodesic calculator.
- Check bearing wrap-around near north (359°/001°).
- Confirm target persists after closing and reopening the app.
- Confirm GPS continues to provide fixes with mobile data disabled (GPS reception and location permission must remain enabled).
- Confirm ETA appears only after several stable closing-rate samples.
- Check behaviour while stationary, moving across the target, and moving away.
- Check slope confidence when `altitudeAccuracy` is missing, poor, and good.
- Test iOS Safari and Android Chrome separately.

## Safety

This is an experimental informational tool, not certified aviation equipment. It is not suitable as a primary or backup means of navigation. GPS altitude, browser sensor reporting, datum conversions, and phone performance can all be inaccurate. Always use approved aeronautical sources and equipment for flight operations.
