// Every value placed inside an HTML string goes through escapeHtml, so card
// names, seller names or anything typed by a person can never inject markup.
export function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
    );
}

// Templates are written as indented HTML, one element per line, so they read
// like the page they build. `html` joins them back as the browser expects: each
// line break and the indentation after it are dropped, so nothing changes on
// screen. A space that must stay between two words goes before the line break.
export function html(strings, ...values) {
    return strings.reduce(
        (out, text, index) => out + text.replace(/\n\s*/g, "") + (index < values.length ? `${values[index]}` : ""),
        ""
    );
}
