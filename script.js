// Configuración del catálogo
var TABS = ["Inicio", "Todas", "Monstruo", "Magia", "Trampa", "Productos", "Vendedores"],
    TN = {
        Inicio: "Inicio",
        Todas: "Todas las cartas",
        Monstruo: "Monstruos",
        Magia: "Magias",
        Trampa: "Trampas",
        Productos: "Cajas y accesorios",
        Vendedores: "Vendedores"
    };
var SUBS = {
    Monstruo: ["Normal", "Efecto", "Fusión", "Ritual", "Sincro", "Xyz", "Link", "Péndulo", "Tuner"],
    Magia: ["Normal", "Juego rápido", "Continua", "Equipo", "Campo", "Ritual"],
    Trampa: ["Normal", "Continua", "Contraefecto"]
};
var SETT = {
    B: "Sobre (booster)",
    S: "Starter Deck",
    D: "Structure Deck",
    P: "Promo",
    T: "Lata (tin)",
    X: "Box set / reedición"
};
var SETS = {
    LOB: ["Legend of Blue Eyes White Dragon", "B"],
    MRD: ["Metal Raiders", "B"],
    PSV: ["Pharaoh's Servant", "B"],
    MRL: ["Magic Ruler", "B"],
    TAEV: ["Tactical Evolution", "B"],
    SOVR: ["Stardust Overdrive", "B"],
    ABYR: ["Abyss Rising", "B"],
    CIBR: ["Circuit Break", "B"],
    MACR: ["Maximum Crisis", "B"],
    PEVO: ["Pendulum Evolution", "B"],
    DREV: ["Duelist Revolution", "B"],
    EOJ: ["Enemy of Justice", "B"],
    DUPO: ["Duel Power", "B"],
    DPKB: ["Duelist Pack: Kaiba", "B"],
    SDK: ["Starter Deck: Kaiba", "S"],
    SDY: ["Starter Deck: Yugi", "S"],
    SDPD: ["Structure Deck: Pendulum Domination", "D"],
    SDHS: ["Structure Deck: HERO Strike", "D"],
    YCS: ["Promo de torneo", "P"],
    MP13: ["Mega-Tin 2013", "T"],
    MP19: ["Mega-Tin 2019", "T"],
    LC01: ["Legendary Collection", "X"],
    YGLD: ["Yugi's Legendary Decks", "X"],
    LDK2: ["Legendary Decks II", "X"]
};
var RK = {
    C: "Común",
    R: "Rara",
    SR: "Super Rare",
    UR: "Ultra Rare",
    UtR: "Ultimate Rare",
    GR: "Ghost Rare",
    ScR: "Secret Rare",
    StR: "Starlight Rare"
};
var RAR = {
    "Común": [1, "rgba(255,255,255,.1)", "#c5d0de"],
    "Rara": [1.6, "rgba(120,160,230,.25)", "#a9c4f5"],
    "Super Rare": [2.4, "rgba(80,190,240,.25)", "#8fdcff"],
    "Ultra Rare": [4, "rgba(240,190,70,.25)", "#ffd773"],
    "Ultimate Rare": [9, "rgba(230,130,220,.25)", "#f5aaee"],
    "Ghost Rare": [14, "rgba(235,235,245,.22)", "#f2f2ff"],
    "Secret Rare": [6, "rgba(160,130,245,.28)", "#cbb9ff"],
    "Starlight Rare": [30, "linear-gradient(90deg,#f7a,#fd6,#6df)", "#1a1a2a"]
};
var COND = [
        ["MT", "#1b7f4d"],
        ["NM", "#2e9d5b"],
        ["EX", "#6aa84f"],
        ["GD", "#b8921f"],
        ["LP", "#d9822b"],
        ["PL", "#c0392b"],
        ["PO", "#7b241c"]
    ],
    CONDN = ["Mint", "Near Mint", "Excelente", "Bueno", "Poco jugado", "Jugado", "Pobre"];
var FR = {
    "Link": "#1f4f8f",
    "Xyz": "#2a2a30",
    "Sincro": "#d8d8dc",
    "Fusión": "#7a4aa0",
    "Ritual": "#3b6fb5",
    "Péndulo": "#2f9a8a",
    "Efecto": "#b5622f",
    "Normal": "#c9a24a"
};
var AT = { L: "LUZ", O: "OSCURIDAD", F: "FUEGO", A: "AGUA", T: "TIERRA", V: "VIENTO" },
    KN = { M: "Monstruo", S: "Magia", T: "Trampa" },
    LANGS = ["ES", "EN", "FR", "DE", "IT"];

// Datos de las cartas
var D = [
    [
        "Blue-Eyes White Dragon",
        "M",
        "Normal",
        "L",
        8,
        3000,
        2500,
        6,
        "LOB001:UR,SDK001:UR,LDK2001:C"
    ],
    ["Dark Magician", "M", "Normal", "O", 7, 2500, 2100, 5, "LOB005:UR,SDY006:UR,LC01005:UR"],
    ["Red-Eyes Black Dragon", "M", "Normal", "O", 7, 2400, 2000, 4, "LOB070:UR,YGLD001:UR"],
    ["Summoned Skull", "M", "Normal", "O", 6, 2500, 1200, 3, "MRD022:UR,SDK009:C"],
    ["Exodia the Forbidden One", "M", "Efecto", "O", 3, 1000, 1000, 8, "LOB124:UR,YGLD020:UR"],
    ['Maxx "C"', "M", "Efecto", "T", 2, 500, 200, 2, "DUPO025:UR,MP19040:R"],
    ["Kuriboh", "M", "Efecto", "O", 1, 300, 200, 2, "MRD067:C,SDY020:C"],
    ["Sangan", "M", "Efecto", "O", 3, 1000, 600, 1.5, "SDK012:C,PSV075:R"],
    [
        "Elemental HERO Flame Wingman",
        "M",
        "Fusión,Efecto",
        "V",
        6,
        2100,
        1200,
        2,
        "EOJ001:SR,SDHS001:R"
    ],
    ["Dark Paladin", "M", "Fusión,Efecto", "O", 8, 2900, 2400, 3, "MRL060:UR,SDY030:R"],
    ["Gaia the Dragon Champion", "M", "Fusión", "T", 7, 2600, 2100, 2, "LOB095:R,MP13020:UR"],
    ["Black Luster Soldier", "M", "Ritual", "T", 8, 3000, 2500, 4, "PSV001:UR,YGLD030:UR"],
    ["Magician of Black Chaos", "M", "Ritual,Efecto", "O", 8, 2800, 2600, 3, "MRL010:UR,SDY050:R"],
    ["Relinquished", "M", "Ritual,Efecto", "O", 1, 0, 0, 3, "PSV090:UR,LC01030:UR"],
    ["Stardust Dragon", "M", "Sincro,Efecto", "V", 8, 2500, 2000, 4, "TAEV040:UR,SOVR040:R"],
    ["Black Rose Dragon", "M", "Sincro,Efecto", "F", 7, 2400, 1800, 3, "TAEV050:UR,MP13030:UR"],
    ["Red Dragon Archfiend", "M", "Sincro,Efecto", "F", 8, 3000, 2000, 4, "TAEV060:UR,SOVR060:SR"],
    ["Number 39: Utopia", "M", "Xyz,Efecto", "L", 4, 2500, 2000, 3, "ABYR048:UR,MP13040:SR"],
    ["Gagaga Cowboy", "M", "Xyz", "T", 4, 1500, 2400, 1.5, "ABYR020:C,DUPO050:R"],
    ["Bahamut Shark", "M", "Xyz,Efecto", "A", 4, 2600, 2100, 2.5, "ABYR060:UR,MP19060:R"],
    [
        "Accesscode Talker",
        "M",
        "Link,Efecto",
        "O",
        4,
        2300,
        0,
        4,
        "CIBR049:ScR,MP19001:UR,YCS001:UR"
    ],
    ["Firewall Dragon", "M", "Link,Efecto", "A", 3, 2500, 0, 3, "CIBR030:ScR,MP19010:UR"],
    ["Decode Talker", "M", "Link,Efecto", "O", 3, 2300, 0, 2, "CIBR040:SR,MP19020:R"],
    [
        "Odd-Eyes Pendulum Dragon",
        "M",
        "Péndulo,Efecto",
        "O",
        7,
        2500,
        2000,
        2,
        "PEVO008:UR,SDPD001:C"
    ],
    ["Supreme King Z-ARC", "M", "Péndulo,Efecto", "O", 12, 4000, 4000, 5, "PEVO040:ScR,MP19070:UR"],
    ["Timegazer Magician", "M", "Péndulo,Efecto", "L", 3, 1200, 0, 1.5, "PEVO020:R,SDPD010:C"],
    ["Effect Veiler", "M", "Efecto,Tuner", "L", 1, 0, 0, 3, "DREV035:SR,MP13001:UR"],
    [
        "Ash Blossom & Joyous Spring",
        "M",
        "Efecto,Tuner",
        "F",
        3,
        0,
        1800,
        3,
        "MACR036:ScR,MP19030:UR"
    ],
    ["Junk Synchron", "M", "Efecto,Tuner", "O", 3, 1300, 500, 2, "SOVR020:C,SDHS010:R"],
    ["Pot of Greed", "S", "Normal", "", 0, 0, 0, 2, "LOB119:R,LC01001:UR"],
    ["Monster Reborn", "S", "Normal", "", 0, 0, 0, 1.2, "LOB118:UR,SDK025:C"],
    ["Raigeki", "S", "Normal", "", 0, 0, 0, 1.5, "LOB053:SR,SDY045:C"],
    ["Mystical Space Typhoon", "S", "Juego rápido", "", 0, 0, 0, 1, "SDY039:C,DREV050:SR"],
    ["Book of Moon", "S", "Juego rápido", "", 0, 0, 0, 1.2, "MACR010:R,MP13050:UR"],
    ["Forbidden Lance", "S", "Juego rápido", "", 0, 0, 0, 0.6, "DUPO060:C,MP19050:R"],
    ["Messenger of Peace", "S", "Continua", "", 0, 0, 0, 1.5, "MRD090:UR,SDY060:R"],
    ["Swords of Revealing Light", "S", "Continua", "", 0, 0, 0, 1.5, "LOB090:SR,SDK040:C"],
    ["Rivalry of Warlords", "S", "Continua", "", 0, 0, 0, 1, "MRL070:SR,MP13060:R"],
    ["Axe of Despair", "S", "Equipo", "", 0, 0, 0, 0.8, "MRD080:R,SDK035:C"],
    ["Black Pendant", "S", "Equipo", "", 0, 0, 0, 0.5, "LOB110:C,SDY070:C"],
    ["Megamorph", "S", "Equipo", "", 0, 0, 0, 1, "LOB125:R,YGLD040:UR"],
    ["Yami", "S", "Campo", "", 0, 0, 0, 0.8, "MRD100:R,SDY080:C"],
    ["Umi", "S", "Campo", "", 0, 0, 0, 0.6, "LOB130:R,SDK060:C"],
    ["Forest", "S", "Campo", "", 0, 0, 0, 0.5, "LOB140:C,SDY090:C"],
    ["Black Illusion Ritual", "S", "Ritual", "", 0, 0, 0, 2.5, "PSV100:UR,YGLD050:UR"],
    ["Black Luster Ritual", "S", "Ritual", "", 0, 0, 0, 2.5, "PSV110:SR,YGLD060:UR"],
    ["Contract with the Abyss", "S", "Ritual", "", 0, 0, 0, 2, "MRL080:UR,LC01040:UR"],
    ["Mirror Force", "T", "Normal", "", 0, 0, 0, 2.5, "MRD138:SR,SDK046:C,DPKB001:UR"],
    ["Trap Hole", "T", "Normal", "", 0, 0, 0, 0.8, "LOB085:C,SDY100:C"],
    ["Bottomless Trap Hole", "T", "Normal", "", 0, 0, 0, 1.5, "MRD140:SR,MP13070:UR"],
    ["Gravity Bind", "T", "Continua", "", 0, 0, 0, 2, "MRD150:UR,SDK070:R"],
    ["Skill Drain", "T", "Continua", "", 0, 0, 0, 2.5, "MRL090:UR,MP19080:R"],
    ["Royal Decree", "T", "Continua", "", 0, 0, 0, 1.8, "PSV120:SR,MP13080:UR"],
    ["Solemn Judgment", "T", "Contraefecto", "", 0, 0, 0, 1.5, "MRL001:UR,MP19090:ScR"],
    ["Solemn Strike", "T", "Contraefecto", "", 0, 0, 0, 1.2, "DUPO070:SR,MP19095:ScR"],
    ["Seven Tools of the Bandit", "T", "Contraefecto", "", 0, 0, 0, 0.8, "MRD160:R,SDK080:C"]
];

// Construcción del catálogo de cartas
var CARDS = D.map(function (d, i) {
    return {
        id: i,
        n: d[0],
        k: KN[d[1]],
        sub: d[2].split(","),
        at: AT[d[3]] || "",
        lv: d[4],
        atk: d[5],
        def: d[6],
        base: d[7],
        pr: d[8].split(",").map(function (s) {
            var a = s.split(":"),
                m = a[0].match(/^(.*?)(\d{3})$/),
                st = SETS[m[1]];
            return { c: m[1] + "-EN" + m[2], s: st[0], t: st[1], r: RK[a[1]] };
        })
    };
});
SETS.CRFR = ["Crimson Frontier", "B"];
SETS.SFLG = ["Starfall Legacy", "B"];
SETS.DUNX = ["Structure Deck: Duelist Nexus", "D"];
SETS.MP26 = ["Mega-Tin 2026", "T"];
var DT = { CRFR: "2026-09-12", SFLG: "2026-07-18", DUNX: "2026-10-02", MP26: "2026-08-08" },
    LAT = ["DUNX", "CRFR", "MP26", "SFLG"];
[
    [0, "CRFR001:StR"],
    [14, "CRFR002:ScR"],
    [20, "CRFR003:UR"],
    [47, "CRFR004:UR"],
    [11, "CRFR005:UtR"],
    [27, "SFLG001:ScR"],
    [24, "SFLG002:UR"],
    [1, "SFLG003:UtR"],
    [33, "SFLG004:SR"],
    [26, "DUNX001:R"],
    [32, "DUNX002:SR"],
    [53, "DUNX003:C"],
    [16, "MP26001:UR"],
    [19, "MP26002:SR"]
].forEach(function (x) {
    var a = x[1].split(":"),
        m = a[0].match(/^(.*?)(\d{3})$/),
        st = SETS[m[1]];
    CARDS[x[0]].pr.unshift({ c: m[1] + "-EN" + m[2], s: st[0], t: st[1], r: RK[a[1]] });
});

// Idiomas y versiones OCG
var OL = ["JP", "KR", "SC", "AE"],
    LN = {
        ES: "Español",
        EN: "Inglés",
        FR: "Francés",
        DE: "Alemán",
        IT: "Italiano",
        JP: "Japonés",
        KR: "Coreano",
        SC: "Chino",
        AE: "Asian-English"
    },
    LM = { JP: 1, KR: 0.9, SC: 0.7, AE: 0.85 };
CARDS.slice().forEach(function (c) {
    var o = JSON.parse(JSON.stringify(c));
    o.id = CARDS.length;
    o.ocg = true;
    o.pr = OL.map(function (l, k) {
        var p = c.pr[k % c.pr.length],
            m = p.c.match(/^(.*)-EN(\d{3})$/);
        return { c: m[1] + "-" + l + m[2], s: p.s, t: p.t, r: p.r, l: l };
    });
    CARDS.push(o);
});

// Generación de vendedores y stock de demostración
function rng(s) {
    return function () {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}
var rd = rng(99),
    NAMES = [
        ["CartaViva", "Argentina"],
        ["Dados&Mazos", "Brasil"],
        ["LaMazmorra", "Argentina"],
        ["TiendaNorte", "Paraguay"],
        ["El_Coleccionista", "Uruguay"],
        ["ManaDirecta", "Bolivia"],
        ["Sombra_Card", "Brasil"],
        ["PixelCarton", "Paraguay"]
    ];
var V = NAMES.map(function (v, i) {
    return {
        id: i,
        n: v[0],
        co: v[1],
        rt: (4.3 + rd() * 0.7).toFixed(1),
        sn: 2014 + Math.floor(rd() * 9)
    };
});
var ITEMS = [];

function gen(v, c) {
    for (var m = 1 + Math.floor(rd() * 2.5); m > 0; m--) {
        var pi = Math.floor(rd() * c.pr.length),
            ci = Math.floor(rd() * rd() * 7),
            f = 1.25 - ci * 0.09 + rd() * 0.2;
        ITEMS.push({
            id: ITEMS.length,
            v: v.id,
            c: c.id,
            p: pi,
            k: ci,
            l: c.ocg ? c.pr[pi].l : LANGS[Math.floor(rd() * 5)],
            q: 1 + Math.floor(rd() * 6),
            pr: Math.max(
                0.05,
                Math.round(c.base * RAR[c.pr[pi].r][0] * (c.ocg ? LM[c.pr[pi].l] : 1) * f * 100) /
                    100
            )
        });
    }
    return 1;
}
CARDS.forEach(function (c) {
    var n = 0;
    V.forEach(function (v) {
        if (rd() < 0.42) n += gen(v, c);
    });
    if (!n && c.id % 7 !== 3) gen(V[Math.floor(rd() * 8)], c);
});

// Productos sellados y accesorios
var CATS = [
        "Caja sellada",
        "Sobre",
        "Mazo sellado",
        "Lata",
        "Binder",
        "Deckbox",
        "Páginas de binder"
    ],
    PR = [];
[
    ["Caja sellada Crimson Frontier (24 sobres)", "Caja sellada", "CRFR", 0, 95, "📦"],
    ["Sobre Crimson Frontier", "Sobre", "CRFR", 0, 4.5, "🎴"],
    ["Caja sellada Starfall Legacy (24 sobres)", "Caja sellada", "SFLG", 0, 90, "📦"],
    ["Sobre Starfall Legacy", "Sobre", "SFLG", 0, 4.2, "🎴"],
    ["Structure Deck: Duelist Nexus (sellado)", "Mazo sellado", "DUNX", 0, 14, "🃏"],
    ["Mega-Tin 2026 (sellada)", "Lata", "MP26", 0, 32, "🥫"],
    [
        "Caja sellada Legend of Blue Eyes White Dragon (vintage)",
        "Caja sellada",
        "LOB",
        0,
        1800,
        "📦"
    ],
    ["Starter Deck: Kaiba (sellado)", "Mazo sellado", "SDK", 0, 90, "🃏"],
    ["Binder 9 bolsillos", "Binder", "", 2, 14, "📒"],
    ["Binder 12 bolsillos premium", "Binder", "", 2, 28, "📒"],
    ["Deckbox magnético 60 cartas", "Deckbox", "", 2, 18, "🧳"],
    ["Deckbox rígido 100 cartas", "Deckbox", "", 2, 9, "🧳"],
    ["Páginas 9 bolsillos (pack de 10)", "Páginas de binder", "", 2, 6, "📄"],
    ["Páginas 12 bolsillos (pack de 10)", "Páginas de binder", "", 2, 10, "📄"]
].forEach(function (a) {
    PR.push({ id: PR.length, n: a[0], cat: a[1], set: a[2], ocg: a[3], base: a[4], ic: a[5] });
});
PR.slice().forEach(function (p) {
    if (p.ocg === 0)
        PR.push({
            id: PR.length,
            n: p.n + " (OCG)",
            cat: p.cat,
            set: p.set,
            ocg: 1,
            base: Math.round(p.base * 90) / 100,
            ic: p.ic
        });
});
PR.forEach(function (p) {
    var n = 0;
    V.forEach(function (v) {
        if (rd() < 0.45) {
            n = 1;
            for (var m = 1 + Math.floor(rd() * 2); m > 0; m--)
                ITEMS.push({
                    id: ITEMS.length,
                    v: v.id,
                    c: -1,
                    pd: p.id,
                    k: 0,
                    l:
                        p.ocg === 2
                            ? ""
                            : p.ocg === 1
                            ? OL[Math.floor(rd() * 4)]
                            : LANGS[Math.floor(rd() * 5)],
                    q: 1 + Math.floor(rd() * 8),
                    pr: Math.round(p.base * (0.9 + rd() * 0.25) * 100) / 100
                });
        }
    });
    if (!n) ITEMS.push({ id: ITEMS.length, v: 0, c: -1, pd: p.id, k: 0, l: "", q: 3, pr: p.base });
});

// Estado de la aplicación
var tab = "Inicio",
    mk = "TCG",
    cart = {},
    $ = function (i) {
        return document.getElementById(i);
    };

// Monedas y formato de precios
var CUR = [
        ["EUR", "Euro", 1],
        ["USD", "Dólar estadounidense", 1.1],
        ["ARS", "Peso argentino", 1600],
        ["BRL", "Real brasileño", 6.2],
        ["PYG", "Guaraní paraguayo", 8600],
        ["UYU", "Peso uruguayo", 46],
        ["BOB", "Boliviano", 7.6]
    ],
    cur = "EUR",
    NF = {};
try {
    var sv = localStorage.getItem("cm_cur");
    if (
        sv &&
        CUR.some(function (x) {
            return x[0] === sv;
        })
    )
        cur = sv;
} catch (e) {}

function eur(n) {
    var r = CUR.filter(function (x) {
            return x[0] === cur;
        })[0][2],
        z = cur === "ARS" || cur === "PYG" ? 0 : 2;
    NF[cur] =
        NF[cur] ||
        new Intl.NumberFormat("es", {
            style: "currency",
            currency: cur,
            minimumFractionDigits: z,
            maximumFractionDigits: z
        });
    return NF[cur].format(n * r);
}

// Banderas y utilidades de presentación
var FL = {
    Argentina:
        '<rect width="30" height="20" fill="#74acdf"/><rect y="6.7" width="30" height="6.6" fill="#fff"/><circle cx="15" cy="10" r="2.2" fill="#f6b40e"/>',
    Brasil: '<rect width="30" height="20" fill="#009b3a"/><path d="M15 2 28 10 15 18 2 10Z" fill="#fedf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/>',
    Paraguay:
        '<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.7" fill="#d52b1e"/><rect y="13.3" width="30" height="6.7" fill="#0038a8"/>',
    Uruguay:
        '<rect width="30" height="20" fill="#fff"/><path d="M0 2.5h30M0 7.5h30M0 12.5h30M0 17.5h30" stroke="#0038a8" stroke-width="2.2"/><rect width="11" height="10" fill="#fff"/><circle cx="5.5" cy="5" r="3" fill="#fcd116"/>',
    Bolivia:
        '<rect width="30" height="20" fill="#d52b1e"/><rect y="6.7" width="30" height="6.6" fill="#f9e300"/><rect y="13.3" width="30" height="6.7" fill="#007934"/>'
};

function flag(co) {
    return (
        '<svg class="fl" viewBox="0 0 30 20" role="img" aria-label="' +
        co +
        '">' +
        (FL[co] || "") +
        "</svg>"
    );
}

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function lvl(c) {
    return c.k !== "Monstruo"
        ? ""
        : c.sub.indexOf("Link") > -1
        ? "LINK-" + c.lv
        : (c.sub.indexOf("Xyz") > -1 ? "Rango " : "Nivel ") + c.lv;
}

function stk(f) {
    return ITEMS.filter(function (i) {
        return i.q > 0 && f(i);
    });
}

function frame(c) {
    if (c.k === "Magia") return "#1f8f7a";
    if (c.k === "Trampa") return "#a33a7b";
    for (var f in FR) if (c.sub.indexOf(f) > -1 && f !== "Normal" && f !== "Efecto") return FR[f];
    return c.sub.indexOf("Efecto") > -1 ? FR.Efecto : FR.Normal;
}

function thumb(c, cl) {
    return (
        '<div class="' +
        cl +
        '" style="background:' +
        frame(c) +
        '"><i>' +
        (c.k === "Magia" ? "✦" : c.k === "Trampa" ? "⟲" : "⚔") +
        "</i></div>"
    );
}

function rr(r) {
    var x = RAR[r];
    return '<span class="rr" style="background:' + x[1] + ";color:" + x[2] + '">' + r + "</span>";
}

function tg(c) {
    return '<span class="tag ' + (c.ocg ? "o" : "t") + '">' + (c.ocg ? "OCG" : "TCG") + "</span>";
}

function chips(c) {
    return (
        tg(c) +
        '<span class="chip">' +
        c.k +
        "</span>" +
        c.sub
            .map(function (s) {
                return '<span class="chip">' + s + "</span>";
            })
            .join("")
    );
}

function opts(s, a, all) {
    s.innerHTML =
        '<option value="">' +
        all +
        "</option>" +
        a
            .map(function (x) {
                return '<option value="' + x[0] + '">' + x[1] + "</option>";
            })
            .join("");
}

// Navegación y listado de cartas
function init() {
    $("tabs").innerHTML = TABS.map(function (t) {
        return (
            '<button aria-pressed="' + (t === tab) + '" data-g="' + t + '">' + TN[t] + "</button>"
        );
    }).join("");
    var isV = tab === "Vendedores";
    $("cat").style.display = isV ? "none" : "";
    $("vend").style.display = isV ? "" : "none";
    if (isV) {
        vendors();
        return;
    }
    var all = [];
    if (tab === "Todas") {
        var seen = {};
        ["Monstruo", "Magia", "Trampa"].forEach(function (k) {
            SUBS[k].forEach(function (s) {
                if (!seen[s]) {
                    seen[s] = 1;
                    all.push(s);
                }
            });
        });
    } else all = SUBS[tab];
    opts(
        $("sub"),
        all.map(function (s) {
            return [s, s];
        }),
        "Todos los subtipos"
    );
    opts(
        $("rar"),
        Object.keys(RAR).map(function (r) {
            return [r, r];
        }),
        "Todas las rarezas"
    );
    opts(
        $("stp"),
        Object.keys(SETT).map(function (t) {
            return [t, SETT[t]];
        }),
        "Cualquier origen"
    );
    list();
}

function list() {
    if (tab === "Vendedores") return vendors();
    var q = $("q").value.toLowerCase(),
        sb = $("sub").value,
        rv = $("rar").value,
        st = $("stp").value,
        s = $("srt").value;
    function ok(c, i) {
        var p = c.pr[i.p];
        return (!rv || p.r === rv) && (!st || p.t === st);
    }
    var a = CARDS.filter(function (c) {
        if (!!c.ocg !== (mk === "OCG")) return false;
        if (tab !== "Todas" && c.k !== tab) return false;
        if (sb && c.sub.indexOf(sb) < 0) return false;
        if (
            !c.pr.some(function (p) {
                return (!rv || p.r === rv) && (!st || p.t === st);
            })
        )
            return false;
        return (
            (
                c.n +
                " " +
                c.pr
                    .map(function (p) {
                        return p.c + " " + p.s;
                    })
                    .join(" ")
            )
                .toLowerCase()
                .indexOf(q) > -1
        );
    });
    function mn(c) {
        var o = stk(function (i) {
            return i.c === c.id && ok(c, i);
        });
        return o.length
            ? Math.min.apply(
                  null,
                  o.map(function (x) {
                      return x.pr;
                  })
              )
            : null;
    }
    a.sort(function (x, y) {
        var px = mn(x),
            py = mn(y);
        return s === "pa"
            ? (px || 1e9) - (py || 1e9)
            : s === "pd"
            ? (py || 0) - (px || 0)
            : x.n.localeCompare(y.n);
    });
    $("cnt").textContent = a.length + " cartas";
    $("list").innerHTML = a.length
        ? a
              .map(function (c) {
                  var m = mn(c),
                      n = stk(function (i) {
                          return i.c === c.id;
                      }).length;
                  return (
                      '<tr class="row" tabindex="0" data-id="' +
                      c.id +
                      '"><td><div class="nm">' +
                      thumb(c, "thumb") +
                      "<div><b>" +
                      esc(c.n) +
                      "</b><small>" +
                      (c.k === "Monstruo"
                          ? c.at + " · " + lvl(c)
                          : "Carta de " + c.k.toLowerCase()) +
                      "</small></div></div></td><td>" +
                      chips(c) +
                      '</td><td class="hide">' +
                      c.pr
                          .map(function (p) {
                              return rr(p.r);
                          })
                          .join(" ") +
                      '</td><td class="num price">' +
                      (m === null
                          ? '<span style="color:var(--mu)">Sin stock</span><small>Últ. venta ' +
                            eur(lastSale(c).p) +
                            "</small>"
                          : eur(m)) +
                      '</td><td class="num hide">' +
                      n +
                      "</td></tr>"
                  );
              })
              .join("")
        : '<tr><td colspan="5" class="empty">Ninguna carta coincide. Quita algún filtro o prueba otra búsqueda.</td></tr>';
}

// Vendedores y tablas de ofertas
function vendors() {
    $("vl").innerHTML = V.map(function (v) {
        var it = stk(function (i) {
                return i.v === v.id;
            }),
            u = 0,
            val = 0;
        it.forEach(function (i) {
            u += i.q;
            val += i.q * i.pr;
        });
        return (
            '<tr class="row" tabindex="0" data-v="' +
            v.id +
            '"><td>' +
            flag(v.co) +
            '<b class="lk">' +
            esc(v.n) +
            "</b><small>Desde " +
            v.sn +
            '</small></td><td class="hide">' +
            v.co +
            "</td><td>★ " +
            v.rt +
            '</td><td class="num">' +
            it.length +
            '</td><td class="num hide">' +
            u +
            '</td><td class="num price">' +
            eur(val) +
            "</td></tr>"
        );
    }).join("");
}

function sellerCell(i) {
    return (
        flag(V[i.v].co) + '<button class="lk" data-v="' + i.v + '">' + esc(V[i.v].n) + "</button>"
    );
}

function printCell(c, i) {
    var p = c.pr[i.p];
    return "<b>" + p.c + "</b> " + rr(p.r) + "<small>" + p.s + " · " + SETT[p.t] + "</small>";
}

function condCell(i) {
    return (
        '<span class="cond" style="background:' +
        COND[i.k][1] +
        '" title="' +
        CONDN[i.k] +
        '">' +
        COND[i.k][0] +
        "</span>"
    );
}

// Detalle de cartas y ofertas
function detail(id) {
    var c = CARDS[id];
    $("mb").innerHTML =
        '<div class="top"><div><h2>' +
        esc(c.n) +
        "</h2>" +
        chips(c) +
        '</div><button class="ghost" data-close="md">Cerrar</button></div><div class="hero">' +
        thumb(c, "thumb big") +
        '<div class="facts">' +
        (c.k === "Monstruo"
            ? "<div><span>Atributo</span>" +
              c.at +
              "</div><div><span>Nivel / Rango / Link</span>" +
              lvl(c) +
              "</div><div><span>ATK / DEF</span>" +
              c.atk +
              " / " +
              (c.sub.indexOf("Link") > -1 ? "—" : c.def) +
              "</div>"
            : "<div><span>Tipo</span>" + c.k + " " + c.sub[0].toLowerCase() + "</div>") +
        "<div><span>Impresiones</span>" +
        c.pr.length +
        '</div></div></div><div id="ch" class="chart"></div><div class="sel"><select id="fp" aria-label="Impresión"><option value="">Todas las impresiones</option>' +
        c.pr
            .map(function (p, i) {
                return '<option value="' + i + '">' + p.c + " · " + p.r + "</option>";
            })
            .join("") +
        '</select><select id="fc" aria-label="Estado mínimo"><option value="6">Cualquier estado</option>' +
        COND.slice(0, 6)
            .map(function (x, i) {
                return '<option value="' + i + '">' + x[0] + " o mejor</option>";
            })
            .join("") +
        '</select><select id="fl" aria-label="Idioma"><option value="">Todos los idiomas</option>' +
        (c.ocg ? OL : LANGS)
            .map(function (l) {
                return '<option value="' + l + '">' + LN[l] + "</option>";
            })
            .join("") +
        '</select></div><div class="wrap"><table><thead><tr><th>Vendedor</th><th>Impresión</th><th>Estado</th><th>Idioma</th><th class="num">Disp.</th><th class="num">Precio</th><th></th></tr></thead><tbody id="ot"></tbody></table></div>';
    $("md").dataset.id = id;
    $("md").dataset.mode = "c";
    offers();
    drawChart();
    $("md").classList.add("on");
}

function offers() {
    var c = CARDS[+$("md").dataset.id],
        fp = $("fp").value,
        fc = +$("fc").value,
        fl = $("fl").value;
    var h = stk(function (i) {
        return i.c === c.id && (fp === "" || i.p === +fp) && i.k <= fc && (!fl || i.l === fl);
    }).sort(function (a, b) {
        return a.pr - b.pr;
    });
    $("ot").innerHTML = h.length
        ? h
              .map(function (i) {
                  return (
                      "<tr><td>" +
                      sellerCell(i) +
                      "</td><td>" +
                      printCell(c, i) +
                      "</td><td>" +
                      condCell(i) +
                      "</td><td>" +
                      LN[i.l] +
                      '</td><td class="num">' +
                      i.q +
                      '</td><td class="num price">' +
                      eur(i.pr) +
                      '</td><td class="num"><button class="btn s" data-add="' +
                      i.id +
                      '">Añadir</button></td></tr>'
                  );
              })
              .join("")
        : '<tr><td colspan="7" class="empty">Sin ofertas con esos filtros. Prueba con otro estado, idioma o impresión.</td></tr>';
}

// Perfil e inventario del vendedor
function vendor(id) {
    var v = V[id],
        it = stk(function (i) {
            return i.v === id;
        }),
        u = 0,
        val = 0;
    it.forEach(function (i) {
        u += i.q;
        val += i.q * i.pr;
    });
    $("mb").innerHTML =
        '<div class="top"><div><h2>' +
        flag(v.co) +
        esc(v.n) +
        "</h2><small>" +
        v.co +
        " · ★ " +
        v.rt +
        " · vendedor desde " +
        v.sn +
        '</small></div><button class="ghost" data-close="md">Cerrar</button></div><div class="facts" style="margin-bottom:10px"><div><span>Base de datos de ' +
        esc(v.n) +
        "</span>" +
        it.length +
        " artículos en venta</div><div><span>Unidades en stock</span>" +
        u +
        '</div><div><span>Valor del inventario</span><b id="vv">' +
        eur(val) +
        '</b></div></div><div class="sel"><input id="vq" type="search" placeholder="Buscar en su inventario" aria-label="Buscar en inventario"><select id="vk" aria-label="Tipo"><option value="">Todos los tipos</option><option>Monstruo</option><option>Magia</option><option>Trampa</option><option>Producto</option></select><select id="vc" aria-label="Estado"><option value="6">Cualquier estado</option>' +
        COND.slice(0, 6)
            .map(function (x, i) {
                return '<option value="' + i + '">' + x[0] + " o mejor</option>";
            })
            .join("") +
        '</select><select id="vs" aria-label="Ordenar"><option value="n">Nombre</option><option value="pa">Precio: menor a mayor</option><option value="pd">Precio: mayor a menor</option></select></div><div class="wrap"><table><thead><tr><th>Carta</th><th>Impresión</th><th>Estado</th><th>Idioma</th><th class="num">Disp.</th><th class="num">Precio</th><th></th></tr></thead><tbody id="vt"></tbody></table></div>';
    $("md").dataset.id = id;
    $("md").dataset.mode = "v";
    inv();
    $("md").classList.add("on");
}

function inv() {
    var id = +$("md").dataset.id,
        q = $("vq").value.toLowerCase(),
        k = $("vk").value,
        cd = +$("vc").value,
        s = $("vs").value;
    var h = stk(function (i) {
        var c = CARDS[i.c];
        return (
            i.v === id &&
            (!k || c.k === k) &&
            i.k <= cd &&
            (c.n + " " + c.pr[i.p].c).toLowerCase().indexOf(q) > -1
        );
    });
    h.sort(function (a, b) {
        return s === "pa"
            ? a.pr - b.pr
            : s === "pd"
            ? b.pr - a.pr
            : CARDS[a.c].n.localeCompare(CARDS[b.c].n);
    });
    $("vt").innerHTML = h.length
        ? h
              .map(function (i) {
                  var c = CARDS[i.c];
                  return (
                      '<tr><td><button class="lk" data-card="' +
                      c.id +
                      '">' +
                      esc(c.n) +
                      "</button><small>" +
                      tg(c) +
                      c.k +
                      " · " +
                      c.sub.join(" / ") +
                      "</small></td><td>" +
                      printCell(c, i) +
                      "</td><td>" +
                      condCell(i) +
                      "</td><td>" +
                      LN[i.l] +
                      '</td><td class="num">' +
                      i.q +
                      '</td><td class="num price">' +
                      eur(i.pr) +
                      '</td><td class="num"><button class="btn s" data-add="' +
                      i.id +
                      '">Añadir</button></td></tr>'
                  );
              })
              .join("")
        : '<tr><td colspan="7" class="empty">Este vendedor no tiene artículos con esos filtros.</td></tr>';
}

// Notificaciones y carrito
function toast(t) {
    var e = $("ts");
    e.textContent = t;
    e.style.display = "block";
    clearTimeout(toast.h);
    toast.h = setTimeout(function () {
        e.style.display = "none";
    }, 1700);
}

function add(id) {
    var i = ITEMS[id],
        cur = cart[id] || 0;
    if (cur >= i.q) {
        toast("Solo hay " + i.q + " unidades de " + V[i.v].n);
        return;
    }
    cart[id] = cur + 1;
    count();
    toast(CARDS[i.c].n + " añadida al carrito");
}

function count() {
    var n = 0;
    for (var k in cart) n += cart[k];
    $("cc").textContent = n;
}

function showCart() {
    var ks = Object.keys(cart),
        sub = 0,
        h =
            '<div class="top"><h2>Tu carrito</h2><button class="ghost" data-close="cart">Cerrar</button></div>';
    if (!ks.length)
        h +=
            '<div class="empty">Tu carrito está vacío. Abre una carta o el inventario de un vendedor y añade lo que prefieras.</div>';
    else {
        h +=
            "<table><tbody>" +
            ks
                .map(function (k) {
                    var i = ITEMS[k],
                        c = CARDS[i.c];
                    sub += i.pr * cart[k];
                    return (
                        "<tr><td><b>" +
                        esc(c.n) +
                        "</b> " +
                        tg(c) +
                        "<small>" +
                        c.pr[i.p].c +
                        " · " +
                        c.pr[i.p].r +
                        " · " +
                        COND[i.k][0] +
                        " · " +
                        LN[i.l] +
                        " · " +
                        esc(V[i.v].n) +
                        '</small></td><td class="num">' +
                        cart[k] +
                        " × " +
                        eur(i.pr) +
                        '</td><td class="num"><button class="ghost" data-rm="' +
                        k +
                        '">Quitar</button></td></tr>'
                    );
                })
                .join("") +
            "</tbody></table>";
        var sh = sub >= 25 ? 0 : 2.5;
        h +=
            '<div class="tot sm"><span>Subtotal</span><span>' +
            eur(sub) +
            '</span></div><div class="tot sm" style="padding-top:4px"><span>Envío' +
            (sh ? " (gratis desde " + eur(25) + ")" : "") +
            "</span><span>" +
            (sh ? eur(sh) : "Gratis") +
            '</span></div><div class="tot"><span>Total</span><span>' +
            eur(sub + sh) +
            '</span></div><p style="text-align:right"><button class="btn" data-buy="1">Finalizar compra</button></p>';
    }
    $("cbx").innerHTML = h;
    $("cart").classList.add("on");
}

// Eventos de navegación y compra
document.addEventListener("click", function (e) {
    pad();
    var t = e.target,
        b;
    if ((b = t.closest("[data-mk]"))) {
        mk = b.dataset.mk;
        seg();
        init();
        return;
    }
    if ((b = t.closest("[data-cr]"))) {
        crng = +b.dataset.cr;
        drawChart();
        return;
    }
    if ((b = t.closest("[data-pd]"))) {
        popen(+b.dataset.pd);
        return;
    }
    if ((b = t.closest("[data-go]"))) {
        tab = b.dataset.go;
        init();
        return;
    }
    if ((b = t.closest("[data-set]"))) {
        tab = "Todas";
        init();
        $("q").value = SETS[b.dataset.set][0];
        list();
        window.scrollTo(0, 0);
        return;
    }
    if ((b = t.closest("[data-g]"))) {
        tab = b.dataset.g;
        init();
        return;
    }
    if ((b = t.closest("[data-add]"))) {
        add(+b.dataset.add);
        return;
    }
    if ((b = t.closest("[data-rm]"))) {
        delete cart[b.dataset.rm];
        count();
        showCart();
        return;
    }
    if (t.closest("[data-buy]")) {
        for (var k in cart) ITEMS[k].q -= cart[k];
        cart = {};
        count();
        init();
        $("cbx").innerHTML =
            '<div class="top"><h2>Pedido recibido</h2><button class="ghost" data-close="cart">Cerrar</button></div><div class="empty">Es una demo: no se ha cobrado nada, pero el stock de cada vendedor se ha actualizado.</div>';
        return;
    }
    if ((b = t.closest("[data-close]"))) {
        $(b.dataset.close).classList.remove("on");
        return;
    }
    if (t.id === "md" || t.id === "cart") {
        t.classList.remove("on");
        return;
    }
    if (t.closest("#cb")) {
        showCart();
        return;
    }
    if ((b = t.closest("[data-v]"))) {
        vendor(+b.dataset.v);
        return;
    }
    if ((b = t.closest("[data-card]"))) {
        detail(+b.dataset.card);
        return;
    }
    if ((b = t.closest("tr.row"))) detail(+b.dataset.id);
});
document.addEventListener("input", function (e) {
    if (e.target.id === "vq") inv();
});
document.addEventListener("change", function (e) {
    var i = e.target.id;
    if (i === "fp" || i === "fc" || i === "fl") offers();
    if (i === "fp") drawChart();
    if (i === "pc") prods();
    if (i === "vk" || i === "vc" || i === "vs") inv();
});
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        $("md").classList.remove("on");
        $("cart").classList.remove("on");
    }
    pad();
    var t = e.target;
    if (e.key === "Enter" && t.classList && t.classList.contains("row")) {
        if (t.dataset.v) vendor(+t.dataset.v);
        else detail(+t.dataset.id);
    }
});

// Ajustes de pantalla y actualización de vistas
function pad() {
    var h = document.querySelector("header").getBoundingClientRect().bottom + 14;
    $("md").style.paddingTop = h + "px";
    $("cart").style.paddingTop = h + "px";
}

function seg() {
    document.querySelectorAll("[data-mk]").forEach(function (b) {
        b.setAttribute("aria-pressed", b.dataset.mk === mk);
    });
}

function rerender() {
    list();
    if ($("md").classList.contains("on") && $("md").dataset.mode === "catalog") {
        if ($("cart").classList.contains("on")) showCart();
        return;
    }
    if ($("md").classList.contains("on")) {
        if ($("md").dataset.mode === "c") {
            offers();
            drawChart();
        } else if ($("md").dataset.mode === "p") pOffers();
        else {
            var v = +$("md").dataset.id,
                val = 0;
            stk(function (i) {
                return i.v === v;
            }).forEach(function (i) {
                val += i.q * i.pr;
            });
            $("vv").innerHTML = eur(val);
            inv();
        }
    }
    if ($("cart").classList.contains("on")) showCart();
}
$("cur").innerHTML = CUR.map(function (x) {
    return (
        '<option value="' +
        x[0] +
        '"' +
        (x[0] === cur ? " selected" : "") +
        ">" +
        x[0] +
        " · " +
        x[1] +
        "</option>"
    );
}).join("");
$("cur").addEventListener("change", function () {
    cur = this.value;
    try {
        localStorage.setItem("cm_cur", cur);
    } catch (e) {}
    rerender();
});

// Utilidades de productos, mercados y fechas
function nm(i) {
    return i.c < 0 ? PR[i.pd].n : CARDS[i.c].n;
}

function ptag(p) {
    return p.ocg === 2 ? '<span class="tag a">Accesorio</span>' : tg({ ocg: p.ocg === 1 });
}

function inMk(i) {
    var O = mk === "OCG";
    return i.c < 0 ? PR[i.pd].ocg === 2 || (PR[i.pd].ocg === 1) === O : !!CARDS[i.c].ocg === O;
}

function dfmt(t) {
    return new Date(t).toLocaleDateString("es", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function sd(pf) {
    return DT[pf] ? dfmt(Date.parse(DT[pf])) : "—";
}

function pmin(id) {
    var o = stk(function (i) {
        return i.pd === id;
    });
    return o.length
        ? Math.min.apply(
              null,
              o.map(function (x) {
                  return x.pr;
              })
          )
        : null;
}

// Historial y gráficos de precios
var crng = 365,
    CR = [
        ["1M", 30],
        ["3M", 90],
        ["6M", 180],
        ["1A", 365],
        ["2A", 730]
    ],
    LC = ["#6fd3f2", "#ffd773", "#f5aaee", "#9be58a"],
    CH = null,
    HC = {};

function hist(c, pi) {
    var k = c.id + "-" + pi;
    if (HC[k]) return HC[k];
    var r = rng(c.id * 131 + pi * 17 + 7),
        b = c.base * RAR[c.pr[pi].r][0] * (c.ocg ? LM[c.pr[pi].l] : 1),
        p = b * (0.7 + r() * 0.3),
        a = [],
        end = Date.now() - Math.floor(r() * 45) * 864e5;
    for (var i = 103; i >= 0; i--) {
        p = Math.max(b * 0.35, p * (1 + (r() - 0.5) * 0.1 + ((b - p) / b) * 0.06));
        a.push({ t: end - i * 7 * 864e5, p: Math.round(p * 100) / 100 });
    }
    return (HC[k] = a);
}

function lastSale(c) {
    var b = null,
        bi = 0;
    c.pr.forEach(function (p, i) {
        var a = hist(c, i),
            x = a[a.length - 1];
        if (!b || x.t > b.t) {
            b = x;
            bi = i;
        }
    });
    return { p: b.p, t: b.t, pi: bi };
}

function drawChart() {
    var el = $("ch");
    if (!el) return;
    var c = CARDS[+$("md").dataset.id],
        fp = $("fp").value,
        ps =
            fp === ""
                ? c.pr.map(function (x, i) {
                      return i;
                  })
                : [+fp],
        cut = Date.now() - crng * 864e5;
    var ss = ps.map(function (pi) {
        var a = hist(c, pi),
            f = a.filter(function (x) {
                return x.t >= cut;
            });
        return f.length > 1 ? f : a.slice(-2);
    });
    var all = [].concat.apply([], ss),
        pv = all.map(function (x) {
            return x.p;
        }),
        tv = all.map(function (x) {
            return x.t;
        }),
        mn = Math.min.apply(null, pv),
        mx = Math.max.apply(null, pv),
        pd = (mx - mn) * 0.12 || mx * 0.1;
    mn = Math.max(0, mn - pd);
    mx += pd;
    var t0 = Math.min.apply(null, tv),
        t1 = Math.max.apply(null, tv),
        W = 640,
        H = 190,
        L = 64,
        R = 10,
        T = 8,
        B = 22;
    function X(t) {
        return L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
    }
    function Y(p) {
        return T + (1 - (p - mn) / (mx - mn)) * (H - T - B);
    }
    var g = "";
    for (var k = 0; k < 3; k++) {
        var v = mn + ((mx - mn) * k) / 2,
            y = Y(v);
        g +=
            '<line x1="' +
            L +
            '" x2="' +
            (W - R) +
            '" y1="' +
            y +
            '" y2="' +
            y +
            '" stroke="rgba(170,215,255,.15)"/><text x="' +
            (L - 6) +
            '" y="' +
            (y + 4) +
            '" text-anchor="end" font-size="11" fill="#9db0c6">' +
            eur(v) +
            "</text>";
    }
    g +=
        '<text x="' +
        L +
        '" y="' +
        (H - 5) +
        '" font-size="11" fill="#9db0c6">' +
        dfmt(t0) +
        '</text><text x="' +
        (W - R) +
        '" y="' +
        (H - 5) +
        '" text-anchor="end" font-size="11" fill="#9db0c6">' +
        dfmt(t1) +
        "</text>";
    ss.forEach(function (a, j) {
        var d = a
            .map(function (x, i) {
                return (i ? "L" : "M") + X(x.t).toFixed(1) + " " + Y(x.p).toFixed(1);
            })
            .join("");
        if (ss.length === 1)
            g +=
                '<path d="' +
                d +
                "L" +
                X(a[a.length - 1].t) +
                " " +
                (H - B) +
                "L" +
                X(a[0].t) +
                " " +
                (H - B) +
                'Z" fill="rgba(111,211,242,.12)"/>';
        g +=
            '<path d="' +
            d +
            '" fill="none" stroke="' +
            LC[ps[j] % 4] +
            '" stroke-width="2" stroke-linejoin="round"/>';
    });
    g +=
        '<line id="cv" y1="' +
        T +
        '" y2="' +
        (H - B) +
        '" stroke="rgba(255,255,255,.4)" style="display:none"/><rect id="cs" x="' +
        L +
        '" y="0" width="' +
        (W - L - R) +
        '" height="' +
        H +
        '" fill="transparent"/>';
    var ls = lastSale(c),
        sel =
            fp === ""
                ? ls
                : (function () {
                      var a = hist(c, +fp),
                          x = a[a.length - 1];
                      return { p: x.p, t: x.t, pi: +fp };
                  })(),
        s0 = ss[0],
        avg =
            pv.reduce(function (a, b) {
                return a + b;
            }, 0) / pv.length,
        ch = (s0[s0.length - 1].p / s0[0].p - 1) * 100;
    var stock = stk(function (i) {
        return i.c === c.id && (fp === "" || i.p === +fp);
    }).length;
    CH = { ss: ss, ps: ps, c: c, t0: t0, t1: t1, W: W, L: L, R: R };
    el.innerHTML =
        '<div class="cht"><b>Historial de precio</b><div class="seg m">' +
        CR.map(function (r) {
            return (
                '<button data-cr="' +
                r[1] +
                '" aria-pressed="' +
                (r[1] === crng) +
                '">' +
                r[0] +
                "</button>"
            );
        }).join("") +
        "</div></div>" +
        (ps.length > 1
            ? '<div style="margin-bottom:4px">' +
              ps
                  .map(function (pi) {
                      return (
                          '<span class="chip"><span style="color:' +
                          LC[pi % 4] +
                          '">●</span> ' +
                          c.pr[pi].c +
                          "</span>"
                      );
                  })
                  .join("") +
              "</div>"
            : "") +
        '<svg id="csv" viewBox="0 0 ' +
        W +
        " " +
        H +
        '" role="img" aria-label="Gráfico del historial de precio">' +
        g +
        '</svg><div class="tip" id="tip"></div><div class="cs"><div><small>Última venta</small><b>' +
        eur(sel.p) +
        "</b><small>" +
        dfmt(sel.t) +
        (ps.length > 1 ? " · " + c.pr[sel.pi].c : "") +
        "</small></div><div><small>Media del periodo</small><b>" +
        eur(avg) +
        "</b></div><div><small>Mínimo / máximo</small><b>" +
        eur(Math.min.apply(null, pv)) +
        " / " +
        eur(Math.max.apply(null, pv)) +
        '</b></div><div><small>Variación</small><b style="color:' +
        (ch >= 0 ? "#8fe3a5" : "#ff9b92") +
        '">' +
        (ch >= 0 ? "+" : "") +
        ch.toFixed(1) +
        "%</b></div></div>" +
        (stock
            ? ""
            : '<div class="warn">Nadie la tiene a la venta ahora. Última venta registrada: ' +
              eur(sel.p) +
              " el " +
              dfmt(sel.t) +
              ".</div>");
}
document.addEventListener("pointermove", function (e) {
    var tp = $("tip");
    if (!tp) return;
    var t = e.target.closest && e.target.closest("#cs");
    if (!t || !CH) {
        tp.style.display = "none";
        var l = $("cv");
        if (l) l.style.display = "none";
        return;
    }
    var sv = $("csv"),
        r = sv.getBoundingClientRect(),
        x = ((e.clientX - r.left) / r.width) * CH.W,
        tt = CH.t0 + ((x - CH.L) / (CH.W - CH.L - CH.R)) * (CH.t1 - CH.t0),
        h = "",
        tx = 0;
    CH.ss.forEach(function (a, j) {
        var b = a[0];
        a.forEach(function (p) {
            if (Math.abs(p.t - tt) < Math.abs(b.t - tt)) b = p;
        });
        if (j === 0) {
            tx = b.t;
            h = "<b>" + dfmt(b.t) + "</b>";
        }
        h +=
            '<div><span style="color:' +
            LC[CH.ps[j] % 4] +
            '">●</span> ' +
            CH.c.pr[CH.ps[j]].c +
            ": " +
            eur(b.p) +
            "</div>";
    });
    var xx = CH.L + ((tx - CH.t0) / (CH.t1 - CH.t0 || 1)) * (CH.W - CH.L - CH.R),
        l = $("cv");
    l.setAttribute("x1", xx);
    l.setAttribute("x2", xx);
    l.style.display = "";
    tp.innerHTML = h;
    tp.style.display = "block";
    var cr = $("ch").getBoundingClientRect();
    tp.style.left = Math.min(Math.max(e.clientX - cr.left + 12, 0), cr.width - 170) + "px";
    tp.style.top = "34px";
});

// Detalle y listado de productos
function popen(id) {
    var p = PR[id];
    $("mb").innerHTML =
        '<div class="top"><div><h2>' +
        esc(p.n) +
        "</h2>" +
        ptag(p) +
        '<span class="chip">' +
        p.cat +
        '</span></div><button class="ghost" data-close="md">Cerrar</button></div><div class="facts" style="margin-bottom:10px"><div><span>Set</span>' +
        (p.set ? SETS[p.set][0] + " (" + SETT[SETS[p.set][1]] + ")" : "Accesorio, sin set") +
        "</div><div><span>Lanzamiento</span>" +
        sd(p.set) +
        '</div></div><div class="wrap"><table><thead><tr><th>Vendedor</th><th>Idioma</th><th>Estado</th><th class="num">Disp.</th><th class="num">Precio</th><th></th></tr></thead><tbody id="pt"></tbody></table></div>';
    $("md").dataset.id = id;
    $("md").dataset.mode = "p";
    pOffers();
    $("md").classList.add("on");
}

function pOffers() {
    var id = +$("md").dataset.id,
        h = stk(function (i) {
            return i.pd === id;
        }).sort(function (a, b) {
            return a.pr - b.pr;
        });
    $("pt").innerHTML = h.length
        ? h
              .map(function (i) {
                  return (
                      "<tr><td>" +
                      sellerCell(i) +
                      "</td><td>" +
                      (i.l ? LN[i.l] : "—") +
                      '</td><td><span class="cond" style="background:#1b7f4d">Nuevo</span></td><td class="num">' +
                      i.q +
                      '</td><td class="num price">' +
                      eur(i.pr) +
                      '</td><td class="num"><button class="btn s" data-add="' +
                      i.id +
                      '">Añadir</button></td></tr>'
                  );
              })
              .join("")
        : '<tr><td colspan="6" class="empty">Nadie lo tiene a la venta ahora.</td></tr>';
}

function prods() {
    var sl = $("pc");
    if (!sl.options.length)
        opts(
            sl,
            CATS.map(function (c) {
                return [c, c];
            }),
            "Todas las categorías"
        );
    var q = $("q").value.toLowerCase(),
        cv = sl.value,
        O = mk === "OCG";
    var a = PR.filter(function (p) {
        return (
            (p.ocg === 2 || (p.ocg === 1) === O) &&
            (!cv || p.cat === cv) &&
            (p.n + " " + (p.set ? SETS[p.set][0] : "")).toLowerCase().indexOf(q) > -1
        );
    }).sort(function (x, y) {
        return (DT[y.set] || "") < (DT[x.set] || "")
            ? -1
            : (DT[y.set] || "") > (DT[x.set] || "")
            ? 1
            : x.n.localeCompare(y.n);
    });
    $("pcnt").textContent = a.length + " productos";
    $("pl").innerHTML = a.length
        ? a
              .map(function (p) {
                  var m = pmin(p.id),
                      n = stk(function (i) {
                          return i.pd === p.id;
                      }).length;
                  return (
                      '<tr class="row" tabindex="0" data-pd="' +
                      p.id +
                      '"><td><div class="nm"><div class="thumb" style="background:#3b4a6b"><i>' +
                      p.ic +
                      "</i></div><div><b>" +
                      esc(p.n) +
                      "</b><small>" +
                      (p.set ? SETS[p.set][0] : "Accesorio") +
                      "</small></div></div></td><td>" +
                      ptag(p) +
                      '<span class="chip">' +
                      p.cat +
                      '</span></td><td class="hide">' +
                      sd(p.set) +
                      '</td><td class="num price">' +
                      (m === null ? "Sin stock" : eur(m)) +
                      '</td><td class="num hide">' +
                      n +
                      "</td></tr>"
                  );
              })
              .join("")
        : '<tr><td colspan="5" class="empty">Ningún producto coincide con esos filtros.</td></tr>';
}

// Página de inicio y destacados
function home() {
    var O = mk === "OCG",
        lt = LAT.slice().sort(function (a, b) {
            return DT[b] < DT[a] ? -1 : 1;
        });
    function cn(pf) {
        var it = stk(function (i) {
                return (
                    inMk(i) &&
                    (i.c < 0 ? PR[i.pd].set === pf : CARDS[i.c].pr[i.p].c.split("-")[0] === pf)
                );
            }),
            vs = {};
        it.forEach(function (i) {
            vs[i.v] = 1;
        });
        return it.length + " artículos · " + Object.keys(vs).length + " vendedores";
    }
    var h =
        '<section class="hero2 gl"><h2>Cartas, cajas selladas y accesorios de <b>vendedores del Mercosur</b></h2><p>Mercado ' +
        mk +
        ': compara precios entre tiendas de Argentina, Brasil, Paraguay, Uruguay y Bolivia, mira el historial de cada carta y compra en tu moneda.</p><p><button class="btn" data-go="Todas">Ver cartas</button> <button class="btn" data-go="Productos">Ver cajas y accesorios</button></p></section>';
    h +=
        '<div class="sec">Últimos sets</div><div class="grid">' +
        lt
            .map(function (pf) {
                var s = SETS[pf];
                return (
                    '<button class="tile gl col" data-set="' +
                    pf +
                    '"><b>' +
                    esc(s[0]) +
                    "</b><small>" +
                    SETT[s[1]] +
                    " · " +
                    sd(pf) +
                    '</small><span class="price">' +
                    cn(pf) +
                    "</span></button>"
                );
            })
            .join("") +
        "</div>";
    var fc = CARDS.filter(function (c) {
        return (
            !!c.ocg === O &&
            c.pr.some(function (p) {
                return LAT.indexOf(p.c.split("-")[0]) > -1;
            })
        );
    })
        .map(function (c) {
            var o = stk(function (i) {
                return i.c === c.id;
            });
            return {
                c: c,
                m: o.length
                    ? Math.min.apply(
                          null,
                          o.map(function (x) {
                              return x.pr;
                          })
                      )
                    : null,
                p: c.pr.filter(function (p) {
                    return LAT.indexOf(p.c.split("-")[0]) > -1;
                })[0]
            };
        })
        .sort(function (a, b) {
            return (b.m || 0) - (a.m || 0);
        })
        .slice(0, 8);
    h +=
        '<div class="sec">Cartas destacadas de los últimos sets</div><div class="grid">' +
        fc
            .map(function (x) {
                return (
                    '<button class="tile gl" data-card="' +
                    x.c.id +
                    '">' +
                    thumb(x.c, "thumb") +
                    "<div><b>" +
                    esc(x.c.n) +
                    "</b> " +
                    tg(x.c) +
                    "<small>" +
                    x.p.c +
                    "</small>" +
                    rr(x.p.r) +
                    '<div class="price">' +
                    (x.m === null ? "Sin stock" : "Desde " + eur(x.m)) +
                    "</div></div></button>"
                );
            })
            .join("") +
        "</div>";
    var pp = PR.filter(function (p) {
        return p.set && LAT.indexOf(p.set) > -1 && p.ocg === (O ? 1 : 0);
    });
    h +=
        '<div class="sec">Cajas y sobres de los últimos sets</div><div class="grid">' +
        pp
            .map(function (p) {
                var m = pmin(p.id);
                return (
                    '<button class="tile gl" data-pd="' +
                    p.id +
                    '"><div class="thumb" style="background:#3b4a6b"><i>' +
                    p.ic +
                    "</i></div><div><b>" +
                    esc(p.n) +
                    "</b><small>" +
                    p.cat +
                    '</small><div class="price">' +
                    (m === null ? "Sin stock" : "Desde " + eur(m)) +
                    "</div></div></button>"
                );
            })
            .join("") +
        "</div>";
    $("home").innerHTML = h;
}

// Inventario con cartas y productos
function inv() {
    var id = +$("md").dataset.id,
        q = $("vq").value.toLowerCase(),
        k = $("vk").value,
        cd = +$("vc").value,
        s = $("vs").value;
    var h = stk(function (i) {
        if (i.v !== id) return false;
        if (i.c < 0) return (!k || k === "Producto") && PR[i.pd].n.toLowerCase().indexOf(q) > -1;
        var c = CARDS[i.c];
        return (
            (!k || c.k === k) &&
            i.k <= cd &&
            (c.n + " " + c.pr[i.p].c).toLowerCase().indexOf(q) > -1
        );
    });
    h.sort(function (a, b) {
        return s === "pa" ? a.pr - b.pr : s === "pd" ? b.pr - a.pr : nm(a).localeCompare(nm(b));
    });
    $("vt").innerHTML = h.length
        ? h
              .map(function (i) {
                  if (i.c < 0) {
                      var p = PR[i.pd];
                      return (
                          '<tr><td><button class="lk" data-pd="' +
                          p.id +
                          '">' +
                          esc(p.n) +
                          "</button><small>" +
                          ptag(p) +
                          p.cat +
                          "</small></td><td>" +
                          (p.set ? SETS[p.set][0] : "—") +
                          '</td><td><span class="cond" style="background:#1b7f4d">Nuevo</span></td><td>' +
                          (i.l ? LN[i.l] : "—") +
                          '</td><td class="num">' +
                          i.q +
                          '</td><td class="num price">' +
                          eur(i.pr) +
                          '</td><td class="num"><button class="btn s" data-add="' +
                          i.id +
                          '">Añadir</button></td></tr>'
                      );
                  }
                  var c = CARDS[i.c];
                  return (
                      '<tr><td><button class="lk" data-card="' +
                      c.id +
                      '">' +
                      esc(c.n) +
                      "</button><small>" +
                      tg(c) +
                      c.k +
                      " · " +
                      c.sub.join(" / ") +
                      "</small></td><td>" +
                      printCell(c, i) +
                      "</td><td>" +
                      condCell(i) +
                      "</td><td>" +
                      LN[i.l] +
                      '</td><td class="num">' +
                      i.q +
                      '</td><td class="num price">' +
                      eur(i.pr) +
                      '</td><td class="num"><button class="btn s" data-add="' +
                      i.id +
                      '">Añadir</button></td></tr>'
                  );
              })
              .join("")
        : '<tr><td colspan="7" class="empty">Este vendedor no tiene artículos con esos filtros.</td></tr>';
}

// Carrito con cartas y productos
function add(id) {
    var i = ITEMS[id],
        cur = cart[id] || 0;
    if (cur >= i.q) {
        toast("Solo hay " + i.q + " unidades de " + V[i.v].n);
        return;
    }
    cart[id] = cur + 1;
    count();
    toast(nm(i) + " añadido al carrito");
}

function showCart() {
    var ks = Object.keys(cart),
        sub = 0,
        h =
            '<div class="top"><h2>Tu carrito</h2><button class="ghost" data-close="cart">Cerrar</button></div>';
    if (!ks.length)
        h +=
            '<div class="empty">Tu carrito está vacío. Abre una carta, un producto o el inventario de un vendedor y añade lo que prefieras.</div>';
    else {
        h +=
            "<table><tbody>" +
            ks
                .map(function (k) {
                    var i = ITEMS[k],
                        d;
                    sub += i.pr * cart[k];
                    if (i.c < 0) {
                        var p = PR[i.pd];
                        d =
                            "<b>" +
                            esc(p.n) +
                            "</b> " +
                            ptag(p) +
                            "<small>" +
                            p.cat +
                            " · " +
                            esc(V[i.v].n) +
                            "</small>";
                    } else {
                        var c = CARDS[i.c];
                        d =
                            "<b>" +
                            esc(c.n) +
                            "</b> " +
                            tg(c) +
                            "<small>" +
                            c.pr[i.p].c +
                            " · " +
                            c.pr[i.p].r +
                            " · " +
                            COND[i.k][0] +
                            " · " +
                            LN[i.l] +
                            " · " +
                            esc(V[i.v].n) +
                            "</small>";
                    }
                    return (
                        "<tr><td>" +
                        d +
                        '</td><td class="num">' +
                        cart[k] +
                        " × " +
                        eur(i.pr) +
                        '</td><td class="num"><button class="ghost" data-rm="' +
                        k +
                        '">Quitar</button></td></tr>'
                    );
                })
                .join("") +
            "</tbody></table>";
        var sh = sub >= 25 ? 0 : 2.5;
        h +=
            '<div class="tot sm"><span>Subtotal</span><span>' +
            eur(sub) +
            '</span></div><div class="tot sm" style="padding-top:4px"><span>Envío' +
            (sh ? " (gratis desde " + eur(25) + ")" : "") +
            "</span><span>" +
            (sh ? eur(sh) : "Gratis") +
            '</span></div><div class="tot"><span>Total</span><span>' +
            eur(sub + sh) +
            '</span></div><p style="text-align:right"><button class="btn" data-buy="1">Finalizar compra</button></p>';
    }
    $("cbx").innerHTML = h;
    $("cart").classList.add("on");
}

// Navegación integrada e inicio de la aplicación
var oldList = list;
list = function () {
    if (tab === "Inicio") {
        if ($("q").value) {
            tab = "Todas";
            return init();
        }
        return home();
    }
    if (tab === "Productos") return prods();
    return oldList();
};
init = function () {
    $("tabs").innerHTML = TABS.map(function (t) {
        return (
            '<button aria-pressed="' + (t === tab) + '" data-g="' + t + '">' + TN[t] + "</button>"
        );
    }).join("");
    var v = { Inicio: "home", Productos: "prod", Vendedores: "vend" }[tab] || "cat";
    ["home", "prod", "vend", "cat"].forEach(function (x) {
        $(x).style.display = x === v ? "" : "none";
    });
    if (v === "cat") {
        var all = [];
        if (tab === "Todas") {
            var seen = {};
            ["Monstruo", "Magia", "Trampa"].forEach(function (k) {
                SUBS[k].forEach(function (s) {
                    if (!seen[s]) {
                        seen[s] = 1;
                        all.push(s);
                    }
                });
            });
        } else all = SUBS[tab];
        opts(
            $("sub"),
            all.map(function (s) {
                return [s, s];
            }),
            "Todos los subtipos"
        );
        opts(
            $("rar"),
            Object.keys(RAR).map(function (r) {
                return [r, r];
            }),
            "Todas las rarezas"
        );
        opts(
            $("stp"),
            Object.keys(SETT).map(function (t) {
                return [t, SETT[t]];
            }),
            "Cualquier origen"
        );
    }
    list();
};
$("q").addEventListener("input", function () {
    list();
});
["sub", "rar", "stp", "srt"].forEach(function (i) {
    $(i).addEventListener("change", function () {
        list();
    });
});
// El adaptador de catálogo inicializa la vista al cargar sus módulos.
