// ---------------------------------------------------------------------------
// Confirmation-email landing page — one place to point it back at the app.
//
// APP_SCHEME: the app's custom URL scheme (see mobile/app.json → "scheme").
// This is the primary way "open Unravel" works — on a phone with the app
// installed, it jumps straight in.
//
// APP_URL: where to send someone if the scheme above doesn't open anything
// (app not installed, or on desktop). There is no deployed web app yet, so
// this is left blank on purpose — set it here the moment a real web app URL
// exists. Until then, the page tells people to open Unravel on their phone
// instead of navigating to a made-up address.
// ---------------------------------------------------------------------------
const APP_SCHEME = "unravel://";
const APP_URL = "";
