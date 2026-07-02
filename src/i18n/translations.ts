export type Lang = "it" | "en" | "fr" | "de" | "es" | "pt" | "zh" | "ko" | "ja";

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
];

import it from "./locales/it";
import en from "./locales/en";
import fr from "./locales/fr";
import de from "./locales/de";
import es from "./locales/es";
import pt from "./locales/pt";
import zh from "./locales/zh";
import ko from "./locales/ko";
import ja from "./locales/ja";

export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  it,
  en,
  fr,
  de,
  es,
  pt,
  zh,
  ko,
  ja,
};
