// Lightweight, dependency-free transliteration to the Latin alphabet.
// Covers the scripts most travellers encounter: Korean (Hangul), Japanese
// (hiragana/katakana), Cyrillic and Greek. Scripts we can't romanize without a
// dictionary (e.g. Chinese/Thai) are left untouched, so nothing wrong is shown.

// ── Hangul (Revised Romanization, simplified — no cross-syllable assimilation) ─
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

// ── Kana (Hepburn-ish). Keys are hiragana; katakana is normalised to hiragana. ─
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

// ── Cyrillic (Russian + a few Ukrainian/Serbian letters) ─────────────────────
const CYRILLIC: Record<string, string> = {
  "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y",
  "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
  "х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"shch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
  "і":"i","ї":"yi","є":"ye","ґ":"g","ђ":"dj","ј":"j","љ":"lj","њ":"nj","ћ":"c","џ":"dz",
};

// ── Greek ────────────────────────────────────────────────────────────────────
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

/** Transliterate supported scripts to Latin; leaves everything else unchanged. */
export function romanize(input: string): string {
  if (!input) return "";
  let out = "";
  let geminate = false; // pending consonant doubling from small tsu っ
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = ch.codePointAt(0) ?? 0;

    // Hangul syllables
    if (code >= 0xac00 && code <= 0xd7a3) { out += hangulSyllable(code); continue; }

    // Kana (hiragana 0x3040–0x309F, katakana 0x30A0–0x30FF)
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

// Scripts we can transliterate (used to decide whether to bother).
const TRANSLITERABLE = /[Ͱ-ϿЀ-ӿ぀-ヿ가-힣]/;
// UI languages written in the Latin alphabet — only these users need a romanisation.
const LATIN_LANGS = new Set(["it", "en", "es", "fr", "de", "pt"]);

// Official English names captured from OSM (name:en / int_name), keyed by the
// original stop/line name. Preferred over a raw transliteration when present
// (e.g. "고속터미널" → "Seoul Express Bus Terminal" rather than "Gosogteomineol").
const EN_NAMES = new Map<string, string>();
export function registerEnName(original?: string | null, en?: string | null): void {
  const o = (original ?? "").trim();
  const e = (en ?? "").trim();
  if (o && e && o !== e) EN_NAMES.set(o, e);
}
export function enNameOf(original?: string | null): string | undefined {
  return EN_NAMES.get((original ?? "").trim());
}

// Capitalise the first letter of each word (after space or common separators).
function titleCase(s: string): string {
  return s.replace(/(^|[\s([/–—-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/**
 * If `text` is written in a script foreign to a Latin-alphabet user, returns
 * "original (english or romanisation)"; otherwise returns the text unchanged.
 */
export function withRomanization(text: string | null | undefined, lang?: string): string {
  const s = (text ?? "").trim();
  if (!s) return s;
  if (!LATIN_LANGS.has((lang ?? "").slice(0, 2))) return s; // user already reads a non-Latin script
  if (!TRANSLITERABLE.test(s)) return s;
  const en = enNameOf(s);
  if (en) return `${s} (${en})`;
  const roman = titleCase(romanize(s).trim());
  if (!roman || roman === s || !/[a-zA-Z]/.test(roman)) return s;
  return `${s} (${roman})`;
}
