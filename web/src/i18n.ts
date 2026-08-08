import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ta from "./locales/ta.json";
import en from "./locales/en.json";

export const LANGUAGES = [
  { code: "ta", label: "தமிழ்" },
  { code: "en", label: "English" },
] as const;

const stored = localStorage.getItem("lang");

i18n.use(initReactI18next).init({
  resources: {
    ta: { translation: ta },
    en: { translation: en },
  },
  lng: stored ?? "ta", // Tamil is the default language
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(code: string) {
  localStorage.setItem("lang", code);
  i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

document.documentElement.lang = i18n.language;

export default i18n;
