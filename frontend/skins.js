// Apariencias secretas: two skins on top of the site's own aero look,
// Skeuomorfismo (felt, stitched leather, wood and brass) and Frutiger Metro
// (flat colour tiles, square corners, thin letters). Light and dark mode still
// work with each one (frontend/theme.js).
//
// They are hidden on purpose. The picker opens with the Konami code
// (↑ ↑ ↓ ↓ ← → ← → B A) or with five quick taps on the last line of the footer,
// the one about Konami and the other brands.
//
// A classic script in <head>, right after theme.js, like it: the chosen skin's
// stylesheet (frontend/skins.css) is written into the page before it paints,
// so it does not flash, and nobody who never chose a skin downloads it. The
// choice is kept in this browser (localStorage, cm_skin).
(function () {
    var KEY = "cm_skin";
    var CSS = "/frontend/skins.css";
    // The first is the site's own look: choosing it removes the others.
    var SKINS = [
        ["aero", "Aero", "El aero de siempre: vidrio, celeste y degradados suaves."],
        ["skeuo", "Skeuomorfismo", "Tapete de fieltro, cuero cosido, madera y botones de bronce."],
        ["metro", "Frutiger Metro", "Mosaicos planos de colores, esquinas rectas y letras finas."]
    ];
    var KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
    var TAPS = 5;
    var TAP_WINDOW_MS = 2500;
    var root = document.documentElement;
    var t = function (text) {
        return window.t ? window.t(text) : text; // frontend/i18n.js, once loaded
    };

    function stored() {
        try {
            var skin = localStorage.getItem(KEY);
            return SKINS.some(function (item, index) { return index > 0 && item[0] === skin; }) ? skin : null;
        } catch (error) {
            return null; // Storage blocked: the usual look.
        }
    }

    function remember(skin) {
        try {
            if (skin === SKINS[0][0]) localStorage.removeItem(KEY);
            else localStorage.setItem(KEY, skin);
        } catch (error) {
            /* Without storage the skin lasts until the page reloads. */
        }
    }

    // The stylesheet, once; done() runs when it is ready to use.
    function loadStylesheet(done) {
        var link = document.getElementById("skin-css");
        if (link && link.sheet) return done();
        if (!link) {
            link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = CSS;
            link.id = "skin-css";
            document.head.appendChild(link);
        }
        link.addEventListener("load", done, { once: true });
        link.addEventListener("error", done, { once: true });
    }

    function apply(skin) {
        remember(skin);
        if (skin === SKINS[0][0]) {
            delete root.dataset.skin;
            return;
        }
        loadStylesheet(function () {
            root.dataset.skin = skin;
        });
    }

    var chosen = stored();
    if (chosen) {
        // Written while the <head> is read, so the page waits for it.
        document.write('<link rel="stylesheet" href="' + CSS + '" id="skin-css">');
        root.dataset.skin = chosen;
    }

    // ---- The picker: a dialog with one choice per skin ----------------------

    function pickerHtml() {
        var current = root.dataset.skin || SKINS[0][0];
        var choices = SKINS.map(function (skin) {
            return (
                '<label class="skin-choice">' +
                '<input type="radio" name="skin" value="' + skin[0] + '"' + (skin[0] === current ? " checked" : "") + ">" +
                '<span class="skin-sample" data-sample="' + skin[0] + '" aria-hidden="true"><i></i><i></i><i></i></span>' +
                "<span><b>" + t(skin[1]) + "</b><small>" + t(skin[2]) + "</small></span>" +
                "</label>"
            );
        });
        return (
            '<form method="dialog">' +
            '<h2 id="skin-title">' + t("Apariencias secretas") + "</h2>" +
            "<p>" + t("Cambian el aspecto de todo el sitio y se guardan en este navegador. El modo claro u oscuro sigue funcionando con cada una.") + "</p>" +
            '<fieldset><legend class="sr-only">' + t("Apariencias secretas") + "</legend>" + choices.join("") + "</fieldset>" +
            '<p class="skin-done"><button class="btn">' + t("Listo") + "</button></p>" +
            "</form>"
        );
    }

    function openPicker() {
        var dialog = document.getElementById("skin-picker");
        if (dialog && dialog.open) return;
        // The picker's own styles live with the skins.
        loadStylesheet(function () {
            if (!dialog) {
                dialog = document.createElement("dialog");
                dialog.id = "skin-picker";
                dialog.className = "skin-picker";
                dialog.setAttribute("aria-labelledby", "skin-title");
                dialog.addEventListener("change", function (event) {
                    if (event.target.name === "skin") apply(event.target.value);
                });
                // A click on the backdrop closes it, as Esc does.
                dialog.addEventListener("click", function (event) {
                    if (event.target === dialog) dialog.close();
                });
                document.body.appendChild(dialog);
            }
            dialog.innerHTML = pickerHtml();
            dialog.showModal();
            dialog.querySelector("input:checked").focus();
        });
    }

    // ---- The two secret ways in ---------------------------------------------

    var typed = 0;
    document.addEventListener("keydown", function (event) {
        var key = event.key.toLowerCase();
        typed = key === KONAMI[typed] ? typed + 1 : key === KONAMI[0] ? 1 : 0;
        if (typed === KONAMI.length) {
            typed = 0;
            openPicker();
        }
    });

    var taps = [];
    document.addEventListener("click", function (event) {
        if (!event.target.closest || !event.target.closest(".site-footer small")) return;
        var now = Date.now();
        taps = taps.filter(function (time) { return now - time < TAP_WINDOW_MS; }).concat(now);
        if (taps.length < TAPS) return;
        taps = [];
        openPicker();
    });
})();
