// The site's languages: Spanish, Portuguese and English, in that order.
//
// The server picks the visitor's language (backend/app/core/languages.py),
// writes it in <html lang> and adds that language's dictionary
// (frontend/i18n/pt.js or en.js) after this file. Texts are written in Spanish
// in the code and go through t(), which returns the dictionary's version:
//     t("Carrito")                          → "Carrinho"
//     t("Página {page} de {pages}", { page: 2, pages: 9 })
// A text missing from the dictionary stays in Spanish.
//
// It is a classic script, loaded in <head>, so the demo store (also a classic
// script) and the modules (frontend/js/lang.js) share it.
(function () {
    var LOCALES = { es: "es", pt: "pt-BR", en: "en" };
    var lang = (document.documentElement.lang || "es").slice(0, 2);
    if (!LOCALES[lang]) lang = "es";
    var dictionary = {};

    window.I18N = {
        lang: lang,
        // For dates and numbers (Intl).
        locale: LOCALES[lang],
        languages: [
            ["es", "Español"],
            ["pt", "Português"],
            ["en", "English"]
        ],
        add: function (entries) {
            for (var key in entries) dictionary[key] = entries[key];
        },
        // The choice is kept for a year; the page reloads in the new language.
        choose: function (code) {
            if (!LOCALES[code]) return;
            document.cookie = "cm_lang=" + code + "; path=/; max-age=31536000; samesite=lax";
            var url = new URL(location.href);
            url.searchParams.delete("lang");
            location.replace(url);
        }
    };

    // Language selectors (header and footer) show the current one and switch.
    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll(".lang-select").forEach(function (select) {
            select.value = lang;
            select.addEventListener("change", function () {
                window.I18N.choose(select.value);
            });
        });
    });

    window.t = function (text, values) {
        var translated = Object.prototype.hasOwnProperty.call(dictionary, text) ? dictionary[text] : text;
        if (!values) return translated;
        return translated.replace(/\{(\w+)\}/g, function (match, name) {
            return name in values ? values[name] : match;
        });
    };
})();
