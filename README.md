# True Vector v2.0 Lite — BETA / UNTESTED
Replace the existing GitHub Pages files with the contents of this folder. Open over HTTPS and reload after the service worker updates. Start GPS. This is experimental, not for flight navigation or approach guidance.

Target form: enter coordinates (decimal or D:M:S with hemisphere), altitude in feet, then Set target. Add next target appends up to three. HERE fills the form from a fresh fix; confirm with Set or Add. Remember route stores a named route locally on this browser/device; Recall restores it. Browser storage can be cleared. Next manually overrides experimental automatic sequencing, which requires a close pass and movement away; it may miss a waypoint or advance incorrectly.

UK waypoint lookup requires a user-supplied verified AIRAC export converted to JSON array of records with name, lat, lon (decimal degrees). No AIRAC data is bundled and no automatic cycle updates are implemented. Duplicate names are rejected. Enter altitude manually. Do not use unverified coordinates.

what3words lookup requires internet and your own API key, entered each session. The key is sent directly to what3words and not stored by this app; browser-side keys are not secret. Exact addresses are globally unique; non-GB results require confirmation. Provider access/CORS and API plan have not been tested.

Track arrow is relative to GPS course over ground, not phone orientation; it is hidden without sufficient movement. GS is speed over ground; closing speed is range rate. Wake lock depends on browser support and foreground visibility. PAPI-like lights are a geometric simulation, not runway PAPI guidance; GPS altitude datum and uncertainty can make them wrong. Default angle 3.5 degrees, flash threshold 400 ft absolute height difference. Settings are saved locally. Red indicates low confidence, not a certified integrity estimate.

Validation: JavaScript syntax checked only. No device, live GPS, API, flight or browser integration tests performed. Do not rely on this software for safety-critical use.
