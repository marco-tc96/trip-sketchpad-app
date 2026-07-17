// Shows an English translation of a stop/line name alongside its original,
// non-Latin-script text. Preference order: OSM's own official English name
// (name:en / int_name — free, exact, no network call beyond what's already
// fetched for the stop/line itself); a real machine-translated English text,
// fetched live and cached; and, only while that's still pending (or if the
// live lookup genuinely fails/isn't supported for the script), a letter-by-
// letter romanization for the handful of scripts that have a simple,
// well-defined one (Hangul, Kana, Cyrillic, Greek) — better than showing
// nothing actionable, but always superseded by a real name/translation the
// moment one becomes available, since it re-renders via useTranslationTick.

import { useEffect, useState } from "react";

// ── Letter-by-letter romanization (Revised Romanization for Hangul,
// Hepburn-ish for Kana, standard tables for Cyrillic/Greek) — used ONLY as
// an immediate, synchronous fallback while a live translation is pending or
// unavailable. Scripts without a simple 1:1 letter mapping (Chinese hanzi,
// Thai, Arabic, Hebrew, Devanagari, ...) have no romanization table here —
// for those, the original text is shown alone until a live translation (or
// an OSM English name) resolves, rather than guessing.
const HANGUL_LEAD = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const HANGUL_VOWEL = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
const HANGUL_TAIL = ["","g","kk","ks","n","nj","nh","d","l","lg","lm","lb","ls","lt","lp","lh","m","b","bs","s","ss","ng","j","ch","k","t","p","h"];

function hangulSyllable(code: number): string {
  const idx = code - 0xac00;
  const lead = Math.floor(idx / 588);
  const vowel = Math.floor((idx % 588) / 28);
  const tail = idx % 28;
  return (HANGUL_LEAD[lead] ?? "") + (HANGUL_VOWEL[vowel] ?? "") + (HANGUL_TAIL[tail] ?? "");
}

// Kana (hiragana keys; katakana is normalised to hiragana before lookup).
const KANA: Record<string, string> = {
  "あ":"a","い":"i","う":"u","え":"e","お":"o",
  "か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko",
  "が":"ga","ぎ":"gi","ぐ":"gu","げ":"ge","ご":"go",
  "さ":"sa","し":"shi","す":"su","せ":"se","そ":"so",
  "ざ":"za","じ":"ji","ず":"zu","ぜ":"ze","ぞ":"zo",
  "た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to",
  "だ":"da","ぢ":"ji","づ":"zu","で":"de","ど":"do",
  "な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no",
  "は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho",
  "ば":"ba","び":"bi","ぶ":"bu","べ":"be","ぼ":"bo",
  "ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po",
  "ま":"ma","み":"mi","む":"mu","め":"me","も":"mo",
  "や":"ya","ゆ":"yu","よ":"yo",
  "ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro",
  "わ":"wa","ゐ":"i","ゑ":"e","を":"o","ん":"n",
  "ゔ":"vu","ー":"-","、":", ","。":". ","　":" ",
};

// Cyrillic (Russian + a few Ukrainian/Serbian letters).
const CYRILLIC: Record<string, string> = {
  "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y",
  "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
  "х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"shch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
  "і":"i","ї":"yi","є":"ye","ґ":"g","ђ":"dj","ј":"j","љ":"lj","њ":"nj","ѣ":"c","џ":"dz",
};

// Greek.
const GREEK: Record<string, string> = {
  "α":"a","β":"v","γ":"g","δ":"d","ε":"e","ζ":"z","η":"i","θ":"th","ι":"i","κ":"k","λ":"l",
  "μ":"m","ν":"n","ξ":"x","ο":"o","π":"p","ρ":"r","σ":"s","ς":"s","τ":"t","υ":"y","φ":"f",
  "χ":"ch","ψ":"ps","ω":"o",
  "ά":"a","έ":"e","ή":"i","ί":"i","ό":"o","ύ":"y","ώ":"o","ϊ":"i","ϋ":"y","ΐ":"i","ΰ":"y",
};

// Preserve the original letter's case on the romanised output.
function matchCase(roman: string, original: string): string {
  if (!roman) return roman;
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return roman.charAt(0).toUpperCase() + roman.slice(1);
  }
  return roman;
}

const SMALL_Y: Record<string, string> = { "ゃ": "a", "ゅ": "u", "ょ": "o" };

/** Transliterate the scripts we have a simple table for; leaves everything else unchanged. */
function romanize(input: string): string {
  if (!input) return "";
  let out = "";
  let geminate = false; // pending consonant doubling from small tsu っ
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = ch.codePointAt(0) ?? 0;

    // Hangul syllables
    if (code >= 0xac00 && code <= 0xd7a3) { out += hangulSyllable(code); continue; }

    // Kana (hiragana 0x3040-0x309F, katakana 0x30A0-0x30FF)
    if ((code >= 0x3041 && code <= 0x309f) || (code >= 0x30a1 && code <= 0x30ff)) {
      const hira = code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : ch;
      if (hira === "っ") { geminate = true; continue; }
      const next = input[i + 1];
      const nextCode = next ? next.codePointAt(0) ?? 0 : 0;
      const nextHira = nextCode >= 0x30a1 && nextCode <= 0x30f6 ? String.fromCharCode(nextCode - 0x60) : next;
      let roman: string;
      if (nextHira && SMALL_Y[nextHira] && KANA[hira] && KANA[hira].endsWith("i")) {
        const base = KANA[hira].slice(0, -1);
        const v = SMALL_Y[nextHira];
        roman = base === "sh" || base === "ch" || base === "j" ? base + v : base + "y" + v;
        i++; // consume the small kana
      } else {
        roman = KANA[hira] ?? ch;
      }
      if (geminate && /^[a-z]/.test(roman)) { roman = roman[0] + roman; geminate = false; }
      out += roman;
      continue;
    }

    const low = ch.toLowerCase();
    if (CYRILLIC[low] !== undefined) { out += matchCase(CYRILLIC[low], ch); continue; }
    if (GREEK[low] !== undefined) { out += matchCase(GREEK[low], ch); continue; }

    out += ch;
  }
  return out;
}

// Scripts the table above can actually romanize letter-by-letter (Hangul,
// Kana, Cyrillic, Greek) — used ONLY to decide whether the synchronous
// fallback below has anything useful to offer while a translation is
// pending. Chinese/Thai/Arabic/etc. are deliberately excluded: there's no
// simple 1:1 letter mapping for them, so a "romanization" would just be
// wrong/misleading rather than merely rough.
const ROMANIZABLE = /[Ͱ-ϿЀ-ӿぁ-ヿ가-힣]/;

// Non-Latin scripts a Latin-alphabet-reading user might not be able to read
// at all — used to decide whether an English name/translation/romanization
// should be offered alongside the original. Deliberately broad: covers
// every script the app's stop/line names can realistically come in (Hangul,
// Kana + CJK ideographs, Cyrillic, Greek, Thai, Arabic, Hebrew, Devanagari,
// and most other non-Latin blocks up to Greek Extended). Written entirely
// with \uXXXX escapes (never literal glyphs) so the exact code point ranges
// are unambiguous regardless of editor/font rendering.
const NON_LATIN = new RegExp(
  "[" +
    "Ͱ-῿" + // Greek, Cyrillic, Armenian, Hebrew, Arabic, Devanagari, Thai, Georgian, Hangul Jamo, ...
    "⺀-꣟" + // CJK radicals, Hiragana/Katakana, CJK Unified Ideographs, Yi, ...
    "가-퟿" + // Hangul syllables
    "豈-﫿" + // CJK Compatibility Ideographs
    "ｦ-ￜ" + // Halfwidth Katakana / Hangul
  "]",
);

// UI languages written in the Latin alphabet — only these users need an
// English name/translation/romanization alongside a non-Latin original;
// everyone else already reads the script the name is actually written in.
const LATIN_LANGS = new Set(["it", "en", "es", "fr", "de", "pt"]);

// Official English names captured from OSM (name:en / int_name), keyed by the
// original stop/line name — e.g. a Seoul bus terminal's Hangul name mapped to
// its official English name. Always preferred over a live translation or a
// romanization when present, since it's the REAL name the place is known by.
const EN_NAMES = new Map<string, string>();
export function registerEnName(original?: string | null, en?: string | null): void {
  const o = (original ?? "").trim();
  const e = (en ?? "").trim();
  if (o && e && o !== e) EN_NAMES.set(o, e);
}
export function enNameOf(original?: string | null): string | undefined {
  return EN_NAMES.get((original ?? "").trim());
}

// ── Live translation fallback, for a non-Latin name OSM never tagged an
// English name for — persisted + in-memory cached, so the same stop is
// never translated twice, and a background fetch's result is broadcast to
// every subscribed component via a tiny pub/sub (see useTranslationTick).
const _translateCache = new Map<string, string>();
const _translateInFlight = new Set<string>();
const _translateListeners = new Set<() => void>();
function _notifyTranslationUpdate(): void {
  for (const cb of _translateListeners) cb();
}

const TRANSLATE_LS_KEY = "voyager_translate_cache_v2";
const TRANSLATE_CAP = 500;
(function loadTranslateCache() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(TRANSLATE_LS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(o)) _translateCache.set(k, v);
  } catch { /* ignore corrupt/unavailable storage */ }
})();
let _translateFlushTimer: ReturnType<typeof setTimeout> | null = null;
function _persistTranslateCache(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const entries = [..._translateCache.entries()];
    const capped = entries.length > TRANSLATE_CAP ? entries.slice(entries.length - TRANSLATE_CAP) : entries;
    localStorage.setItem(TRANSLATE_LS_KEY, JSON.stringify(Object.fromEntries(capped)));
  } catch { /* ignore quota errors */ }
}
function _scheduleTranslatePersist(): void {
  if (_translateFlushTimer) clearTimeout(_translateFlushTimer);
  _translateFlushTimer = setTimeout(_persistTranslateCache, 1200);
}

// MyMemory's translation API needs a REAL source-language code — "auto" is
// rejected outright (the exact failure reported: MyMemory doesn't return an
// HTTP error for it, it returns HTTP 200 with the error MESSAGE sitting in
// responseData.translatedText as if it were the translation, so a naive
// "did the request succeed" check let that error text straight through and
// displayed it to the user as a "translation"). Detecting the source script
// ourselves and passing its real ISO/BCP-47 code avoids that failure mode
// entirely, and only ever calls the API for a script we're confident about.
function detectSourceLang(s: string): string | null {
  if (/[ᄀ-ᇿ㄰-㆏가-힣]/.test(s)) return "ko";
  const hasKana = /[぀-ヿ]/.test(s);
  const hasHan = /[一-鿿㐀-䶿豈-﫿]/.test(s);
  if (hasKana) return "ja"; // kanji+kana mixed text is Japanese, never Chinese
  if (hasHan) return "zh-CN";
  if (/[Ѐ-ӿ]/.test(s)) return "ru";
  if (/[Ͱ-Ͽ]/.test(s)) return "el";
  if (/[֐-׿]/.test(s)) return "he";
  if (/[؀-ۿ]/.test(s)) return "ar";
  if (/[฀-๿]/.test(s)) return "th";
  if (/[ऀ-ॿ]/.test(s)) return "hi";
  if (/[Ⴀ-ჿ]/.test(s)) return "ka";
  if (/[԰-֏]/.test(s)) return "hy";
  return null;
}

// A handful of diagnostic phrases MyMemory embeds INSIDE translatedText (not
// as a proper HTTP error) when something about the request itself is wrong
// (bad langpair, no quota left, ...) — checked so that text is never shown
// to the user as if it were a real translation.
const _looksLikeApiError = (s: string): boolean =>
  /INVALID (SOURCE|TARGET) LANGUAGE/i.test(s) ||
  /IS AN INVALID/i.test(s) ||
  /MYMEMORY WARNING/i.test(s) ||
  /QUERY LENGTH LIMIT/i.test(s);

async function fetchTranslation(text: string): Promise<string | null> {
  const src = detectSourceLang(text);
  if (!src) return null; // unrecognised script — don't call the API with a guess
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|en`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
    // MyMemory can report the real outcome via `responseStatus` even on an
    // HTTP 200 response — reject anything that isn't an explicit success.
    if (data.responseStatus !== undefined && Number(data.responseStatus) !== 200) return null;
    const out = (data.responseData?.translatedText ?? "").trim();
    if (!out || _looksLikeApiError(out)) return null;
    if (out.toLowerCase() === text.trim().toLowerCase()) return null;
    return out;
  } catch {
    return null;
  }
}

// Kicks off (at most once per string) a background translation — never
// awaited by the caller, since `withRomanization` itself must stay
// synchronous for use directly inside render. The result lands in the
// cache and every subscribed component re-renders (see useTranslationTick)
// to pick it up on the next render, same pattern as this file's own
// enNameOf/registerEnName for OSM-tagged names.
function ensureTranslation(text: string): void {
  const key = text.trim();
  if (!key || _translateCache.has(key) || _translateInFlight.has(key)) return;
  _translateInFlight.add(key);
  fetchTranslation(key)
    .then((res) => {
      _translateInFlight.delete(key);
      if (res) {
        _translateCache.set(key, res);
        _scheduleTranslatePersist();
        _notifyTranslationUpdate();
      }
    })
    .catch(() => { _translateInFlight.delete(key); });
}

// Call ONCE per component that renders any withRomanization(...) output —
// NOT per list item (it subscribes to a shared pub/sub, so one call per
// component is enough to re-render that whole component's list when any of
// its translations arrive). Returns a tick number that changes on every
// translation update; the return value itself doesn't need to be used —
// just calling the hook is what wires up the re-render.
export function useTranslationTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    _translateListeners.add(cb);
    return () => { _translateListeners.delete(cb); };
  }, []);
  return tick;
}

/**
 * If `text` is written in a script foreign to a Latin-alphabet user, returns
 * "original (shown form)". The shown form is, in order of preference: the
 * OSM-tagged English name (see registerEnName); a live-translated English
 * text (see useTranslationTick to be notified once it's ready); or, only
 * while neither of those is available yet, a letter-by-letter romanization
 * for the scripts that have a simple one (Hangul/Kana/Cyrillic/Greek).
 * Scripts with no romanization table (Chinese, Thai, Arabic, ...) show the
 * original alone until a real name/translation resolves. A background
 * translation is always kicked off regardless, so even a romanized result
 * gets upgraded to the real thing the moment it's ready.
 */
export function withRomanization(text: string | null | undefined, lang?: string): string {
  const s = (text ?? "").trim();
  if (!s) return s;
  if (!LATIN_LANGS.has((lang ?? "").slice(0, 2))) return s; // user already reads a non-Latin script
  if (!NON_LATIN.test(s)) return s;
  const en = enNameOf(s) ?? _translateCache.get(s);
  ensureTranslation(s);
  if (en) return `${s} (${en})`;
  if (ROMANIZABLE.test(s)) {
    const roman = romanize(s).trim();
    if (roman && roman !== s && /[a-zA-Z]/.test(roman)) {
      const cap = roman.charAt(0).toUpperCase() + roman.slice(1);
      return `${s} (${cap})`;
    }
  }
  return s;
}
