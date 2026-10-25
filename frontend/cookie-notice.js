// The cookie notice at the bottom of every page (frontend/pages/footer.html).
//
// Cardmática uses only necessary cookies (session, security and language), so
// there is nothing to accept or refuse: the notice informs, links the cookie
// policy and goes away for good once read. That it was read is kept in this
// browser's storage, never sent to the server.
(function () {
    var KEY = "cm_cookies_seen";

    function seen() {
        try {
            return localStorage.getItem(KEY) === "1";
        } catch (error) {
            return false; // Storage blocked: the notice shows on each visit.
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        var notice = document.querySelector(".cookie-note");
        if (!notice || seen()) return;
        notice.hidden = false;
        notice.querySelector("[data-cookie-ok]").addEventListener("click", function () {
            notice.hidden = true;
            try {
                localStorage.setItem(KEY, "1");
            } catch (error) {
                /* Without storage it simply shows again next time. */
            }
        });
    });
})();
