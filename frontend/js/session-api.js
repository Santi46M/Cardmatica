// Requests made on behalf of the signed-in person (accounts and their data).
//
// The session cookie is HttpOnly; every request that changes something also
// sends the cm_csrf cookie's value in X-CSRF-Token (backend/app/api/auth.py).

function csrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)cm_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
}

// Both cookies are set and removed together; without cm_csrf nobody is signed
// in here, and there is no need to ask the server.
export function hasSession() {
    return Boolean(csrfToken());
}

export async function request(path, { method = "GET", body } = {}) {
    const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(method !== "GET" ? { "X-CSRF-Token": csrfToken() } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 204) return null;
    let data = null;
    try {
        data = await response.json();
    } catch {
        /* An empty or broken answer is reported below. */
    }
    if (!response.ok) {
        const detail = data?.error?.details?.[0]?.message;
        const error = new Error(
            data?.error?.message === "Parámetros inválidos" && detail
                ? detail.replace(/^Value error, /, "")
                : data?.error?.message || "No se pudo completar la operación."
        );
        error.status = response.status;
        throw error;
    }
    return data;
}
