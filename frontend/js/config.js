// Tunable values of the interface, in one place, with the reason for each.

export const CATALOG = {
    // Cards per page in the catalogue and in a card's list of printings.
    pageSize: 24,
    // Cards shown on the home page.
    homeSize: 8,
    // Wait this long after the last keystroke before searching.
    searchDelayMs: 250,
    // Answers faster than this skip the loading placeholders, so they never flash.
    skeletonDelayMs: 120,
    // Price history loaded with a card: everything recorded, filtered on screen.
    historyDays: 3650
};

export const API_CACHE = {
    // Identical requests within this time reuse the previous answer.
    ttlMs: 30000,
    // Oldest answers are dropped beyond this many.
    maxEntries: 100
};

export const HOVER_PREVIEW = {
    // Hover this long before the card preview appears.
    delayMs: 250,
    // Distance between the pointer and the preview, and from the window edge.
    offsetPx: 24,
    marginPx: 12
};

// The "back to top" button appears after one screen, or this much on tall screens.
export const BACK_TO_TOP_PX = 600;

export const WANTLIST = {
    maxQuantity: 99,
    // Price alerts check at most this many cards per visit.
    maxAlertChecks: 30
};

// Konami has not announced the next lists. The OCG regulation has changed every
// quarter (1 Jan, 1 Apr, 1 Jul, 1 Oct), so its next date is shown as an estimate.
// Update these when a list is announced; null means "no date announced".
export const NEXT_BANLIST = {
    OCG: {
        date: "2027-01-01T00:00:00+09:00",
        note: "Estimado según el calendario trimestral de la OCG. Konami suele anunciarla unas semanas antes."
    },
    TCG: null
};
