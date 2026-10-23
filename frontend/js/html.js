// Every value placed inside an HTML string goes through escapeHtml, so card
// names, seller names or anything typed by a person can never inject markup.
export function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
    );
}
