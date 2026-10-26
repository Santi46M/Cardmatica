// The visitor's language for the modules: t() translates a Spanish text, and
// locale formats dates and numbers. See frontend/i18n.js.
export const t = (text, values) => window.t(text, values);
export const lang = window.I18N.lang;
export const locale = window.I18N.locale;
