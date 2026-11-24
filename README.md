# True Vector v2.0 Lite — BETA / UNTESTED
Replace the existing GitHub Pages files with the contents of this folder. Open over HTTPS and reload after the service worker updates. Start GPS. This is experimental, not for flight navigation or approach guidance.

Target form: enter coordinates (decimal or D:M:S with hemisphere), altitude in feet, then Set target. Add next target appends up to three. HERE fills the form from a fresh fix; confirm with Set or Add. Remember route stores a named route locally on this browser/device; Recall restores it. Browser storage can be cleared. Next manually overrides experimental automatic sequencing, which requires a close pass and movement away; it may miss a waypoint or advance incorrectly.

UK waypoint lookup requires a user-supplied verified AIRAC export converted to JSON array of records with name, lat, lon (decimal degrees). No AIRAC data is bundled and no automatic cycle updates are implemented. Duplicate names are rejected. Enter altitude manually. Do not use unverified coordinates.

what3words lookup requires internet and your own API key, entered each session. The key is sent directly to what3words and not stored by this app; browser-side keys are not secret. Exact addresses are globally unique; non-GB results require confirmation. Provider access/CORS and API plan have not been tested.

Track arrow is relative to GPS course over ground, not phone orientation; it is hidden without sufficient movement. GS is speed over ground; closing speed is range rate. Wake lock depends on browser support and foreground visibility. PAPI-like lights are a geometric simulation, not runway PAPI guidance; GPS altitude datum and uncertainty can make them wrong. Default angle 3.5 degrees, flash threshold 400 ft absolute height difference. Settings are saved locally. Red indicates low confidence, not a certified integrity estimate.

Validation: JavaScript syntax checked only. No device, live GPS, API, flight or browser integration tests performed. Do not rely on this software for safety-critical use.

## v2.1 Lite Beta
Enter and save the destination first, then enter each preceding waypoint and tap Add next target. Entries are cleared after saving. Travel order is the reverse of entry order. Routes are automatically stored by destination name; the same name replaces the saved route. Recall restarts at the initial waypoint. The active route and leg persist in local browser storage, subject to browser retention. Existing v2.0 routes retain their travel order. Intermediate lights are experimental altitude-deviation indicators, not slope guidance: two white/two red within 20 ft of the entered altitude, three of one colour up to 50 ft, four beyond that. Destination lights retain the geometric slope setting. GPS altitude datum and accuracy limitations apply. Not for operational aviation use.

## v2.2 Lite Beta
Stored targets are imported from existing local routes on first launch. Select a target and Load / inspect to view full stored coordinates and altitude. Save target to library creates a reusable record; Update loaded target changes only the library record, not existing route snapshots. To use a revised target in a route, rebuild the route destination first, then preceding waypoints. Choose a saved route, review its travel order and activate it to restart at the first leg. Targets and routes persist in local storage on the same origin/device, subject to browser retention. GS, GPS altitude and true bearing enlarged. No live device or flight validation.

## V3.3 Lite
Separate Routes and Targets panels. Create or edit a route using stored targets, save it, then Use route to activate. Clear active route does not delete saved data. Delete saved route removes only the saved copy. Targets can be created, edited, used directly or deleted. HERE requires a name before populating the form; verify and save it. Routes retain independent target snapshots; edit a route to adopt updated targets. Editing a route can restore its historical target snapshots to the library. Existing local storage keys are retained. Beta: not flight navigation or approach guidance.
