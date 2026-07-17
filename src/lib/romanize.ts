// Shows an English translation of a stop/line name alongside its original,
// non-Latin-script text — never a fabricated letter-by-letter romanization
// (e.g. spelling out Hangul syllables), which reads as confusing/wrong and
// doesn't actually tell the traveller what the place IS. Two sources, tried
// in order: OSM's own official English name (name:en / int_name — free,
// exact, no network call beyond what's already fetched for the stop/line
// itself), and, when that's not tagged, a real machine-translated English
// text fetched live and cached — so a stop is NEVER left showing only its
// original script with nothing a Latin-alphabet reader can act on.

import { useEffect, useState } from "react";

// Non-Latin scripts a Latin-alphabet-reading user might not be able to read
// at all — used to decide whether an English name/translation should be
// offered alongside the original. Deliberately broad: covers every script
// the app's stop/line names can realistically come in (Hangul, Kana + CJK
// ideographs, Cyrillic, Greek, Thai, Arabic, Hebrew, Devanagari, and most
// other non-Latin blocks up to Greek Extended). Written entirely with
// \uXXXX escapes (never literal glyphs) so the exact code point ranges are
// unambiguous regardless of editor/font rendering.
const NON_LATIN = new RegExp(
  "[" +
    "\u0370-\u1FFF" + // Greek, Cyrillic, Armenian, Hebrew, Arabic, Devanagari, Thai, Georgian, Hangul Jamo, ...
    "\u2E80-\uA8DF" + // CJK radicals, Hiragana/Katakana, CJK Unified Ideographs, Yi, ...
    "\uAC00-\uD7FF" + // Hangul syllables
    "\uF900-\uFAFF" + // CJK Compatibility Ideographs
    "\uFF66-\uFFDC" + // Halfwidth Katakana / Hangul
  "]",
);

// UI languages written in the Latin alphabet — only these users need an
// English name/translation alongside a non-Latin original; everyone else
// already reads the script the name is actually written in.
const LATIN_LANGS = new Set(["it", "en", "es", "fr", "de", "pt"]);

// Official English names captured from OSM (name:en / int_name), keyed by the
// original stop/line name — e.g. a Seoul bus terminal's Hangul name mapped to
// its official English name. Always preferred over a live translation when
// present, since it's the REAL name the place is known by, not a guess.
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

const TRANSLATE_LS_KEY = "voyager_translate_cache_v1";
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

// MyMemory's free, keyless translation API — same "no API key, generous
// free tier" tier as every other external service this app already calls
// (Nominatim, Overpass, OSRM, BRouter). `langpair=auto|en` auto-detects the
// source script, which is exactly what's needed here (Korean, Japanese,
// Chinese, Russian, Arabic, ... all handled by the same call).
async function fetchTranslation(text: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|en`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { responseData?: { translatedText?: string } };
    const out = (data.responseData?.translatedText ?? "").trim();
    if (!out || out.toLowerCase() === text.trim().toLowerCase()) return null;
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
 * "original (English)" — the English name from OSM when tagged (see
 * registerEnName), otherwise a live-translated English text (see
 * useTranslationTick to be notified once it's ready). Never shows a
 * fabricated transliteration, and never leaves a non-Latin name completely
 * untranslated once the live lookup has had a chance to resolve.
 */
export function withRomanization(text: string | null | undefined, lang?: string): string {
  const s = (text ?? "").trim();
  if (!s) return s;
  if (!LATIN_LANGS.has((lang ?? "").slice(0, 2))) return s; // user already reads a non-Latin script
  if (!NON_LATIN.test(s)) return s;
  const en = enNameOf(s) ?? _translateCache.get(s);
  if (en) return `${s} (${en})`;
  ensureTranslation(s);
  return s;
}
