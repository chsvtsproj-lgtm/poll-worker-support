// Paste the Web app URL from your Google Apps Script deployment between the quotes.
// It looks like https://script.google.com/macros/s/AKfy.../exec
window.API_URL = "https://script.google.com/macros/s/AKfycbxVIKBEYd7aAaOQw1BopDlfEWA_86YW9R20O6gVVBq-HsXgOzaqecLnZ18Fj2bf3_fX/exec";
// Optional Cloudflare Worker relay for networks that block Google script addresses.
// It looks like https://poll-worker-relay.<subdomain>.workers.dev
// When set, the pages use ONLY this URL (no fallback to API_URL). Leave empty to use API_URL.
// The relay origin must also be listed in connect-src in index.html and admin/index.html
// (worker/apply-relay-url.sh does all of this).
window.RELAY_URL = "https://poll-worker-relay.chsvotes-support.workers.dev";
