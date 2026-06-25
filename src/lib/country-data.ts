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

export type CityEntry = { name: string; country: string; flag: string };

export function citiesOfCountry(iso: string): CityEntry[] {
  const flag = flagOf(iso);
  const seen = new Set<string>();
  const out: CityEntry[] = [];
  for (const c of City.getCitiesOfCountry(iso) ?? []) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push({ name: c.name, country: iso, flag });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Historical currency map ---
// Returns the currency code that was in circulation in `iso` on `dateISO`.
// Falls back to the current currency from country-state-city.
type Change = { until: string; currency: string }; // currency used UNTIL `until` (exclusive)
const HISTORY: Record<string, Change[]> = {
  // Eurozone joiners — before the date, the legacy currency was used.
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
  // Turkey redenomination (old lira to new)
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

// Build a stable photo URL for a city or country query.
export function coverPhotoFor(query: string, seed = 1): string {
  const q = encodeURIComponent(`${query},cityscape,travel`);
  return `https://loremflickr.com/800/400/${q}?lock=${seed}`;
}

export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}