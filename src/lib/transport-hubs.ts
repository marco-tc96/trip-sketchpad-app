// Curated transport hubs (airports, train stations, ports, bus terminals).
// Major hubs are shown by default; secondary hubs are revealed via the
// "Mostra altri" action. Falls back to free-text input when no data exists.

export type HubKind = "airport" | "train" | "bus" | "ferry";

export type Hub = {
  code?: string;   // IATA / station code
  name: string;    // human label
  city?: string;
  major?: boolean; // true = always visible
};

type CountryHubs = Partial<Record<HubKind, Hub[]>>;

export const HUBS: Record<string, CountryHubs> = {
  IT: {
    airport: [
      { code: "FCO", name: "Roma Fiumicino", city: "Roma", major: true },
      { code: "MXP", name: "Milano Malpensa", city: "Milano", major: true },
      { code: "LIN", name: "Milano Linate", city: "Milano", major: true },
      { code: "BGY", name: "Bergamo Orio al Serio", city: "Bergamo", major: true },
      { code: "VCE", name: "Venezia Marco Polo", city: "Venezia", major: true },
      { code: "NAP", name: "Napoli Capodichino", city: "Napoli", major: true },
      { code: "CTA", name: "Catania Fontanarossa", city: "Catania", major: true },
      { code: "BLQ", name: "Bologna Marconi", city: "Bologna", major: true },
      { code: "PMO", name: "Palermo Falcone Borsellino", city: "Palermo" },
      { code: "TRN", name: "Torino Caselle", city: "Torino" },
      { code: "PSA", name: "Pisa Galilei", city: "Pisa" },
      { code: "FLR", name: "Firenze Peretola", city: "Firenze" },
      { code: "BRI", name: "Bari Palese", city: "Bari" },
      { code: "CIA", name: "Roma Ciampino", city: "Roma" },
      { code: "VRN", name: "Verona Villafranca", city: "Verona" },
      { code: "TRS", name: "Trieste", city: "Trieste" },
      { code: "GOA", name: "Genova", city: "Genova" },
      { code: "CAG", name: "Cagliari Elmas", city: "Cagliari" },
      { code: "OLB", name: "Olbia Costa Smeralda", city: "Olbia" },
      { code: "AOI", name: "Ancona Falconara", city: "Ancona" },
    ],
    train: [
      { name: "Roma Termini", city: "Roma", major: true },
      { name: "Milano Centrale", city: "Milano", major: true },
      { name: "Napoli Centrale", city: "Napoli", major: true },
      { name: "Firenze S. M. Novella", city: "Firenze", major: true },
      { name: "Venezia S. Lucia", city: "Venezia", major: true },
      { name: "Bologna Centrale", city: "Bologna", major: true },
      { name: "Torino Porta Nuova", city: "Torino", major: true },
      { name: "Roma Tiburtina", city: "Roma" },
      { name: "Milano Porta Garibaldi", city: "Milano" },
      { name: "Bari Centrale", city: "Bari" },
      { name: "Genova Piazza Principe", city: "Genova" },
      { name: "Verona Porta Nuova", city: "Verona" },
      { name: "Palermo Centrale", city: "Palermo" },
      { name: "Salerno", city: "Salerno" },
      { name: "Reggio Calabria Centrale", city: "Reggio Calabria" },
    ],
    bus: [
      { name: "Roma Tiburtina (autostazione)", city: "Roma", major: true },
      { name: "Milano Lampugnano", city: "Milano", major: true },
      { name: "Napoli Metropark", city: "Napoli", major: true },
      { name: "Firenze Villa Costanza", city: "Firenze" },
      { name: "Bologna Autostazione", city: "Bologna" },
    ],
    ferry: [
      { name: "Civitavecchia", city: "Civitavecchia", major: true },
      { name: "Genova Porto", city: "Genova", major: true },
      { name: "Napoli Porto", city: "Napoli", major: true },
      { name: "Livorno", city: "Livorno" },
      { name: "Palermo Porto", city: "Palermo" },
      { name: "Olbia", city: "Olbia" },
      { name: "Bari Porto", city: "Bari" },
      { name: "Ancona Porto", city: "Ancona" },
    ],
  },
  FR: {
    airport: [
      { code: "CDG", name: "Paris Charles de Gaulle", city: "Paris", major: true },
      { code: "ORY", name: "Paris Orly", city: "Paris", major: true },
      { code: "NCE", name: "Nice Côte d'Azur", city: "Nice", major: true },
      { code: "LYS", name: "Lyon Saint-Exupéry", city: "Lyon", major: true },
      { code: "MRS", name: "Marseille Provence", city: "Marseille", major: true },
      { code: "TLS", name: "Toulouse Blagnac", city: "Toulouse" },
      { code: "BOD", name: "Bordeaux", city: "Bordeaux" },
      { code: "NTE", name: "Nantes Atlantique", city: "Nantes" },
      { code: "BVA", name: "Paris Beauvais", city: "Paris" },
    ],
    train: [
      { name: "Paris Gare du Nord", city: "Paris", major: true },
      { name: "Paris Gare de Lyon", city: "Paris", major: true },
      { name: "Paris Montparnasse", city: "Paris", major: true },
      { name: "Lyon Part-Dieu", city: "Lyon", major: true },
      { name: "Marseille St-Charles", city: "Marseille", major: true },
      { name: "Nice Ville", city: "Nice" },
      { name: "Bordeaux St-Jean", city: "Bordeaux" },
      { name: "Strasbourg", city: "Strasbourg" },
    ],
    bus: [
      { name: "Paris Bercy Seine", city: "Paris", major: true },
      { name: "Lyon Perrache", city: "Lyon" },
    ],
    ferry: [
      { name: "Calais", city: "Calais", major: true },
      { name: "Marseille Port", city: "Marseille" },
      { name: "Nice Port", city: "Nice" },
    ],
  },
  GB: {
    airport: [
      { code: "LHR", name: "London Heathrow", city: "London", major: true },
      { code: "LGW", name: "London Gatwick", city: "London", major: true },
      { code: "STN", name: "London Stansted", city: "London", major: true },
      { code: "LTN", name: "London Luton", city: "London", major: true },
      { code: "MAN", name: "Manchester", city: "Manchester", major: true },
      { code: "EDI", name: "Edinburgh", city: "Edinburgh", major: true },
      { code: "BHX", name: "Birmingham", city: "Birmingham" },
      { code: "LCY", name: "London City", city: "London" },
      { code: "GLA", name: "Glasgow", city: "Glasgow" },
    ],
    train: [
      { name: "London King's Cross", city: "London", major: true },
      { name: "London Paddington", city: "London", major: true },
      { name: "London Euston", city: "London", major: true },
      { name: "London St Pancras", city: "London", major: true },
      { name: "Manchester Piccadilly", city: "Manchester" },
      { name: "Edinburgh Waverley", city: "Edinburgh" },
    ],
  },
  DE: {
    airport: [
      { code: "FRA", name: "Frankfurt", city: "Frankfurt", major: true },
      { code: "MUC", name: "München", city: "München", major: true },
      { code: "BER", name: "Berlin Brandenburg", city: "Berlin", major: true },
      { code: "DUS", name: "Düsseldorf", city: "Düsseldorf", major: true },
      { code: "HAM", name: "Hamburg", city: "Hamburg", major: true },
      { code: "CGN", name: "Köln/Bonn", city: "Köln" },
      { code: "STR", name: "Stuttgart", city: "Stuttgart" },
    ],
    train: [
      { name: "Berlin Hbf", city: "Berlin", major: true },
      { name: "München Hbf", city: "München", major: true },
      { name: "Frankfurt Hbf", city: "Frankfurt", major: true },
      { name: "Hamburg Hbf", city: "Hamburg", major: true },
      { name: "Köln Hbf", city: "Köln" },
    ],
  },
  ES: {
    airport: [
      { code: "MAD", name: "Madrid Barajas", city: "Madrid", major: true },
      { code: "BCN", name: "Barcelona El Prat", city: "Barcelona", major: true },
      { code: "PMI", name: "Palma de Mallorca", city: "Palma", major: true },
      { code: "AGP", name: "Málaga", city: "Málaga", major: true },
      { code: "VLC", name: "Valencia", city: "Valencia" },
      { code: "SVQ", name: "Sevilla", city: "Sevilla" },
      { code: "BIO", name: "Bilbao", city: "Bilbao" },
      { code: "IBZ", name: "Ibiza", city: "Ibiza" },
    ],
    train: [
      { name: "Madrid Puerta de Atocha", city: "Madrid", major: true },
      { name: "Barcelona Sants", city: "Barcelona", major: true },
      { name: "Sevilla Santa Justa", city: "Sevilla" },
      { name: "Valencia Joaquín Sorolla", city: "Valencia" },
    ],
  },
  PT: {
    airport: [
      { code: "LIS", name: "Lisboa Humberto Delgado", city: "Lisboa", major: true },
      { code: "OPO", name: "Porto Francisco Sá Carneiro", city: "Porto", major: true },
      { code: "FAO", name: "Faro", city: "Faro", major: true },
    ],
    train: [
      { name: "Lisboa Oriente", city: "Lisboa", major: true },
      { name: "Lisboa Santa Apolónia", city: "Lisboa" },
      { name: "Porto Campanhã", city: "Porto", major: true },
    ],
  },
  NL: {
    airport: [
      { code: "AMS", name: "Amsterdam Schiphol", city: "Amsterdam", major: true },
      { code: "EIN", name: "Eindhoven", city: "Eindhoven" },
      { code: "RTM", name: "Rotterdam The Hague", city: "Rotterdam" },
    ],
    train: [
      { name: "Amsterdam Centraal", city: "Amsterdam", major: true },
      { name: "Rotterdam Centraal", city: "Rotterdam" },
      { name: "Utrecht Centraal", city: "Utrecht" },
    ],
  },
  BE: {
    airport: [
      { code: "BRU", name: "Brussels", city: "Brussels", major: true },
      { code: "CRL", name: "Brussels South Charleroi", city: "Charleroi" },
    ],
    train: [
      { name: "Bruxelles-Midi", city: "Bruxelles", major: true },
      { name: "Antwerpen-Centraal", city: "Antwerpen" },
    ],
  },
  CH: {
    airport: [
      { code: "ZRH", name: "Zürich", city: "Zürich", major: true },
      { code: "GVA", name: "Genève", city: "Genève", major: true },
      { code: "BSL", name: "Basel-Mulhouse", city: "Basel" },
    ],
    train: [
      { name: "Zürich HB", city: "Zürich", major: true },
      { name: "Bern", city: "Bern" },
      { name: "Genève", city: "Genève", major: true },
    ],
  },
  AT: {
    airport: [
      { code: "VIE", name: "Wien Schwechat", city: "Wien", major: true },
      { code: "SZG", name: "Salzburg", city: "Salzburg" },
    ],
    train: [
      { name: "Wien Hauptbahnhof", city: "Wien", major: true },
      { name: "Salzburg Hbf", city: "Salzburg" },
    ],
  },
  GR: {
    airport: [
      { code: "ATH", name: "Athens Eleftherios Venizelos", city: "Athens", major: true },
      { code: "SKG", name: "Thessaloniki", city: "Thessaloniki", major: true },
      { code: "HER", name: "Heraklion", city: "Heraklion" },
    ],
    ferry: [
      { name: "Piraeus", city: "Athens", major: true },
      { name: "Rafina", city: "Athens" },
    ],
  },
  US: {
    airport: [
      { code: "JFK", name: "New York JFK", city: "New York", major: true },
      { code: "LGA", name: "New York LaGuardia", city: "New York", major: true },
      { code: "EWR", name: "Newark Liberty", city: "Newark", major: true },
      { code: "LAX", name: "Los Angeles", city: "Los Angeles", major: true },
      { code: "ORD", name: "Chicago O'Hare", city: "Chicago", major: true },
      { code: "SFO", name: "San Francisco", city: "San Francisco", major: true },
      { code: "MIA", name: "Miami", city: "Miami", major: true },
      { code: "BOS", name: "Boston Logan", city: "Boston" },
      { code: "SEA", name: "Seattle Tacoma", city: "Seattle" },
      { code: "DEN", name: "Denver", city: "Denver" },
      { code: "ATL", name: "Atlanta", city: "Atlanta" },
      { code: "DFW", name: "Dallas Fort Worth", city: "Dallas" },
      { code: "IAD", name: "Washington Dulles", city: "Washington" },
      { code: "LAS", name: "Las Vegas", city: "Las Vegas" },
    ],
    train: [
      { name: "New York Penn Station", city: "New York", major: true },
      { name: "Washington Union Station", city: "Washington" },
      { name: "Chicago Union Station", city: "Chicago" },
    ],
  },
  JP: {
    airport: [
      { code: "HND", name: "Tokyo Haneda", city: "Tokyo", major: true },
      { code: "NRT", name: "Tokyo Narita", city: "Tokyo", major: true },
      { code: "KIX", name: "Osaka Kansai", city: "Osaka", major: true },
    ],
    train: [
      { name: "Tokyo Station", city: "Tokyo", major: true },
      { name: "Shin-Osaka", city: "Osaka", major: true },
      { name: "Kyoto Station", city: "Kyoto" },
    ],
  },
};

function modeToHubKind(mode: string): HubKind | null {
  if (mode === "plane") return "airport";
  if (mode === "train") return "train";
  if (mode === "bus") return "bus";
  if (mode === "ferry") return "ferry";
  return null;
}

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
      const k = `${h.code ?? ""}|${h.name}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
    }
  }
  return out;
}

export function formatHub(h: Hub): string {
  return h.code ? `${h.name} (${h.code})` : h.name;
}