import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { TRANSLATIONS, type Lang } from "./translations";

if (!i18n.isInitialized) {
  const initial: Lang =
    (typeof window !== "undefined" &&
      (localStorage.getItem("voyager.lang") as Lang)) || "it";

  i18n.use(initReactI18next).init({
    resources: Object.fromEntries(
      Object.entries(TRANSLATIONS).map(([k, v]) => [k, { translation: v }]),
    ),
    lng: initial,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export function setLanguage(lang: Lang) {
  i18n.changeLanguage(lang);
  if (typeof window !== "undefined") localStorage.setItem("voyager.lang", lang);
}

export default i18n;