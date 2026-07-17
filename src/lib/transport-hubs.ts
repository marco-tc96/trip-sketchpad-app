// Curated transport hubs for train stations, bus terminals and ferry ports.
// Airports are intentionally NOT listed here anymore: they are served
// entirely by the global `airports-json` dataset (see use-airports.ts),
// which already covers every commercial airport worldwide with a real IATA
// code. Keeping a hand-written airport table alongside it just caused
// duplicates and inconsistent names, so it was removed.
//
// Major hubs are shown by default; secondary hubs are revealed via the
// "Mostra altri" action. Falls back to free-text input / remote search
// (use-remote-hubs.ts) when no curated data exists for a country.

export type HubKind = "train" | "bus" | "ferry" | "toll";

export type Hub = {
  code?: string;   // station code, when one commonly exists (rare outside airports)
  name: string;    // human label, e.g. "Termini"
  city?: string;    // city the hub serves, e.g. "Roma"
  major?: boolean; // true = always visible
};

type CountryHubs = Partial<Record<HubKind, Hub[]>>;

export const HUBS: Record<string, CountryHubs> = {
  IT: {
    train: [
      { name: "Termini", city: "Roma", major: true },
      { name: "Centrale", city: "Milano", major: true },
      { name: "Centrale", city: "Napoli", major: true },
      { name: "S. M. Novella", city: "Firenze", major: true },
      { name: "S. Lucia", city: "Venezia", major: true },
      { name: "Mestre", city: "Venezia", major: true },
      { name: "Centrale", city: "Bologna", major: true },
      { name: "Porta Nuova", city: "Torino", major: true },
      { name: "Tiburtina", city: "Roma" },
      { name: "Ostiense", city: "Roma" },
      { name: "Porta Garibaldi", city: "Milano" },
      { name: "Centrale", city: "Bari" },
      { name: "Piazza Principe", city: "Genova" },
      { name: "Brignole", city: "Genova" },
      { name: "Porta Nuova", city: "Verona" },
      { name: "Centrale", city: "Palermo" },
      { name: "Centrale", city: "Reggio Calabria" },
      { name: "Centrale", city: "Salerno" },
      { name: "Centrale", city: "Pisa" },
      { name: "Centrale", city: "Catania" },
      { name: "Centro", city: "Perugia" },
      { name: "Centrale", city: "Trieste" },
      { name: "Brennero", city: "Bolzano" },
      { name: "Centrale", city: "Cagliari" },
    ],
    bus: [
      { name: "Autostazione Tiburtina", city: "Roma", major: true },
      { name: "Autostazione Lampugnano", city: "Milano", major: true },
      { name: "Metropark Napoli", city: "Napoli", major: true },
      { name: "Villa Costanza", city: "Firenze" },
      { name: "Autostazione", city: "Bologna" },
      { name: "Autostazione", city: "Torino" },
    ],
    ferry: [
      { name: "Porto", city: "Civitavecchia", major: true },
      { name: "Porto", city: "Genova", major: true },
      { name: "Porto", city: "Napoli", major: true },
      { name: "Porto", city: "Livorno" },
      { name: "Porto", city: "Palermo" },
      { name: "Porto", city: "Olbia" },
      { name: "Porto", city: "Bari" },
      { name: "Porto", city: "Ancona" },
      { name: "Porto", city: "Brindisi" },
      { name: "Porto", city: "Messina" },
    ],
  },
  FR: {
    train: [
      { name: "Gare du Nord", city: "Paris", major: true },
      { name: "Gare de Lyon", city: "Paris", major: true },
      { name: "Montparnasse", city: "Paris", major: true },
      { name: "Gare de l'Est", city: "Paris", major: true },
      { name: "Saint-Lazare", city: "Paris" },
      { name: "Austerlitz", city: "Paris" },
      { name: "Part-Dieu", city: "Lyon", major: true },
      { name: "St-Charles", city: "Marseille", major: true },
      { name: "Ville", city: "Nice" },
      { name: "St-Jean", city: "Bordeaux" },
      { name: "Strasbourg", city: "Strasbourg" },
      { name: "Matabiau", city: "Toulouse" },
      { name: "Part-Dieu", city: "Lille" },
    ],
    bus: [
      { name: "Bercy Seine", city: "Paris", major: true },
      { name: "Perrache", city: "Lyon" },
    ],
    ferry: [
      { name: "Port", city: "Calais", major: true },
      { name: "Port", city: "Marseille" },
      { name: "Port", city: "Nice" },
    ],
  },
  GB: {
    train: [
      { name: "King's Cross", city: "London", major: true },
      { name: "Paddington", city: "London", major: true },
      { name: "Euston", city: "London", major: true },
      { name: "St Pancras", city: "London", major: true },
      { name: "Victoria", city: "London" },
      { name: "Liverpool Street", city: "London" },
      { name: "Piccadilly", city: "Manchester", major: true },
      { name: "Waverley", city: "Edinburgh", major: true },
      { name: "New Street", city: "Birmingham" },
      { name: "Central", city: "Glasgow" },
    ],
  },
  DE: {
    train: [
      { name: "Hauptbahnhof", city: "Berlin", major: true },
      { name: "Hauptbahnhof", city: "München", major: true },
      { name: "Hauptbahnhof", city: "Frankfurt", major: true },
      { name: "Hauptbahnhof", city: "Hamburg", major: true },
      { name: "Hauptbahnhof", city: "Köln", major: true },
      { name: "Hauptbahnhof", city: "Stuttgart" },
      { name: "Hauptbahnhof", city: "Düsseldorf" },
    ],
  },
  ES: {
    train: [
      { name: "Puerta de Atocha", city: "Madrid", major: true },
      { name: "Chamartín", city: "Madrid" },
      { name: "Sants", city: "Barcelona", major: true },
      { name: "Santa Justa", city: "Sevilla" },
      { name: "Joaquín Sorolla", city: "Valencia" },
      { name: "María Zambrano", city: "Málaga" },
    ],
  },
  PT: {
    train: [
      { name: "Oriente", city: "Lisboa", major: true },
      { name: "Santa Apolónia", city: "Lisboa" },
      { name: "Campanhã", city: "Porto", major: true },
      { name: "São Bento", city: "Porto" },
    ],
  },
  NL: {
    train: [
      { name: "Centraal", city: "Amsterdam", major: true },
      { name: "Centraal", city: "Rotterdam" },
      { name: "Centraal", city: "Utrecht" },
      { name: "Centraal", city: "Den Haag" },
    ],
  },
  BE: {
    train: [
      { name: "Midi", city: "Bruxelles", major: true },
      { name: "Centraal", city: "Antwerpen" },
      { name: "Centraal", city: "Bruxelles" },
    ],
  },
  CH: {
    train: [
      { name: "HB", city: "Zürich", major: true },
      { name: "Hauptbahnhof", city: "Bern" },
      { name: "Cornavin", city: "Genève", major: true },
      { name: "SBB", city: "Basel" },
      { name: "SBB", city: "Lugano" },
    ],
  },
  AT: {
    train: [
      { name: "Hauptbahnhof", city: "Wien", major: true },
      { name: "Hauptbahnhof", city: "Salzburg" },
      { name: "Hauptbahnhof", city: "Graz" },
      { name: "Hauptbahnhof", city: "Innsbruck" },
    ],
  },
  GR: {
    train: [
      { name: "Larissa", city: "Athens", major: true },
    ],
    ferry: [
      { name: "Porto", city: "Piraeus", major: true },
      { name: "Porto", city: "Rafina" },
      { name: "Porto", city: "Patras" },
    ],
  },
  US: {
    train: [
      { name: "Penn Station", city: "New York", major: true },
      { name: "Grand Central Terminal", city: "New York" },
      { name: "Union Station", city: "Washington", major: true },
      { name: "Union Station", city: "Chicago", major: true },
      { name: "Union Station", city: "Los Angeles" },
      { name: "South Station", city: "Boston" },
    ],
  },
  JP: {
    train: [
      { name: "Tokyo Station", city: "Tokyo", major: true },
      { name: "Shinjuku Station", city: "Tokyo", major: true },
      { name: "Shibuya Station", city: "Tokyo" },
      { name: "Shin-Osaka", city: "Osaka", major: true },
      { name: "Kyoto Station", city: "Kyoto", major: true },
      { name: "Hakata Station", city: "Fukuoka" },
    ],
  },
  KR: {
    train: [
      { name: "Seoul Station", city: "Seoul", major: true },
      { name: "Yongsan Station", city: "Seoul" },
      { name: "Busan Station", city: "Busan", major: true },
    ],
  },
  CN: {
    train: [
      { name: "Beijing Railway Station", city: "Beijing", major: true },
      { name: "Shanghai Hongqiao", city: "Shanghai", major: true },
    ],
  },
};

export function hubsForMode(
  mode: string,
  countryIsos: string[],
  includeSecondary = false,
): Hub[] {
  const kind = modeToHubKind(mode);
  if (!kind) return [];
  const seen = new Set<string>();
  const out: Hub[] = [];
  for (const iso of countryIsos) {
    const list = HUBS[iso.toUpperCase()]?.[kind] ?? [];
    for (const h of list) {
      if (!includeSecondary && !h.major) continue;
      const k = `${h.city ?? ""}|${h.name}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
    }
  }
  return out;
}

function modeToHubKind(mode: string): HubKind | null {
  if (mode === "train") return "train";
  if (mode === "bus") return "bus";
  if (mode === "ferry") return "ferry";
  return null;
}

// Full label used as the stored value (what gets saved to the database).
// Airports use their own formatter in use-airports.ts (IATA - City / Name);
// everything else here (train/bus/ferry/toll) has no universal code, so the
// label is simply "City - Name", e.g. "Roma - Termini".
export function formatHub(h: Hub): string {
  if (h.code) return `${h.name} (${h.code})`;
  return h.city ? `${h.city} - ${h.name}` : h.name;
}
