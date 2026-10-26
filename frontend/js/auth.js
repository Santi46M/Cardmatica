// Accounts in the browser: sign in, register, sign out, password and sessions.
import { escapeHtml, html } from "./html.js";
import { locale, t } from "./lang.js";
import { track } from "./analytics.js";
import { hasSession, request } from "./session-api.js";

const h = escapeHtml;
const BASE = "/api/v1/auth";

let user = null;
// Which form the Acceso panel shows: login, register, forgot (ask for a reset
// link), reset (choose a new password) or verify (confirming the address).
let mode = "login";
// The token from an email link (/verificar or /restablecer), used once.
let linkToken = "";
// A message shown above the form after a step finishes ("check your email").
let notice = "";

export const currentUser = () => user;

const call = (path, options) => request(`${BASE}${path}`, options);

function changed() {
    document.dispatchEvent(new CustomEvent("cm:account", { detail: user }));
}

// Asks the server who is signed in (on page load and after confirming an email).
// Panels redraw only when the answer changes, so a form being filled is kept.
export async function loadAccount() {
    const before = JSON.stringify(user);
    try {
        user = hasSession() ? await call("/me") : null;
    } catch {
        user = null;
    }
    if (JSON.stringify(user) !== before) changed();
}

const MODES = ["login", "register", "forgot", "reset", "verify"];

function setAuthMode(value) {
    if (MODES.includes(value)) mode = value;
    notice = "";
}

// Called when the page opens from an email link: /verificar?token=… or
// /restablecer?token=…. The token leaves the address bar right away.
export function openAccountLink(path) {
    const kind = { "/verificar": "verify", "/restablecer": "reset" }[path];
    const token = new URLSearchParams(location.search).get("token");
    if (!kind || !token) return false;
    mode = kind;
    linkToken = token;
    return true;
}

// ---- "Acceso": sign in or create an account ---------------------------------

const noticeHtml = () => (notice ? `<p class="gl pnl auth-notice" role="status">${h(notice)}</p>` : "");

export function renderAuth(container) {
    if (mode === "verify") return renderVerify(container);
    if (user) {
        const signedIn = t("Sesión iniciada como {name} ({email}).", {
            name: `<b>${h(user.display_name)}</b>`,
            email: h(user.email)
        });
        container.innerHTML = html`
            <h3>${t("Mi cuenta")}</h3>
            ${noticeHtml()}
            <div class="gl pnl">
                <p>${signedIn}</p>
                <p><button class="btn s" data-go="Perfil">${t("Ir a mi perfil")}</button> <button class="ghost" data-auth-logout>${t("Cerrar sesión")}</button></p>
            </div>`;
        return;
    }
    const form = { login: loginForm, register: registerForm, forgot: forgotForm, reset: resetForm }[mode];
    container.innerHTML = html`
        <div class="auth">
            <div class="auth-tabs" role="tablist">
                <button role="tab" aria-selected="${mode === "login"}" data-auth-mode="login">${t("Iniciar sesión")}</button>
                <button role="tab" aria-selected="${mode === "register"}" data-auth-mode="register">${t("Crear cuenta")}</button>
            </div>
            ${noticeHtml()}
            ${form()}
            <p class="warn" role="alert" data-auth-error hidden></p>
        </div>`;
}

async function renderVerify(container) {
    // The token is used once, even if the panel is drawn again meanwhile.
    const token = linkToken;
    linkToken = "";
    mode = "login";
    container.innerHTML = `<div class="auth"><p class="gl pnl" role="status">${t("Confirmando tu correo…")}</p></div>`;
    try {
        await call("/confirm-email", { method: "POST", body: { token } });
        notice = t("Correo confirmado. ¡Gracias!");
        // The page may have asked who is signed in before the confirmation landed.
        await loadAccount();
    } catch (error) {
        notice = error.message;
    }
    renderAuth(container);
}

// The same fields appear in several forms.
const emailField = (label) =>
    `<label>${t(label)}<input id="auth-email" type="email" autocomplete="email" required maxlength="254"></label>`;
const checkbox = (id, label) => `<label class="check"><input id="${id}" type="checkbox" required> ${label}</label>`;

function forgotForm() {
    return html`
        <form class="gl pnl fm-stack" id="auth-forgot" novalidate>
            <b>${t("Recuperar la contraseña")}</b>
            ${emailField("Correo de tu cuenta")}
            <button class="btn" type="submit">${t("Enviar enlace")}</button>
            <small>${t("Te enviaremos un enlace para elegir una contraseña nueva.")}</small>
        </form>`;
}

function resetForm() {
    return html`
        <form class="gl pnl fm-stack" id="auth-reset" novalidate>
            <b>${t("Elige una contraseña nueva")}</b>
            <label>${t("Contraseña nueva")}<input id="auth-password" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label>
            <button class="btn" type="submit">${t("Guardar contraseña")}</button>
            <small>${t("Al guardarla se cierran todas tus sesiones abiertas.")}</small>
        </form>`;
}

function loginForm() {
    return html`
        <form class="gl pnl fm-stack" id="auth-login" novalidate>
            ${emailField("Correo")}
            <label>${t("Contraseña")}<input id="auth-password" type="password" autocomplete="current-password" required maxlength="200"></label>
            <label class="check"><input id="auth-remember" type="checkbox"> ${t("Mantener la sesión iniciada en este equipo")}</label>
            <button class="btn" type="submit">${t("Iniciar sesión")}</button>
            <button class="lk" type="button" data-auth-mode="forgot">${t("¿Olvidaste tu contraseña?")}</button>
        </form>`;
}

function registerForm() {
    const terms = t("Acepto los {terms} y la {privacy}", {
        terms: `<a href="/terminos" target="_blank">${t("términos y condiciones")}</a>`,
        privacy: `<a href="/privacidad" target="_blank">${t("política de privacidad")}</a>`
    });
    const passwordHelp = t("Al menos 10 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.");
    return html`
        <form class="gl pnl fm-stack" id="auth-register" novalidate>
            <label>${t("Nombre visible")}<input id="auth-name" autocomplete="nickname" required minlength="2" maxlength="60"></label>
            ${emailField("Correo")}
            <label>${t("Contraseña")}<input id="auth-password" type="password" autocomplete="new-password" required minlength="10" maxlength="200" aria-describedby="auth-password-help"></label>
            <small id="auth-password-help">${passwordHelp}</small>
            ${checkbox("auth-adult", t("Tengo 18 años o más"))}
            ${checkbox("auth-terms", terms)}
            <button class="btn" type="submit">${t("Crear cuenta")}</button>
        </form>`;
}

// ---- "Seguridad": password and open sessions ---------------------------------

export async function renderSecurity(container) {
    const title = `<h3>${t("Seguridad e inicio de sesión")}</h3>`;
    if (!user) {
        container.innerHTML = html`
            ${title}
            <div class="gl pnl">
                <p>${t("Inicia sesión para ver tus sesiones y cambiar la contraseña.")}</p>
                <p><button class="btn s" data-go="Acceso" data-auth-mode="login">${t("Iniciar sesión")}</button></p>
            </div>`;
        return;
    }
    const sent = h(t("Te enviamos un enlace a {email}. Si no lo encuentras, revisa el correo no deseado.", { email: user.email }));
    const unverified = user.email_verified
        ? ""
        : html`
            <section class="gl pnl">
                <b>${t("Confirma tu correo")}</b>
                <p>${sent}</p>
                <button class="ghost" data-auth-resend>${t("Enviar el enlace otra vez")}</button>
            </section>`;
    container.innerHTML = html`
        ${title}
        ${unverified}
        <form class="gl pnl fm-stack" id="auth-password-form" novalidate>
            <b>${t("Cambiar contraseña")}</b>
            <label>${t("Contraseña actual")}<input id="auth-current" type="password" autocomplete="current-password" required></label>
            <label>${t("Contraseña nueva")}<input id="auth-new" type="password" autocomplete="new-password" required minlength="10"></label>
            <button class="btn s" type="submit">${t("Cambiar contraseña")}</button>
            <small>${t("Al cambiarla se cierran las sesiones abiertas en otros equipos.")}</small>
            <p class="warn" role="alert" data-auth-error hidden></p>
        </form>
        <section class="gl pnl" id="auth-sessions">
            <b>${t("Sesiones abiertas")}</b>
            <p class="catalog-status">${t("Cargando…")}</p>
        </section>
        ${dataHtml()}`;
    const slot = () => container.querySelector("#auth-sessions");
    try {
        const sessions = await call("/sessions");
        if (slot()) slot().innerHTML = sessionsHtml(sessions);
    } catch (error) {
        slot().innerHTML = `<b>${t("Sesiones abiertas")}</b><p class="warn">${h(error.message)}</p>`;
    }
}

function sessionsHtml(sessions) {
    const items = sessions
        .map((item) => {
            const current = item.current ? ` <small>(${t("esta")})</small>` : "";
            const seen = t("Última actividad: {date}", { date: new Date(item.last_seen_at).toLocaleString(locale) });
            return `<li><span>${h(browserName(item.user_agent))}${current}</span><small>${h(seen)}</small></li>`;
        })
        .join("");
    const endOthers =
        sessions.length > 1 ? `<button class="ghost" data-auth-end-others>${t("Cerrar las demás sesiones")}</button>` : "";
    return `<b>${t("Sesiones abiertas")}</b><ul class="auth-session-list">${items}</ul>${endOthers}`;
}

// "Tus datos": a copy of everything the account holds, and deleting it for
// good (backend/app/api/account.py). The password is asked again to delete.
function dataHtml() {
    return html`
        <section class="gl pnl fm-stack">
            <b>${t("Tus datos")}</b>
            <p>${t("Descarga una copia de todo lo que tu cuenta guarda: perfil, preferencias, listas de deseados y sesiones.")}</p>
            <p><a class="ghost" href="/api/v1/account/export" download>${t("Descargar mis datos")}</a></p>
        </section>
        <form class="gl pnl fm-stack danger" id="auth-delete-form" novalidate>
            <b>${t("Borrar mi cuenta")}</b>
            <p>${t("Se borran tu cuenta, tu perfil, tus preferencias, tus listas de deseados y tus sesiones. No se puede deshacer.")}</p>
            <label>${t("Contraseña actual")}<input id="auth-delete-password" type="password" autocomplete="current-password" required></label>
            ${checkbox("auth-delete-confirm", t("Entiendo que se borra todo y no se puede recuperar"))}
            <button class="ghost" type="submit">${t("Borrar mi cuenta para siempre")}</button>
            <p class="warn" role="alert" data-auth-error hidden></p>
        </form>`;
}

// The first pattern that matches names the browser, then the system.
const BROWSERS = [
    [/Edg\//, "Edge"],
    [/Firefox\//, "Firefox"],
    [/Chrome\//, "Chrome"],
    [/Safari\//, "Safari"]
];
const SYSTEMS = [
    [/Android/, "Android"],
    [/iPhone|iPad/, "iOS"],
    [/Windows/, "Windows"],
    [/Mac OS/, "macOS"],
    [/Linux/, "Linux"]
];

function browserName(agent) {
    if (!agent) return t("Navegador desconocido");
    const found = (list) => list.find(([pattern]) => pattern.test(agent))?.[1];
    const name = found(BROWSERS) || t("Navegador");
    const system = found(SYSTEMS);
    return system ? t("{browser} en {system}", { browser: name, system }) : name;
}

// ---- Events ------------------------------------------------------------------

// Errors show inside the panel of the form that failed.
function showError(message, form) {
    const owner = form?.querySelector("[data-auth-error]") ? form : form?.closest(".auth, #secv");
    const slot = owner?.querySelector("[data-auth-error]");
    if (!slot) return window.toast?.(message);
    slot.textContent = message;
    slot.hidden = false;
}

const value = (id) => document.getElementById(id)?.value.trim() ?? "";
const password = (id) => document.getElementById(id).value;
const checked = (id) => document.getElementById(id).checked;

// What each account form does when sent. `panel` and `go` come from installAuth.
function formActions(panel, go) {
    return {
        "auth-login": async () => {
            user = await call("/login", {
                method: "POST",
                body: { email: value("auth-email"), password: password("auth-password"), remember: checked("auth-remember") }
            });
            window.toast?.(t("Hola, {name}", { name: user.display_name }));
            changed();
            go("Inicio");
        },
        "auth-forgot": async () => {
            const answer = await call("/password-reset/request", { method: "POST", body: { email: value("auth-email") } });
            mode = "login";
            notice = t(answer.message);
            renderAuth(panel("Acceso"));
        },
        "auth-reset": async () => {
            await call("/password-reset", {
                method: "POST",
                body: { token: linkToken, new_password: password("auth-password") }
            });
            linkToken = "";
            user = null;
            changed();
            mode = "login";
            notice = t("Contraseña cambiada. Inicia sesión con la nueva.");
            renderAuth(panel("Acceso"));
        },
        "auth-register": async (form) => {
            if (!checked("auth-adult")) return showError(t("Para crear una cuenta debes tener 18 años o más."), form);
            if (!checked("auth-terms")) return showError(t("Debes aceptar los términos y condiciones."), form);
            user = await call("/register", {
                method: "POST",
                body: {
                    display_name: value("auth-name"),
                    email: value("auth-email"),
                    password: password("auth-password"),
                    accept_terms: true,
                    confirm_adult: true
                }
            });
            window.toast?.(t("Cuenta creada"));
            track("cuenta:registro");
            changed();
            go("Perfil");
        },
        "auth-delete-form": async (form) => {
            if (!checked("auth-delete-confirm"))
                return showError(t("Marca la casilla para confirmar que quieres borrar la cuenta."), form);
            await request("/api/v1/account/delete", { method: "POST", body: { password: password("auth-delete-password") } });
            user = null;
            changed();
            window.toast?.(t("Tu cuenta y tus datos se borraron"));
            go("Inicio");
        },
        "auth-password-form": async () => {
            await call("/password", {
                method: "POST",
                body: { current_password: password("auth-current"), new_password: password("auth-new") }
            });
            window.toast?.(t("Contraseña cambiada"));
            renderSecurity(panel("Seguridad"));
        }
    };
}

export function installAuth({ panel, go }) {
    // Once the page knows who is signed in, account panels on screen are redrawn.
    document.addEventListener("cm:account", () => {
        if (window.tab === "Seguridad") renderSecurity(panel("Seguridad"));
        if (window.tab === "Acceso" && mode !== "verify" && mode !== "reset") renderAuth(panel("Acceso"));
    });
    const actions = formActions(panel, go);
    document.addEventListener("submit", async (event) => {
        const form = event.target;
        const action = actions[form.id];
        if (!action) return;
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        try {
            await action(form);
        } catch (error) {
            showError(error.message, form);
        } finally {
            button.disabled = false;
        }
    });
    // Capture phase: the mode is set before the store's router opens the panel
    // for a button that also carries data-go (the account menu entries).
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target.closest("[data-auth-mode]");
            if (!target) return;
            setAuthMode(target.dataset.authMode);
            // The tabs inside the Acceso panel switch the form in place.
            const container = panel("Acceso");
            if (container && !target.dataset.go) renderAuth(container);
        },
        true
    );
    document.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-auth-logout], [data-auth-end-others], [data-auth-resend]");
        if (!target) return;
        try {
            if (target.hasAttribute("data-auth-resend")) {
                await call("/confirm-email/request", { method: "POST" });
                window.toast?.(t("Te enviamos el enlace a {email}", { email: user.email }));
            } else if (target.hasAttribute("data-auth-logout")) {
                await call("/logout", { method: "POST" });
                user = null;
                window.toast?.(t("Sesión cerrada"));
                changed();
                go("Inicio");
            } else {
                const result = await call("/sessions/end-others", { method: "POST" });
                window.toast?.(
                    t(result.ended === 1 ? "Se cerró {count} sesión" : "Se cerraron {count} sesiones", { count: result.ended })
                );
                renderSecurity(panel("Seguridad"));
            }
        } catch (error) {
            window.toast?.(error.message);
        }
    });
}
