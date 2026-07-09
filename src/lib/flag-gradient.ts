// Flag-derived background gradients used as the default trip cover.
// Curated palette per country (most-common Lovable destinations) with a
// deterministic hash fallback so unknown ISO codes still get stable colors.
//
// The gradient is rendered as a CSS mesh (multiple overlapping radial gradients)
// on a dark base, giving an atmospheric glow effect on the card covers.

const FLAG_COLORS: Record<string, string[]> = {
  IT: ["#009246", "#CE2B37"],
  FR: ["#0055A4", "#EF4135"],
  DE: ["#000000", "#DD0000", "#FFCE00"],
  ES: ["#AA151B", "#F1BF00"],
  GB: ["#012169", "#C8102E"],
  US: ["#B22234", "#3C3B6E"],
  PT: ["#006600", "#FF0000"],
  NL: ["#AE1C28", "#21468B"],
  BE: ["#000000", "#FAE042", "#ED2939"],
  CH: ["#FF0000"],
  AT: ["#ED2939"],
  GR: ["#0D5EAF"],
  IE: ["#169B62", "#FF883E"],
  SE: ["#006AA7", "#FECC00"],
  NO: ["#EF2B2D", "#002868"],
  DK: ["#C8102E"],
  FI: ["#003580"],
  PL: ["#DC143C"],
  CZ: ["#11457E", "#D7141A"],
  HU: ["#CD2A3E", "#436F4D"],
  RO: ["#002B7F", "#FCD116", "#CE1126"],
  BG: ["#00966E", "#D62612"],
  HR: ["#FF0000", "#171796"],
  TR: ["#E30A17"],
  RU: ["#0033A0", "#DA291C"],
  UA: ["#005BBB", "#FFD500"],
  JP: ["#BC002D"],
  KR: ["#003478", "#C60C30"],
  CN: ["#DE2910", "#FFDE00"],
  IN: ["#FF9933", "#138808"],
  TH: ["#A51931", "#2D2A4A"],
  VN: ["#DA251D", "#FFFF00"],
  ID: ["#FF0000"],
  PH: ["#0038A8", "#CE1126", "#FCD116"],
  MY: ["#CC0001", "#010066", "#FFCC00"],
  SG: ["#ED2E38"],
  AU: ["#012169", "#E4002B"],
  NZ: ["#012169", "#C8102E"],
  CA: ["#FF0000"],
  MX: ["#006847", "#CE1126"],
  BR: ["#009C3B", "#FFDF00", "#002776"],
  AR: ["#74ACDF", "#F6B40E"],
  CL: ["#0039A6", "#D52B1E"],
  PE: ["#D91023"],
  CO: ["#FCD116", "#003893", "#CE1126"],
  EG: ["#CE1126", "#000000"],
  MA: ["#C1272D", "#006233"],
  ZA: ["#007749", "#FFB81C", "#DE3831", "#002395"],
  KE: ["#000000", "#BB0000", "#006600"],
  AE: ["#00732F", "#000000", "#FF0000"],
  SA: ["#006C35"],
  IL: ["#0038B8"],
  IS: ["#02529C", "#DC1E35"],
  LU: ["#ED2939", "#00A1DE"],
  MT: ["#CF142B"],
  CY: ["#D57800"],
  EE: ["#0072CE", "#000000"],
  LV: ["#9E1B32"],
  LT: ["#FDBA0B", "#006A44", "#C22033"],
  SI: ["#0000FF", "#FF0000"],
  SK: ["#0B4EA2", "#EE1C25"],
};

// Focal positions for the radial gradient "lights" — distributed around the card.
const MESH_POSITIONS = [
  "10% 15%",   // top-left
  "90% 10%",   // top-right
  "15% 90%",   // bottom-left
  "88% 88%",   // bottom-right
  "50% 50%",   // center (5th color)
];

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function fallbackColors(iso: string): string[] {
  const h = hashHue(iso || "??");
  return [
    `hsl(${h} 65% 40%)`,
    `hsl(${(h + 40) % 360} 60% 50%)`,
    `hsl(${(h + 80) % 360} 55% 35%)`,
  ];
}

function isPaleWhite(hex: string): boolean {
  const c = hex.toUpperCase();
  return c === "#FFFFFF" || c === "#FFF";
}

/** Build a CSS mesh gradient from an array of 1–5 colors on a dark base. */
function meshGradient(colors: string[]): string {
  const radials = colors.map((color, i) => {
    const pos = MESH_POSITIONS[i % MESH_POSITIONS.length];
    return `radial-gradient(ellipse at ${pos}, ${color} 0%, transparent 68%)`;
  });
  // Solid dark-navy base rendered via a full-coverage linear-gradient
  const base = "linear-gradient(#0c0c1a, #0c0c1a)";
  return [...radials, base].join(", ");
}

export function flagGradient(isoCodes: string[] | undefined | null): string {
  const codes = (isoCodes ?? []).map((c) => c.toUpperCase()).filter(Boolean);

  if (codes.length === 0) {
    return meshGradient(fallbackColors("??").slice(0, 3));
  }

  const picks: string[] = [];

  if (codes.length === 1) {
    // Single country: use up to 3 of its palette colors
    const iso = codes[0];
    const raw = FLAG_COLORS[iso] ?? fallbackColors(iso);
    const nw = raw.filter((c) => !isPaleWhite(c));
    picks.push(...(nw.length >= 2 ? nw : raw).slice(0, 3));
  } else {
    // Multi-country: 1 primary color per country (up to 4 countries)
    for (const iso of codes.slice(0, 4)) {
      const raw = FLAG_COLORS[iso] ?? fallbackColors(iso);
      const nw = raw.filter((c) => !isPaleWhite(c));
      picks.push(nw[0] ?? raw[0]);
    }

    // Fill up to 4 total with secondary colors from countries that have them
    if (picks.length < 4) {
      for (const iso of codes.slice(0, 4)) {
        if (picks.length >= 4) break;
        const raw = FLAG_COLORS[iso] ?? fallbackColors(iso);
        const nw = raw.filter((c) => !isPaleWhite(c));
        if (nw.length >= 2 && !picks.includes(nw[1])) {
          picks.push(nw[1]);
        }
      }
    }
  }

  // Remove exact duplicates and cap
  const deduped = [...new Set(picks)].slice(0, 4);
  if (deduped.length === 0) deduped.push(...fallbackColors(codes[0]).slice(0, 3));

  return meshGradient(deduped);
}
