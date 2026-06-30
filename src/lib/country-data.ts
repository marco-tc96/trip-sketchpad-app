import { Country, City } from "country-state-city";

export type CountryEntry = { iso: string; name: string; currency: string; flag: string };

export function flagOf(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

let _countries: CountryEntry[] | null = null;
export function allCountries(): CountryEntry[] {
  if (_countries) return _countries;
  _countries = Country.getAllCountries()
    .map((c) => ({
      iso: c.isoCode,
      name: c.name,
      currency: c.currency,
      flag: flagOf(c.isoCode),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return _countries;
}

export function countryByIso(iso: string): CountryEntry | undefined {
  return allCountries().find((c) => c.iso === iso.toUpperCase());
}

const _displayNamesCache = new Map<string, Intl.DisplayNames>();
function getDisplayNames(lang: string): Intl.DisplayNames | null {
  if (typeof Intl === "undefined" || !("DisplayNames" in Intl)) return null;
  let dn = _displayNamesCache.get(lang);
  if (!dn) {
    try {
      dn = new Intl.DisplayNames([lang], { type: "region" });
      _displayNamesCache.set(lang, dn);
    } catch {
      return null;
    }
  }
  return dn;
}

export function countryNameLocalized(iso: string, lang: string): string {
  const ISO = iso.toUpperCase();
  const dn = getDisplayNames(lang);
  if (dn) {
    try {
      const v = dn.of(ISO);
      if (v) return v;
    } catch {
      /* ignore */
    }
  }
  return countryByIso(ISO)?.name ?? ISO;
}

export function localizedCountries(lang: string): CountryEntry[] {
  return allCountries()
    .map((c) => ({ ...c, name: countryNameLocalized(c.iso, lang) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

export type CityEntry = {
  name: string;
  country: string;
  flag: string;
  lat?: number;
  lng?: number;
};

// A handful of city-states / territories return an empty list from the
// country-state-city city dataset, even though they're valid ISO
// countries someone can pick as a trip destination. For these, the
// country itself doubles as its one "city" so it remains selectable.
const CITYLESS_FALLBACK: Record<string, string> = {
  HK: "Hong Kong",
  MO: "Macao",
  SG: "Singapore",
  VA: "Vatican City",
  MC: "Monaco",
  GI: "Gibraltar",
};

// Common cities don't come translated from the underlying dataset (always
// English, e.g. "Milan", "Rome", "Florence", "London"). This maps a small
// set of major/frequently-traveled cities to their localized name per
// language, covering the languages this app supports. Cities not listed
// here fall back to their original (English) name, since a full
// city-translation dataset is impractical to hand-maintain.
const CITY_NAME_OVERRIDES: Record<string, Record<string, string>> = {
  Milan: { it: "Milano", es: "Milán", fr: "Milan", de: "Mailand", pt: "Milão" },
  Rome: { it: "Roma", es: "Roma", fr: "Rome", de: "Rom", pt: "Roma" },
  Florence: { it: "Firenze", es: "Florencia", fr: "Florence", de: "Florenz", pt: "Florença" },
  Venice: { it: "Venezia", es: "Venecia", fr: "Venise", de: "Venedig", pt: "Veneza" },
  Naples: { it: "Napoli", es: "Nápoles", fr: "Naples", de: "Neapel", pt: "Nápoles" },
  Turin: { it: "Torino", es: "Turín", fr: "Turin", de: "Turin", pt: "Turim" },
  Genoa: { it: "Genova", es: "Génova", fr: "Gênes", de: "Genua", pt: "Génova" },
  London: { it: "Londra", es: "Londres", fr: "Londres", de: "London", pt: "Londres" },
  Paris: { it: "Parigi", es: "París", fr: "Paris", de: "Paris", pt: "Paris" },
  Munich: { it: "Monaco di Baviera", es: "Múnich", fr: "Munich", de: "München", pt: "Munique" },
  Cologne: { it: "Colonia", es: "Colonia", fr: "Cologne", de: "Köln", pt: "Colónia" },
  Vienna: { it: "Vienna", es: "Viena", fr: "Vienne", de: "Wien", pt: "Viena" },
  Lisbon: { it: "Lisbona", es: "Lisboa", fr: "Lisbonne", de: "Lissabon", pt: "Lisboa" },
  Seville: { it: "Siviglia", es: "Sevilla", fr: "Séville", de: "Sevilla", pt: "Sevilha" },
  Athens: { it: "Atene", es: "Atenas", fr: "Athènes", de: "Athen", pt: "Atenas" },
  Prague: { it: "Praga", es: "Praga", fr: "Prague", de: "Prag", pt: "Praga" },
  Warsaw: { it: "Varsavia", es: "Varsovia", fr: "Varsovie", de: "Warschau", pt: "Varsóvia" },
  Brussels: { it: "Bruxelles", es: "Bruselas", fr: "Bruxelles", de: "Brüssel", pt: "Bruxelas" },
  Moscow: { it: "Mosca", es: "Moscú", fr: "Moscou", de: "Moskau", pt: "Moscovo" },
  "New York": { it: "New York", es: "Nueva York", fr: "New York", de: "New York", pt: "Nova Iorque" },
  Cairo: { it: "Il Cairo", es: "El Cairo", fr: "Le Caire", de: "Kairo", pt: "Cairo" },
  Beijing: { it: "Pechino", es: "Pekín", fr: "Pékin", de: "Peking", pt: "Pequim" },
  Tokyo: { it: "Tokyo", es: "Tokio", fr: "Tokyo", de: "Tokio", pt: "Tóquio" },
  Seoul: { it: "Seul", es: "Seúl", fr: "Séoul", de: "Seoul", pt: "Seul" },
  Geneva: { it: "Ginevra", es: "Ginebra", fr: "Genève", de: "Genf", pt: "Genebra" },
  Zurich: { it: "Zurigo", es: "Zúrich", fr: "Zurich", de: "Zürich", pt: "Zurique" },
};

export function cityNameLocalized(name: string, lang: string): string {
  const base = lang.split("-")[0];
  const overrides = CITY_NAME_OVERRIDES[name];
  if (overrides && overrides[base]) return overrides[base];
  return name;
}

export function citiesOfCountry(iso: string): CityEntry[] {
  const ISO = iso.toUpperCase();
  const flag = flagOf(ISO);
  const seen = new Set<string>();
  const out: CityEntry[] = [];
  for (const c of City.getCitiesOfCountry(ISO) ?? []) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    const lat = c.latitude ? Number(c.latitude) : undefined;
    const lng = c.longitude ? Number(c.longitude) : undefined;
    out.push({
      name: c.name,
      country: ISO,
      flag,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });
  }
  if (out.length === 0 && CITYLESS_FALLBACK[ISO]) {
    out.push({ name: CITYLESS_FALLBACK[ISO], country: ISO, flag });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Historical currency map ---
type Change = { until: string; currency: string };
const HISTORY: Record<string, Change[]> = {
  HR: [{ until: "2023-01-01", currency: "HRK" }],
  LT: [{ until: "2015-01-01", currency: "LTL" }],
  LV: [{ until: "2014-01-01", currency: "LVL" }],
  EE: [{ until: "2011-01-01", currency: "EEK" }],
  SK: [{ until: "2009-01-01", currency: "SKK" }],
  MT: [{ until: "2008-01-01", currency: "MTL" }],
  CY: [{ until: "2008-01-01", currency: "CYP" }],
  SI: [{ until: "2007-01-01", currency: "SIT" }],
  GR: [{ until: "2001-01-01", currency: "GRD" }],
  DE: [{ until: "1999-01-01", currency: "DEM" }],
  FR: [{ until: "1999-01-01", currency: "FRF" }],
  IT: [{ until: "1999-01-01", currency: "ITL" }],
  ES: [{ until: "1999-01-01", currency: "ESP" }],
  PT: [{ until: "1999-01-01", currency: "PTE" }],
  NL: [{ until: "1999-01-01", currency: "NLG" }],
  BE: [{ until: "1999-01-01", currency: "BEF" }],
  LU: [{ until: "1999-01-01", currency: "LUF" }],
  AT: [{ until: "1999-01-01", currency: "ATS" }],
  FI: [{ until: "1999-01-01", currency: "FIM" }],
  IE: [{ until: "1999-01-01", currency: "IEP" }],
  TR: [{ until: "2005-01-01", currency: "TRL" }],
};

export function currencyForCountryAt(iso: string, dateISO: string): string | null {
  const ISO = iso.toUpperCase();
  const changes = HISTORY[ISO];
  if (changes) {
    for (const ch of changes) {
      if (dateISO < ch.until) return ch.currency;
    }
  }
  return countryByIso(ISO)?.currency ?? null;
}

export function coverPhotoFor(query: string, seed = 1): string {
  const q = encodeURIComponent(`${query},cityscape,travel`);
  return `https://loremflickr.com/800/400/${q}?lock=${seed}`;
}

export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
