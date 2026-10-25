// PROVISIONAL: modo claro y oscuro, con su botón en la cabecera. Probablemente
// se quite; para hacerlo, borrar este archivo, sus <script> en las páginas,
// el botón #theme de index.html y los bloques "PROVISIONAL" de styles.css.
//
// Es un script clásico que se carga en <head>, antes de pintar, para que la
// página no aparezca un instante con el otro tema. La elección se guarda en
// este navegador; sin elección, el modo oscuro de siempre.
(function () {
    var KEY = "cm_theme";
    // Color de la barra del navegador en celulares, por tema.
    var BAR_COLORS = { dark: "#0a1626", light: "#c7eaf8" };
    var root = document.documentElement;

    function stored() {
        try {
            return localStorage.getItem(KEY);
        } catch (error) {
            return null; // Almacenamiento bloqueado: modo oscuro.
        }
    }

    function apply(theme) {
        root.dataset.theme = theme;
        var bar = document.querySelector('meta[name="theme-color"]');
        if (bar) bar.content = BAR_COLORS[theme];
        var button = document.getElementById("theme");
        if (!button) return;
        var light = theme === "light";
        button.setAttribute("aria-pressed", String(light));
        // El ícono muestra el modo al que se pasa.
        button.textContent = light ? "☾" : "☀";
        button.title = light ? "Modo oscuro (provisional)" : "Modo claro (provisional)";
    }

    apply(stored() === "light" ? "light" : "dark");
    document.addEventListener("DOMContentLoaded", function () {
        apply(root.dataset.theme);
    });
    document.addEventListener("click", function (event) {
        if (!event.target.closest || !event.target.closest("#theme")) return;
        var theme = root.dataset.theme === "light" ? "dark" : "light";
        apply(theme);
        try {
            localStorage.setItem(KEY, theme);
        } catch (error) {
            /* Sin almacenamiento, el tema dura hasta recargar. */
        }
    });
})();
