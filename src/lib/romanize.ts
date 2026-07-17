// Shows the REAL English name of a stop/line alongside its original,
// non-Latin-script name, instead of a fabricated letter-by-letter
// romanization. A guessed romanization (e.g. Hangul syllables spelled out
// letter-by-letter) often reads as confusing/wrong to the traveller and
// doesn't actually help them recognise the place on a sign or ticket — the
// official English name (when OSM tags one via name:en / int_name) is the
// only thing worth showing, and only when we actually have it.

// Non-Latin scripts a Latin-alphabet-reading user might not be able to read
// at all — used to decide whether an English name should be offered
// alongside the original. Deliberately broad: covers every script the
// app's stop/line names can realistically come in (Hangul, Kana + CJK
// ideographs, Cyrillic, Greek, Thai, Arabic, Hebrew, Devanagari, and most
// other non-Latin blocks up to Greek Extended), not just the handful of
// scripts a transliteration table could ever cover — Chinese hanzi in
// particular used to be excluded from this check entirely (there's no
// simple letter-by-letter transliteration scheme for it), which meant a
// Chinese stop's English name was never shown even when OSM had one tagged.
// Written entirely with \uXXXX escapes (never literal glyphs) so the exact
// code point ranges are unambiguous regardless of editor/font rendering.
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
// English name alongside a non-Latin original; everyone else already reads
// the script the name is actually written in.
const LATIN_LANGS = new Set(["it", "en", "es", "fr", "de", "pt"]);

// Official English names captured from OSM (name:en / int_name), keyed by the
// original stop/line name — e.g. a Seoul bus terminal's Hangul name mapped to
// its official English name.
const EN_NAMES = new Map<string, string>();
export function registerEnName(original?: string | null, en?: string | null): void {
  const o = (original ?? "").trim();
  const e = (en ?? "").trim();
  if (o && e && o !== e) EN_NAMES.set(o, e);
}
export function enNameOf(original?: string | null): string | undefined {
  return EN_NAMES.get((original ?? "").trim());
}

/**
 * If `text` is written in a script foreign to a Latin-alphabet user AND a
 * real English name is known for it (see registerEnName), returns
 * "original (English name)". Otherwise returns the text unchanged — no
 * invented transliteration is ever shown, since a wrong-looking guess is
 * worse than just the original script alone.
 */
export function withRomanization(text: string | null | undefined, lang?: string): string {
  const s = (text ?? "").trim();
  if (!s) return s;
  if (!LATIN_LANGS.has((lang ?? "").slice(0, 2))) return s; // user already reads a non-Latin script
  if (!NON_LATIN.test(s)) return s;
  const en = enNameOf(s);
  return en ? `${s} (${en})` : s;
}
