// Flag-derived background gradients used as the default trip cover.
// Curated palette per country (most-common Lovable destinations) with a
// deterministic hash fallback so unknown ISO codes still get stable colors.

const FLAG_COLORS: Record<string, string[]> = {
  IT: ["#009246", "#FFFFFF", "#CE2B37"],
  FR: ["#0055A4", "#FFFFFF", "#EF4135"],
  DE: ["#000000", "#DD0000", "#FFCE00"],
  ES: ["#AA151B", "#F1BF00"],
  GB: ["#012169", "#FFFFFF", "#C8102E"],
  US: ["#B22234", "#FFFFFF", "#3C3B6E"],
  PT: ["#006600", "#FF0000"],
  NL: ["#AE1C28", "#FFFFFF", "#21468B"],
  BE: ["#000000", "#FAE042", "#ED2939"],
  CH: ["#FF0000", "#FFFFFF"],
  AT: ["#ED2939", "#FFFFFF"],
  GR: ["#0D5EAF", "#FFFFFF"],
  IE: ["#169B62", "#FFFFFF", "#FF883E"],
  SE: ["#006AA7", "#FECC00"],
  NO: ["#EF2B2D", "#FFFFFF", "#002868"],
  DK: ["#C8102E", "#FFFFFF"],
  FI: ["#003580", "#FFFFFF"],
  PL: ["#FFFFFF", "#DC143C"],
  CZ: ["#11457E", "#FFFFFF", "#D7141A"],
  HU: ["#CD2A3E", "#FFFFFF", "#436F4D"],
  RO: ["#002B7F", "#FCD116", "#CE1126"],
  BG: ["#FFFFFF", "#00966E", "#D62612"],
  HR: ["#FF0000", "#FFFFFF", "#171796"],
  TR: ["#E30A17", "#FFFFFF"],
  RU: ["#FFFFFF", "#0033A0", "#DA291C"],
  UA: ["#005BBB", "#FFD500"],
  JP: ["#FFFFFF", "#BC002D"],
  KR: ["#FFFFFF", "#003478", "#C60C30"],
  CN: ["#DE2910", "#FFDE00"],
  IN: ["#FF9933", "#FFFFFF", "#138808"],
  TH: ["#A51931", "#FFFFFF", "#2D2A4A"],
  VN: ["#DA251D", "#FFFF00"],
  ID: ["#FF0000", "#FFFFFF"],
  PH: ["#0038A8", "#CE1126", "#FCD116"],
  MY: ["#CC0001", "#010066", "#FFCC00"],
  SG: ["#ED2E38", "#FFFFFF"],
  AU: ["#012169", "#FFFFFF", "#E4002B"],
  NZ: ["#012169", "#FFFFFF", "#C8102E"],
  CA: ["#FF0000", "#FFFFFF"],
  MX: ["#006847", "#FFFFFF", "#CE1126"],
  BR: ["#009C3B", "#FFDF00", "#002776"],
  AR: ["#74ACDF", "#FFFFFF", "#F6B40E"],
  CL: ["#0039A6", "#FFFFFF", "#D52B1E"],
  PE: ["#D91023", "#FFFFFF"],
  CO: ["#FCD116", "#003893", "#CE1126"],
  EG: ["#CE1126", "#FFFFFF", "#000000"],
  MA: ["#C1272D", "#006233"],
  ZA: ["#007749", "#FFB81C", "#DE3831", "#002395"],
  KE: ["#000000", "#BB0000", "#006600"],
  AE: ["#00732F", "#000000", "#FF0000"],
  SA: ["#006C35", "#FFFFFF"],
  IL: ["#FFFFFF", "#0038B8"],
  IS: ["#02529C", "#FFFFFF", "#DC1E35"],
  LU: ["#ED2939", "#FFFFFF", "#00A1DE"],
  MT: ["#FFFFFF", "#CF142B"],
  CY: ["#FFFFFF", "#D57800"],
  EE: ["#0072CE", "#000000", "#FFFFFF"],
  LV: ["#9E1B32", "#FFFFFF"],
  LT: ["#FDBA0B", "#006A44", "#C22033"],
  SI: ["#0000FF", "#FF0000", "#FFFFFF"],
  SK: ["#0B4EA2", "#EE1C25", "#FFFFFF"],
};

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function fallbackColors(iso: string): string[] {
  const h = hashHue(iso || "??");
  return [
    `hsl(${h} 70% 45%)`,
    `hsl(${(h + 40) % 360} 65% 55%)`,
    `hsl(${(h + 80) % 360} 60% 40%)`,
  ];
}

// White-ish colors don't render well at full opacity in a background, so we
// keep them as soft accents only.
function isPaleWhite(hex: string): boolean {
  const c = hex.toUpperCase();
  return c === "#FFFFFF" || c === "#FFF";
}

export function flagGradient(isoCodes: string[] | undefined | null): string {
  const codes = (isoCodes ?? [])
    .map((c) => c.toUpperCase())
    .filter(Boolean);

  if (codes.length === 0) {
    return `linear-gradient(135deg, ${fallbackColors("??").join(", ")})`;
  }

  // Single-country: preserve original behavior exactly
  if (codes.length === 1) {
    const iso = codes[0];
    const raw = FLAG_COLORS[iso] ?? fallbackColors(iso);
    let stops = raw.filter((c) => !isPaleWhite(c));
    if (stops.length < 2) stops = raw.slice();
    stops = stops.slice(0, 3);
    if (stops.length === 1) stops.push(stops[0]);
    return `linear-gradient(135deg, ${stops.join(", ")})`;
  }

  // Multi-country: blend up to 2 representative colors per flag.
  // White is excluded per-country (doesn't blend well between flags);
  // if a country has no non-white colors, we fall back to its first raw color.
  const stops: string[] = [];
  for (const iso of codes) {
    const raw = FLAG_COLORS[iso] ?? fallbackColors(iso);
    const nonWhite = raw.filter((c) => !isPaleWhite(c));
    const picks = nonWhite.length > 0 ? nonWhite.slice(0, 2) : raw.slice(0, 1);
    stops.push(...picks);
  }

  // Cap total stops at 6 to avoid an overwhelming number of color bands.
  const capped = stops.slice(0, 6);

  if (capped.length === 0) {
    return `linear-gradient(135deg, ${fallbackColors(codes[0]).join(", ")})`;
  }
  if (capped.length === 1) {
    capped.push(capped[0]);
  }

  return `linear-gradient(135deg, ${capped.join(", ")})`;
}
