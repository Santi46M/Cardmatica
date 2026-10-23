// Per-browser preferences only. Storage can be blocked or cleared, so every
// access is guarded and callers render correctly with the fallback value.
export function readJson(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

export function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function newId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Amounts are stored in the currency they were paid in; window.eur() formats a
// euro amount in the currency selected in the header with its illustrative rates.
export function money(amount, currency) {
    const rate = (window.CUR || []).find((entry) => entry[0] === currency)?.[2];
    const value = Number(amount);
    if (!rate || !Number.isFinite(value)) return `${amount} ${currency}`;
    return window.eur(value / rate);
}

export function toEuro(amount, currency) {
    const rate = (window.CUR || []).find((entry) => entry[0] === currency)?.[2];
    return rate ? Number(amount) / rate : null;
}

export function formatDate(value) {
    // "2026-10-19" is a calendar date: parse it as local, not as UTC midnight,
    // or it shows the previous day in the Americas.
    let date = new Date(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        date = new Date(year, month - 1, day);
    }
    return date.toLocaleDateString("es", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}
