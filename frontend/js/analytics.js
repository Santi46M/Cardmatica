// Anonymous usage counts: which pages are seen and a few actions, per day.
// No cookies and nothing that identifies the person (backend/app/api/analytics.py).
// A browser that asks not to be tracked (Do Not Track or Global Privacy
// Control) sends nothing.

const ENDPOINT = "/api/v1/analytics/event";
const optedOut = navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
let lastPage = "";

export function track(key) {
    if (optedOut) return;
    const body = new Blob([JSON.stringify({ key })], { type: "application/json" });
    // sendBeacon does not delay the page; fetch is the fallback.
    if (!navigator.sendBeacon?.(ENDPOINT, body))
        fetch(ENDPOINT, { method: "POST", body, keepalive: true }).catch(() => {});
}

// A page view, counted once per change (redrawing the same tab is not a new view).
export function trackPage(key) {
    if (key === lastPage) return;
    lastPage = key;
    track(key);
}
