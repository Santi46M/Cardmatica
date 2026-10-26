// Prices and dates as people read them, in the visitor's language.
//
// Amounts are stored in the currency they were paid in. window.CURRENCIES and
// window.formatPrice() come from frontend/demo/store.js: formatPrice() shows a
// euro amount in the currency chosen in the header, with illustrative rates.

function euroRate(currency) {
    return (window.CURRENCIES || []).find((entry) => entry.code === currency)?.perEuro;
}

export function toEuro(amount, currency) {
    const rate = euroRate(currency);
    return rate ? Number(amount) / rate : null;
}

export function money(amount, currency) {
    const euros = toEuro(amount, currency);
    return euros === null || !Number.isFinite(euros) ? `${amount} ${currency}` : window.formatPrice(euros);
}

export function formatDate(value) {
    // "2026-10-19" is a calendar date: read it as local, not as UTC midnight,
    // or it shows the previous day in the Americas.
    let date = new Date(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        date = new Date(year, month - 1, day);
    }
    return date.toLocaleDateString(window.I18N.locale, { day: "numeric", month: "short", year: "numeric" });
}
