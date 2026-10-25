// Accounts in the browser: sign in, register, sign out, password and sessions.
import { escapeHtml } from "./html.js";
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

function setAuthMode(value) {
    if (MODES.includes(value)) mode = value;
    notice = "";
}

const MODES = ["login", "register", "forgot", "reset", "verify"];

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

export function renderAuth(container) {
    if (mode === "verify") return renderVerify(container);
    if (user) {
        container.innerHTML = `<h3>${t("Mi cuenta")}</h3>${
            notice ? `<p class="gl pnl auth-notice" role="status">${h(notice)}</p>` : ""
        }<div class="gl pnl"><p>${t("Sesión iniciada como {name} ({email}).", {
            name: `<b>${h(user.display_name)}</b>`,
            email: h(user.email)
        })}</p><p><button class="btn s" data-go="Perfil">${t("Ir a mi perfil")}</button> <button class="ghost" data-auth-logout>${t(
            "Cerrar sesión"
        )}</button></p></div>`;
        return;
    }
    const login = mode === "login";
    const register = mode === "register";
    const form = { login: loginForm, register: registerForm, forgot: forgotForm, reset: resetForm }[mode];
    container.innerHTML = `<div class="auth"><div class="auth-tabs" role="tablist"><button role="tab" aria-selected="${login}" data-auth-mode="login">${t(
        "Iniciar sesión"
    )}</button><button role="tab" aria-selected="${register}" data-auth-mode="register">${t("Crear cuenta")}</button></div>${
        notice ? `<p class="gl pnl auth-notice" role="status">${h(notice)}</p>` : ""
    }${form()}<p class="warn" role="alert" data-auth-error hidden></p></div>`;
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

function forgotForm() {
    return `<form class="gl pnl fm-stack" id="auth-forgot" novalidate><b>${t("Recuperar la contraseña")}</b><label>${t(
        "Correo de tu cuenta"
    )}<input id="auth-email" type="email" autocomplete="email" required maxlength="254"></label><button class="btn" type="submit">${t(
        "Enviar enlace"
    )}</button><small>${t("Te enviaremos un enlace para elegir una contraseña nueva.")}</small></form>`;
}

function resetForm() {
    return `<form class="gl pnl fm-stack" id="auth-reset" novalidate><b>${t("Elige una contraseña nueva")}</b><label>${t(
        "Contraseña nueva"
    )}<input id="auth-password" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label><button class="btn" type="submit">${t(
        "Guardar contraseña"
    )}</button><small>${t("Al guardarla se cierran todas tus sesiones abiertas.")}</small></form>`;
}

function loginForm() {
    return `<form class="gl pnl fm-stack" id="auth-login" novalidate><label>${t(
        "Correo"
    )}<input id="auth-email" type="email" autocomplete="email" required maxlength="254"></label><label>${t(
        "Contraseña"
    )}<input id="auth-password" type="password" autocomplete="current-password" required maxlength="200"></label><label class="check"><input id="auth-remember" type="checkbox"> ${t(
        "Mantener la sesión iniciada en este equipo"
    )}</label><button class="btn" type="submit">${t("Iniciar sesión")}</button><button class="lk" type="button" data-auth-mode="forgot">${t(
        "¿Olvidaste tu contraseña?"
    )}</button></form>`;
}

function registerForm() {
    return `<form class="gl pnl fm-stack" id="auth-register" novalidate><label>${t(
        "Nombre visible"
    )}<input id="auth-name" autocomplete="nickname" required minlength="2" maxlength="60"></label><label>${t(
        "Correo"
    )}<input id="auth-email" type="email" autocomplete="email" required maxlength="254"></label><label>${t(
        "Contraseña"
    )}<input id="auth-password" type="password" autocomplete="new-password" required minlength="10" maxlength="200" aria-describedby="auth-password-help"></label><small id="auth-password-help">${t(
        "Al menos 10 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar."
    )}</small><label class="check"><input id="auth-adult" type="checkbox" required> ${t(
        "Tengo 18 años o más"
    )}</label><label class="check"><input id="auth-terms" type="checkbox" required> ${t(
        "Acepto los {terms} y la {privacy}",
        {
            terms: `<a href="/terminos" target="_blank">${t("términos y condiciones")}</a>`,
            privacy: `<a href="/privacidad" target="_blank">${t("política de privacidad")}</a>`
        }
    )}</label><button class="btn" type="submit">${t("Crear cuenta")}</button></form>`;
}

// ---- "Seguridad": password and open sessions ---------------------------------

export async function renderSecurity(container) {
    if (!user) {
        container.innerHTML = `<h3>${t("Seguridad e inicio de sesión")}</h3><div class="gl pnl"><p>${t(
            "Inicia sesión para ver tus sesiones y cambiar la contraseña."
        )}</p><p><button class="btn s" data-go="Acceso" data-auth-mode="login">${t("Iniciar sesión")}</button></p></div>`;
        return;
    }
    const unverified = user.email_verified
        ? ""
        : `<section class="gl pnl"><b>${t("Confirma tu correo")}</b><p>${h(
              t("Te enviamos un enlace a {email}. Si no lo encuentras, revisa el correo no deseado.", { email: user.email })
          )}</p><button class="ghost" data-auth-resend>${t("Enviar el enlace otra vez")}</button></section>`;
    container.innerHTML = `<h3>${t("Seguridad e inicio de sesión")}</h3>${unverified}<form class="gl pnl fm-stack" id="auth-password-form" novalidate><b>${t(
        "Cambiar contraseña"
    )}</b><label>${t("Contraseña actual")}<input id="auth-current" type="password" autocomplete="current-password" required></label><label>${t(
        "Contraseña nueva"
    )}<input id="auth-new" type="password" autocomplete="new-password" required minlength="10"></label><button class="btn s" type="submit">${t(
        "Cambiar contraseña"
    )}</button><small>${t(
        "Al cambiarla se cierran las sesiones abiertas en otros equipos."
    )}</small><p class="warn" role="alert" data-auth-error hidden></p></form><section class="gl pnl" id="auth-sessions"><b>${t(
        "Sesiones abiertas"
    )}</b><p class="catalog-status">${t("Cargando…")}</p></section>${dataHtml()}`;
    try {
        const sessions = await call("/sessions");
        const slot = container.querySelector("#auth-sessions");
        if (!slot) return;
        slot.innerHTML = `<b>${t("Sesiones abiertas")}</b><ul class="auth-session-list">${sessions
            .map(
                (item) =>
                    `<li><span>${h(browserName(item.user_agent))}${
                        item.current ? ` <small>(${t("esta")})</small>` : ""
                    }</span><small>${h(
                        t("Última actividad: {date}", { date: new Date(item.last_seen_at).toLocaleString(locale) })
                    )}</small></li>`
            )
            .join("")}</ul>${
            sessions.length > 1
                ? `<button class="ghost" data-auth-end-others>${t("Cerrar las demás sesiones")}</button>`
                : ""
        }`;
    } catch (error) {
        container.querySelector("#auth-sessions").innerHTML = `<b>${t("Sesiones abiertas")}</b><p class="warn">${h(
            error.message
        )}</p>`;
    }
}

// "Tus datos": a copy of everything the account holds, and deleting it for
// good (backend/app/api/account.py). The password is asked again to delete.
function dataHtml() {
    return `<section class="gl pnl fm-stack"><b>${t("Tus datos")}</b><p>${t(
        "Descarga una copia de todo lo que tu cuenta guarda: perfil, preferencias, listas de deseados y sesiones."
    )}</p><p><a class="ghost" href="/api/v1/account/export" download>${t("Descargar mis datos")}</a></p></section><form class="gl pnl fm-stack danger" id="auth-delete-form" novalidate><b>${t(
        "Borrar mi cuenta"
    )}</b><p>${t(
        "Se borran tu cuenta, tu perfil, tus preferencias, tus listas de deseados y tus sesiones. No se puede deshacer."
    )}</p><label>${t("Contraseña actual")}<input id="auth-delete-password" type="password" autocomplete="current-password" required></label><label class="check"><input id="auth-delete-confirm" type="checkbox" required> ${t(
        "Entiendo que se borra todo y no se puede recuperar"
    )}</label><button class="ghost" type="submit">${t("Borrar mi cuenta para siempre")}</button><p class="warn" role="alert" data-auth-error hidden></p></form>`;
}

function browserName(agent) {
    if (!agent) return t("Navegador desconocido");
    const name = /Edg\//.test(agent)
        ? "Edge"
        : /Firefox\//.test(agent)
          ? "Firefox"
          : /Chrome\//.test(agent)
            ? "Chrome"
            : /Safari\//.test(agent)
              ? "Safari"
              : t("Navegador");
    const system = /Android/.test(agent)
        ? "Android"
        : /iPhone|iPad/.test(agent)
          ? "iOS"
          : /Windows/.test(agent)
            ? "Windows"
            : /Mac OS/.test(agent)
              ? "macOS"
              : /Linux/.test(agent)
                ? "Linux"
                : "";
    return system ? t("{browser} en {system}", { browser: name, system }) : name;
}

// ---- Events ------------------------------------------------------------------

// Errors show inside the panel of the form that failed.
function showError(message, form) {
    const slot = (form?.querySelector("[data-auth-error]") ? form : form?.closest(".auth, #secv"))?.querySelector(
        "[data-auth-error]"
    );
    if (!slot) return window.toast?.(message);
    slot.textContent = message;
    slot.hidden = false;
}

const value = (id) => document.getElementById(id)?.value.trim() ?? "";

export function installAuth({ panel, go }) {
    // Once the page knows who is signed in, account panels on screen are redrawn.
    document.addEventListener("cm:account", () => {
        if (window.tab === "Seguridad") renderSecurity(panel("Seguridad"));
        if (window.tab === "Acceso" && mode !== "verify" && mode !== "reset") renderAuth(panel("Acceso"));
    });
    document.addEventListener("submit", async (event) => {
        const form = event.target;
        if (
            ![
                "auth-login",
                "auth-register",
                "auth-forgot",
                "auth-reset",
                "auth-password-form",
                "auth-delete-form"
            ].includes(form.id)
        )
            return;
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        try {
            if (form.id === "auth-login") {
                user = await call("/login", {
                    method: "POST",
                    body: {
                        email: value("auth-email"),
                        password: document.getElementById("auth-password").value,
                        remember: document.getElementById("auth-remember").checked
                    }
                });
                window.toast?.(t("Hola, {name}", { name: user.display_name }));
                changed();
                go("Inicio");
            } else if (form.id === "auth-forgot") {
                const answer = await call("/password-reset/request", {
                    method: "POST",
                    body: { email: value("auth-email") }
                });
                mode = "login";
                notice = t(answer.message);
                renderAuth(panel("Acceso"));
            } else if (form.id === "auth-reset") {
                await call("/password-reset", {
                    method: "POST",
                    body: { token: linkToken, new_password: document.getElementById("auth-password").value }
                });
                linkToken = "";
                user = null;
                changed();
                mode = "login";
                notice = t("Contraseña cambiada. Inicia sesión con la nueva.");
                renderAuth(panel("Acceso"));
            } else if (form.id === "auth-register") {
                if (!document.getElementById("auth-adult").checked)
                    return showError(t("Para crear una cuenta debes tener 18 años o más."), form);
                if (!document.getElementById("auth-terms").checked)
                    return showError(t("Debes aceptar los términos y condiciones."), form);
                user = await call("/register", {
                    method: "POST",
                    body: {
                        display_name: value("auth-name"),
                        email: value("auth-email"),
                        password: document.getElementById("auth-password").value,
                        accept_terms: true,
                        confirm_adult: true
                    }
                });
                window.toast?.(t("Cuenta creada"));
                track("cuenta:registro");
                changed();
                go("Perfil");
            } else if (form.id === "auth-delete-form") {
                if (!document.getElementById("auth-delete-confirm").checked)
                    return showError(t("Marca la casilla para confirmar que quieres borrar la cuenta."), form);
                await request("/api/v1/account/delete", {
                    method: "POST",
                    body: { password: document.getElementById("auth-delete-password").value }
                });
                user = null;
                changed();
                window.toast?.(t("Tu cuenta y tus datos se borraron"));
                go("Inicio");
            } else {
                await call("/password", {
                    method: "POST",
                    body: {
                        current_password: document.getElementById("auth-current").value,
                        new_password: document.getElementById("auth-new").value
                    }
                });
                window.toast?.(t("Contraseña cambiada"));
                renderSecurity(panel("Seguridad"));
            }
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
