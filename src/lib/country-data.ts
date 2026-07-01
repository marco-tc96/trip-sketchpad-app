// country-data.ts — fully self-contained, no external packages.
import { useEffect, useState } from "react";

const COUNTRIES_RAW = [
  ["AF", "Afghanistan", "AFN"],["AX", "Åland Islands", "EUR"],["AL", "Albania", "ALL"],
  ["DZ", "Algeria", "DZD"],["AS", "American Samoa", "USD"],["AD", "Andorra", "EUR"],
  ["AO", "Angola", "AOA"],["AI", "Anguilla", "XCD"],["AG", "Antigua and Barbuda", "XCD"],
  ["AR", "Argentina", "ARS"],["AM", "Armenia", "AMD"],["AW", "Aruba", "AWG"],
  ["AU", "Australia", "AUD"],["AT", "Austria", "EUR"],["AZ", "Azerbaijan", "AZN"],
  ["BS", "Bahamas", "BSD"],["BH", "Bahrain", "BHD"],["BD", "Bangladesh", "BDT"],
  ["BB", "Barbados", "BBD"],["BY", "Belarus", "BYR"],["BE", "Belgium", "EUR"],
  ["BZ", "Belize", "BZD"],["BJ", "Benin", "XOF"],["BM", "Bermuda", "BMD"],
  ["BT", "Bhutan", "BTN"],["BO", "Bolivia", "BOB"],["BQ", "Bonaire, Sint Eustatius and Saba", "USD"],
  ["BA", "Bosnia and Herzegovina", "BAM"],["BW", "Botswana", "BWP"],["BR", "Brazil", "BRL"],
  ["IO", "British Indian Ocean Territory", "USD"],["BN", "Brunei", "BND"],["BG", "Bulgaria", "BGN"],
  ["BF", "Burkina Faso", "XOF"],["BI", "Burundi", "BIF"],["CV", "Cabo Verde", "CVE"],
  ["KH", "Cambodia", "KHR"],["CM", "Cameroon", "XAF"],["CA", "Canada", "CAD"],
  ["KY", "Cayman Islands", "KYD"],["CF", "Central African Republic", "XAF"],["TD", "Chad", "XAF"],
  ["CL", "Chile", "CLP"],["CN", "China", "CNY"],["CX", "Christmas Island", "AUD"],
  ["CC", "Cocos Islands", "AUD"],["CO", "Colombia", "COP"],["KM", "Comoros", "KMF"],
  ["CG", "Congo", "XAF"],["CD", "Congo, DR", "CDF"],["CK", "Cook Islands", "NZD"],
  ["CR", "Costa Rica", "CRC"],["CI", "Côte d'Ivoire", "XOF"],["HR", "Croatia", "EUR"],
  ["CU", "Cuba", "CUP"],["CW", "Curaçao", "ANG"],["CY", "Cyprus", "EUR"],
  ["CZ", "Czechia", "CZK"],["DK", "Denmark", "DKK"],["DJ", "Djibouti", "DJF"],
  ["DM", "Dominica", "XCD"],["DO", "Dominican Republic", "DOP"],["EC", "Ecuador", "USD"],
  ["EG", "Egypt", "EGP"],["SV", "El Salvador", "USD"],["GQ", "Equatorial Guinea", "XAF"],
  ["ER", "Eritrea", "ERN"],["EE", "Estonia", "EUR"],["SZ", "Eswatini", "SZL"],
  ["ET", "Ethiopia", "ETB"],["FK", "Falkland Islands", "FKP"],["FO", "Faroe Islands", "DKK"],
  ["FJ", "Fiji", "FJD"],["FI", "Finland", "EUR"],["FR", "France", "EUR"],
  ["GF", "French Guiana", "EUR"],["PF", "French Polynesia", "XPF"],["TF", "French Southern Territories", "EUR"],
  ["GA", "Gabon", "XAF"],["GM", "Gambia", "GMD"],["GE", "Georgia", "GEL"],
  ["DE", "Germany", "EUR"],["GH", "Ghana", "GHS"],["GI", "Gibraltar", "GIP"],
  ["GR", "Greece", "EUR"],["GL", "Greenland", "DKK"],["GD", "Grenada", "XCD"],
  ["GP", "Guadeloupe", "EUR"],["GU", "Guam", "USD"],["GT", "Guatemala", "GTQ"],
  ["GG", "Guernsey", "GBP"],["GN", "Guinea", "GNF"],["GW", "Guinea-Bissau", "XOF"],
  ["GY", "Guyana", "GYD"],["HT", "Haiti", "HTG"],["VA", "Holy See", "EUR"],
  ["HN", "Honduras", "HNL"],["HK", "Hong Kong", "HKD"],["HU", "Hungary", "HUF"],
  ["IS", "Iceland", "ISK"],["IN", "India", "INR"],["ID", "Indonesia", "IDR"],
  ["IR", "Iran", "IRR"],["IQ", "Iraq", "IQD"],["IE", "Ireland", "EUR"],
  ["IM", "Isle of Man", "GBP"],["IL", "Israel", "ILS"],["IT", "Italy", "EUR"],
  ["JM", "Jamaica", "JMD"],["JP", "Japan", "JPY"],["JE", "Jersey", "GBP"],
  ["JO", "Jordan", "JOD"],["KZ", "Kazakhstan", "KZT"],["KE", "Kenya", "KES"],
  ["KI", "Kiribati", "AUD"],["KP", "Korea (North)", "KPW"],["KR", "Korea (South)", "KRW"],
  ["KW", "Kuwait", "KWD"],["KG", "Kyrgyzstan", "KGS"],["LA", "Laos", "LAK"],
  ["LV", "Latvia", "EUR"],["LB", "Lebanon", "LBP"],["LS", "Lesotho", "LSL"],
  ["LR", "Liberia", "LRD"],["LY", "Libya", "LYD"],["LI", "Liechtenstein", "CHF"],
  ["LT", "Lithuania", "EUR"],["LU", "Luxembourg", "EUR"],["MO", "Macao", "MOP"],
  ["MG", "Madagascar", "MGA"],["MW", "Malawi", "MWK"],["MY", "Malaysia", "MYR"],
  ["MV", "Maldives", "MVR"],["ML", "Mali", "XOF"],["MT", "Malta", "EUR"],
  ["MH", "Marshall Islands", "USD"],["MQ", "Martinique", "EUR"],["MR", "Mauritania", "MRU"],
  ["MU", "Mauritius", "MUR"],["YT", "Mayotte", "EUR"],["MX", "Mexico", "MXN"],
  ["FM", "Micronesia", "USD"],["MD", "Moldova", "MDL"],["MC", "Monaco", "EUR"],
  ["MN", "Mongolia", "MNT"],["ME", "Montenegro", "EUR"],["MS", "Montserrat", "XCD"],
  ["MA", "Morocco", "MAD"],["MZ", "Mozambique", "MZN"],["MM", "Myanmar", "MMK"],
  ["NA", "Namibia", "NAD"],["NR", "Nauru", "AUD"],["NP", "Nepal", "NPR"],
  ["NL", "Netherlands", "EUR"],["NC", "New Caledonia", "XPF"],["NZ", "New Zealand", "NZD"],
  ["NI", "Nicaragua", "NIO"],["NE", "Niger", "XOF"],["NG", "Nigeria", "NGN"],
  ["NU", "Niue", "NZD"],["NF", "Norfolk Island", "AUD"],["MK", "North Macedonia", "MKD"],
  ["MP", "Northern Mariana Islands", "USD"],["NO", "Norway", "NOK"],["OM", "Oman", "OMR"],
  ["PK", "Pakistan", "PKR"],["PW", "Palau", "USD"],["PS", "Palestine", "ILS"],
  ["PA", "Panama", "PAB"],["PG", "Papua New Guinea", "PGK"],["PY", "Paraguay", "PYG"],
  ["PE", "Peru", "PEN"],["PH", "Philippines", "PHP"],["PN", "Pitcairn", "NZD"],
  ["PL", "Poland", "PLN"],["PT", "Portugal", "EUR"],["PR", "Puerto Rico", "USD"],
  ["QA", "Qatar", "QAR"],["RE", "Réunion", "EUR"],["RO", "Romania", "RON"],
  ["RU", "Russia", "RUB"],["RW", "Rwanda", "RWF"],["BL", "Saint Barthélemy", "EUR"],
  ["SH", "Saint Helena", "SHP"],["KN", "Saint Kitts and Nevis", "XCD"],["LC", "Saint Lucia", "XCD"],
  ["MF", "Saint Martin", "EUR"],["PM", "Saint Pierre and Miquelon", "EUR"],
  ["VC", "Saint Vincent and the Grenadines", "XCD"],["WS", "Samoa", "WST"],
  ["SM", "San Marino", "EUR"],["ST", "São Tomé and Príncipe", "STN"],["SA", "Saudi Arabia", "SAR"],
  ["SN", "Senegal", "XOF"],["RS", "Serbia", "RSD"],["SC", "Seychelles", "SCR"],
  ["SL", "Sierra Leone", "SLL"],["SG", "Singapore", "SGD"],["SX", "Sint Maarten", "ANG"],
  ["SK", "Slovakia", "EUR"],["SI", "Slovenia", "EUR"],["SB", "Solomon Islands", "SBD"],
  ["SO", "Somalia", "SOS"],["ZA", "South Africa", "ZAR"],["GS", "South Georgia", "GBP"],
  ["SS", "South Sudan", "SSP"],["ES", "Spain", "EUR"],["LK", "Sri Lanka", "LKR"],
  ["SD", "Sudan", "SDG"],["SR", "Suriname", "SRD"],["SJ", "Svalbard and Jan Mayen", "NOK"],
  ["SE", "Sweden", "SEK"],["CH", "Switzerland", "CHF"],["SY", "Syria", "SYP"],
  ["TW", "Taiwan", "TWD"],["TJ", "Tajikistan", "TJS"],["TZ", "Tanzania", "TZS"],
  ["TH", "Thailand", "THB"],["TL", "Timor-Leste", "USD"],["TG", "Togo", "XOF"],
  ["TK", "Tokelau", "NZD"],["TO", "Tonga", "TOP"],["TT", "Trinidad and Tobago", "TTD"],
  ["TN", "Tunisia", "TND"],["TR", "Turkey", "TRY"],["TM", "Turkmenistan", "TMT"],
  ["TC", "Turks and Caicos Islands", "USD"],["TV", "Tuvalu", "AUD"],["UG", "Uganda", "UGX"],
  ["UA", "Ukraine", "UAH"],["AE", "United Arab Emirates", "AED"],["GB", "United Kingdom", "GBP"],
  ["US", "United States", "USD"],["UM", "US Minor Outlying Islands", "USD"],["UY", "Uruguay", "UYU"],
  ["UZ", "Uzbekistan", "UZS"],["VU", "Vanuatu", "VUV"],["VE", "Venezuela", "VES"],
  ["VN", "Vietnam", "VND"],["VG", "Virgin Islands (British)", "USD"],["VI", "Virgin Islands (US)", "USD"],
  ["WF", "Wallis and Futuna", "XPF"],["EH", "Western Sahara", "MAD"],["YE", "Yemen", "YER"],
  ["ZM", "Zambia", "ZMW"],["ZW", "Zimbabwe", "ZWL"],
] as const;

const COUNTRY_TIMEZONES: Record<string, string> = {
  AF:"Asia/Kabul",AL:"Europe/Tirane",DZ:"Africa/Algiers",AD:"Europe/Andorra",AO:"Africa/Luanda",
  AG:"America/Antigua",AR:"America/Argentina/Buenos_Aires",AM:"Asia/Yerevan",AU:"Australia/Sydney",
  AT:"Europe/Vienna",AZ:"Asia/Baku",BS:"America/Nassau",BH:"Asia/Bahrain",BD:"Asia/Dhaka",
  BB:"America/Barbados",BY:"Europe/Minsk",BE:"Europe/Brussels",BZ:"America/Belize",
  BJ:"Africa/Porto-Novo",BT:"Asia/Thimphu",BO:"America/La_Paz",BA:"Europe/Sarajevo",
  BW:"Africa/Gaborone",BR:"America/Sao_Paulo",BN:"Asia/Brunei",BG:"Europe/Sofia",
  BF:"Africa/Ouagadougou",BI:"Africa/Bujumbura",CV:"Atlantic/Cape_Verde",KH:"Asia/Phnom_Penh",
  CM:"Africa/Douala",CA:"America/Toronto",CF:"Africa/Bangui",TD:"Africa/Ndjamena",
  CL:"America/Santiago",CN:"Asia/Shanghai",CO:"America/Bogota",KM:"Indian/Comoro",
  CG:"Africa/Brazzaville",CD:"Africa/Kinshasa",CR:"America/Costa_Rica",CI:"Africa/Abidjan",
  HR:"Europe/Zagreb",CU:"America/Havana",CY:"Asia/Nicosia",CZ:"Europe/Prague",
  DK:"Europe/Copenhagen",DJ:"Africa/Djibouti",DM:"America/Dominica",DO:"America/Santo_Domingo",
  EC:"America/Guayaquil",EG:"Africa/Cairo",SV:"America/El_Salvador",GQ:"Africa/Malabo",
  ER:"Africa/Asmara",EE:"Europe/Tallinn",SZ:"Africa/Mbabane",ET:"Africa/Addis_Ababa",
  FJ:"Pacific/Fiji",FI:"Europe/Helsinki",FR:"Europe/Paris",GA:"Africa/Libreville",
  GM:"Africa/Banjul",GE:"Asia/Tbilisi",DE:"Europe/Berlin",GH:"Africa/Accra",
  GI:"Europe/Gibraltar",GR:"Europe/Athens",GL:"America/Godthab",GD:"America/Grenada",
  GT:"America/Guatemala",GN:"Africa/Conakry",GW:"Africa/Bissau",GY:"America/Guyana",
  HT:"America/Port-au-Prince",VA:"Europe/Vatican",HN:"America/Tegucigalpa",HK:"Asia/Hong_Kong",
  HU:"Europe/Budapest",IS:"Atlantic/Reykjavik",IN:"Asia/Kolkata",ID:"Asia/Jakarta",
  IR:"Asia/Tehran",IQ:"Asia/Baghdad",IE:"Europe/Dublin",IL:"Asia/Jerusalem",IT:"Europe/Rome",
  JM:"America/Jamaica",JP:"Asia/Tokyo",JO:"Asia/Amman",KZ:"Asia/Almaty",KE:"Africa/Nairobi",
  KP:"Asia/Pyongyang",KR:"Asia/Seoul",KW:"Asia/Kuwait",KG:"Asia/Bishkek",LA:"Asia/Vientiane",
  LV:"Europe/Riga",LB:"Asia/Beirut",LS:"Africa/Maseru",LR:"Africa/Monrovia",LY:"Africa/Tripoli",
  LI:"Europe/Vaduz",LT:"Europe/Vilnius",LU:"Europe/Luxembourg",MO:"Asia/Macau",
  MG:"Indian/Antananarivo",MW:"Africa/Blantyre",MY:"Asia/Kuala_Lumpur",MV:"Indian/Maldives",
  ML:"Africa/Bamako",MT:"Europe/Malta",MH:"Pacific/Majuro",MR:"Africa/Nouakchott",
  MU:"Indian/Mauritius",MX:"America/Mexico_City",FM:"Pacific/Pohnpei",MD:"Europe/Chisinau",
  MC:"Europe/Monaco",MN:"Asia/Ulaanbaatar",ME:"Europe/Podgorica",MA:"Africa/Casablanca",
  MZ:"Africa/Maputo",MM:"Asia/Rangoon",NA:"Africa/Windhoek",NP:"Asia/Kathmandu",
  NL:"Europe/Amsterdam",NZ:"Pacific/Auckland",NI:"America/Managua",NE:"Africa/Niamey",
  NG:"Africa/Lagos",MK:"Europe/Skopje",NO:"Europe/Oslo",OM:"Asia/Muscat",PK:"Asia/Karachi",
  PW:"Pacific/Palau",PS:"Asia/Gaza",PA:"America/Panama",PG:"Pacific/Port_Moresby",
  PY:"America/Asuncion",PE:"America/Lima",PH:"Asia/Manila",PL:"Europe/Warsaw",PT:"Europe/Lisbon",
  QA:"Asia/Qatar",RE:"Indian/Reunion",RO:"Europe/Bucharest",RU:"Europe/Moscow",RW:"Africa/Kigali",
  SM:"Europe/San_Marino",ST:"Africa/Sao_Tome",SA:"Asia/Riyadh",SN:"Africa/Dakar",
  RS:"Europe/Belgrade",SC:"Indian/Mahe",SL:"Africa/Freetown",SG:"Asia/Singapore",
  SK:"Europe/Bratislava",SI:"Europe/Ljubljana",SB:"Pacific/Guadalcanal",SO:"Africa/Mogadishu",
  ZA:"Africa/Johannesburg",SS:"Africa/Juba",ES:"Europe/Madrid",LK:"Asia/Colombo",
  SD:"Africa/Khartoum",SR:"America/Paramaribo",SE:"Europe/Stockholm",CH:"Europe/Zurich",
  SY:"Asia/Damascus",TW:"Asia/Taipei",TJ:"Asia/Dushanbe",TZ:"Africa/Dar_es_Salaam",
  TH:"Asia/Bangkok",TL:"Asia/Dili",TG:"Africa/Lome",TO:"Pacific/Tongatapu",
  TT:"America/Port_of_Spain",TN:"Africa/Tunis",TR:"Europe/Istanbul",TM:"Asia/Ashgabat",
  TV:"Pacific/Funafuti",UG:"Africa/Kampala",UA:"Europe/Kiev",AE:"Asia/Dubai",
  GB:"Europe/London",US:"America/New_York",UY:"America/Montevideo",UZ:"Asia/Tashkent",
  VU:"Pacific/Efate",VE:"America/Caracas",VN:"Asia/Ho_Chi_Minh",YE:"Asia/Aden",
  ZM:"Africa/Lusaka",ZW:"Africa/Harare",KN:"America/St_Kitts",LC:"America/St_Lucia",
  VC:"America/St_Vincent",WS:"Pacific/Apia",
};

export type CountryEntry = { iso: string; name: string; currency: string; flag: string };

export function flagOf(iso: string): string {
  return iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

let _countries: CountryEntry[] | null = null;
export function allCountries(): CountryEntry[] {
  if (_countries) return _countries;
  _countries = (COUNTRIES_RAW as ReadonlyArray<readonly [string, string, string]>)
    .map(([iso, name, currency]) => ({ iso, name, currency, flag: flagOf(iso) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return _countries;
}

export function countryByIso(iso: string): CountryEntry | undefined {
  return allCountries().find((c) => c.iso === iso.toUpperCase());
}

export function primaryTimezoneOfCountry(iso: string): string | null {
  return COUNTRY_TIMEZONES[iso.toUpperCase()] ?? null;
}

const _displayNamesCache = new Map<string, Intl.DisplayNames>();
function getDisplayNames(lang: string): Intl.DisplayNames | null {
  if (typeof Intl === "undefined" || !("DisplayNames" in Intl)) return null;
  let dn = _displayNamesCache.get(lang);
  if (!dn) {
    try {
      dn = new Intl.DisplayNames([lang], { type: "region" });
      _displayNamesCache.set(lang, dn);
    } catch { return null; }
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
    } catch { /* ignore */ }
  }
  return countryByIso(ISO)?.name ?? ISO;
}

export function localizedCountries(lang: string): CountryEntry[] {
  return allCountries()
    .map((c) => ({ ...c, name: countryNameLocalized(c.iso, lang) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

// ── City name overrides: English canonical → translations ───────────────────
// Key = English name (as returned by countriesnow.space or stored in DB)
// Translations: it=Italian, es=Spanish, fr=French, de=German, pt=Portuguese
const CITY_NAME_OVERRIDES: Record<string, Partial<Record<string, string>>> = {
  // ── Italy (English names → native/localized) ─────────────────────────────
  Milan:        { it: "Milano",   es: "Milán",       fr: "Milan",     de: "Mailand",   pt: "Milão" },
  Rome:         { it: "Roma",     es: "Roma",        fr: "Rome",      de: "Rom",       pt: "Roma" },
  Florence:     { it: "Firenze",  es: "Florencia",   fr: "Florence",  de: "Florenz",   pt: "Florença" },
  Venice:       { it: "Venezia",  es: "Venecia",     fr: "Venise",    de: "Venedig",   pt: "Veneza" },
  Naples:       { it: "Napoli",   es: "Nápoles",     fr: "Naples",    de: "Neapel",    pt: "Nápoles" },
  Turin:        { it: "Torino",   es: "Turín",       fr: "Turin",     de: "Turin",     pt: "Turim" },
  Genoa:        { it: "Genova",   es: "Génova",      fr: "Gênes",     de: "Genua",     pt: "Génova" },
  Padua:        { it: "Padova",   es: "Padua",       fr: "Padoue",    de: "Padua",     pt: "Pádua" },
  Leghorn:      { it: "Livorno",  fr: "Livourne" },
  Reggio:       { it: "Reggio Calabria" },
  Syracuse:     { it: "Siracusa", es: "Siracusa",    fr: "Syracuse",  de: "Syrakus",   pt: "Siracusa" },
  // ── Austria ──────────────────────────────────────────────────────────────
  Salzburg:     { it: "Salisburgo", es: "Salzburgo", fr: "Salzbourg", pt: "Salzburgo" },
  Vienna:       { it: "Vienna",   es: "Viena",       fr: "Vienne",    de: "Wien",      pt: "Viena" },
  // ── Germany ──────────────────────────────────────────────────────────────
  Munich:       { it: "Monaco di Baviera", es: "Múnich",   fr: "Munich",      de: "München",   pt: "Munique" },
  Cologne:      { it: "Colonia",  es: "Colonia",     fr: "Cologne",   de: "Köln",      pt: "Colónia" },
  Frankfurt:    { it: "Francoforte", es: "Fráncfort", fr: "Francfort", de: "Frankfurt", pt: "Francoforte" },
  Nuremberg:    { it: "Norimberga", es: "Núremberg", fr: "Nuremberg", de: "Nürnberg",  pt: "Nuremberga" },
  Stuttgart:    { it: "Stoccarda", es: "Stuttgart",  fr: "Stuttgart", de: "Stuttgart", pt: "Estugarda" },
  Dresden:      { it: "Dresda",   es: "Dresde",      fr: "Dresde",    de: "Dresden",   pt: "Dresda" },
  Hamburg:      { it: "Amburgo",  es: "Hamburgo",    fr: "Hambourg",  de: "Hamburg",   pt: "Hamburgo" },
  Berlin:       { it: "Berlino",  es: "Berlín",      fr: "Berlin",    de: "Berlin",    pt: "Berlim" },
  Leipzig:      { it: "Lipsia",   es: "Leipzig",     fr: "Leipzig",   de: "Leipzig",   pt: "Lípsia" },
  Freiburg:     { it: "Friburgo in Brisgovia", fr: "Fribourg-en-Brisgau", pt: "Friburgo" },
  Heidelberg:   { it: "Heidelberga", pt: "Heidelberga" },
  Dusseldorf:   { it: "Düsseldorf", de: "Düsseldorf" },
  Düsseldorf:   { it: "Düsseldorf" },
  // ── France ───────────────────────────────────────────────────────────────
  Paris:        { it: "Parigi",   es: "París",       fr: "Paris",     de: "Paris",     pt: "Paris" },
  Marseille:    { it: "Marsiglia", es: "Marsella",   fr: "Marseille", de: "Marseille", pt: "Marselha" },
  Lyon:         { it: "Lione",    es: "Lyon",        fr: "Lyon",      de: "Lyon",      pt: "Lião" },
  Nice:         { it: "Nizza",    es: "Niza",        fr: "Nice",      de: "Nizza",     pt: "Nice" },
  Strasbourg:   { it: "Strasburgo", es: "Estrasburgo", fr: "Strasbourg", de: "Straßburg", pt: "Estrasburgo" },
  Bordeaux:     { it: "Bordeaux" },
  Toulouse:     { it: "Tolosa",   es: "Toulouse",    fr: "Toulouse",  de: "Toulouse",  pt: "Toulouse" },
  Lille:        { it: "Lilla",    fr: "Lille" },
  Nantes:       { it: "Nantes" },
  // ── Spain ────────────────────────────────────────────────────────────────
  Seville:      { it: "Siviglia", es: "Sevilla",     fr: "Séville",   de: "Sevilla",   pt: "Sevilha" },
  Cordoba:      { it: "Cordova",  es: "Córdoba",     fr: "Cordoue",   de: "Córdoba",   pt: "Córdoba" },
  Zaragoza:     { it: "Saragozza", fr: "Saragosse",  pt: "Saragoça" },
  // ── Portugal ─────────────────────────────────────────────────────────────
  Lisbon:       { it: "Lisbona",  es: "Lisboa",      fr: "Lisbonne",  de: "Lissabon",  pt: "Lisboa" },
  // ── UK ───────────────────────────────────────────────────────────────────
  London:       { it: "Londra",   es: "Londres",     fr: "Londres",   de: "London",    pt: "Londres" },
  Edinburgh:    { it: "Edimburgo", es: "Edimburgo",  fr: "Édimbourg", de: "Edinburgh", pt: "Edimburgo" },
  // ── Switzerland ──────────────────────────────────────────────────────────
  Geneva:       { it: "Ginevra",  es: "Ginebra",     fr: "Genève",    de: "Genf",      pt: "Genebra" },
  Zurich:       { it: "Zurigo",   es: "Zúrich",      fr: "Zurich",    de: "Zürich",    pt: "Zurique" },
  Bern:         { it: "Berna",    es: "Berna",       fr: "Berne",     de: "Bern",      pt: "Berna" },
  Basel:        { it: "Basilea",  es: "Basilea",     fr: "Bâle",      de: "Basel",     pt: "Basileia" },
  // ── Belgium / Netherlands / Luxembourg ───────────────────────────────────
  Brussels:     { it: "Bruxelles", es: "Bruselas",   fr: "Bruxelles", de: "Brüssel",   pt: "Bruxelas" },
  Antwerp:      { it: "Anversa",  es: "Amberes",     fr: "Anvers",    de: "Antwerpen", pt: "Antuérpia" },
  Ghent:        { it: "Gand",     es: "Gante",       fr: "Gand",      de: "Gent",      pt: "Gante" },
  "The Hague":  { it: "L'Aia",   es: "La Haya",     fr: "La Haye",   de: "Den Haag",  pt: "Haia" },
  Luxembourg:   { it: "Lussemburgo", es: "Luxemburgo", fr: "Luxembourg", de: "Luxemburg", pt: "Luxemburgo" },
  // ── Scandinavia ──────────────────────────────────────────────────────────
  Copenhagen:   { it: "Copenaghen", es: "Copenhague", fr: "Copenhague", de: "Kopenhagen", pt: "Copenhaga" },
  Stockholm:    { it: "Stoccolma", es: "Estocolmo",  fr: "Stockholm", de: "Stockholm", pt: "Estocolmo" },
  Gothenburg:   { it: "Göteborg", es: "Gotemburgo",  fr: "Göteborg",  de: "Göteborg",  pt: "Gotemburgo" },
  // ── Greece ───────────────────────────────────────────────────────────────
  Athens:       { it: "Atene",    es: "Atenas",      fr: "Athènes",   de: "Athen",     pt: "Atenas" },
  Thessaloniki: { it: "Salonicco", es: "Tesalónica", fr: "Thessalonique", de: "Thessaloniki", pt: "Tessalónica" },
  // ── Poland ───────────────────────────────────────────────────────────────
  Warsaw:       { it: "Varsavia", es: "Varsovia",    fr: "Varsovie",  de: "Warschau",  pt: "Varsóvia" },
  Krakow:       { it: "Cracovia", es: "Cracovia",    fr: "Cracovie",  de: "Krakau",    pt: "Cracóvia" },
  Kraków:       { it: "Cracovia", es: "Cracovia",    fr: "Cracovie",  de: "Krakau",    pt: "Cracóvia" },
  Wroclaw:      { it: "Breslavia", es: "Breslavia",  fr: "Breslau",   de: "Breslau",   pt: "Breslávia" },
  Wrocław:      { it: "Breslavia", es: "Breslavia",  fr: "Breslau",   de: "Breslau",   pt: "Breslávia" },
  // ── Czech Republic ───────────────────────────────────────────────────────
  Prague:       { it: "Praga",    es: "Praga",       fr: "Prague",    de: "Prag",      pt: "Praga" },
  // ── Romania ──────────────────────────────────────────────────────────────
  Bucharest:    { it: "Bucarest", es: "Bucarest",    fr: "Bucarest",  de: "Bukarest",  pt: "Bucareste" },
  // ── Balkans ──────────────────────────────────────────────────────────────
  Ljubljana:    { it: "Lubiana",  es: "Liubliana",   fr: "Ljubljana", de: "Laibach",   pt: "Liubliana" },
  Zagreb:       { it: "Zagabria", es: "Zagreb",      fr: "Zagreb",    de: "Agram",     pt: "Zagreb" },
  Belgrade:     { it: "Belgrado", es: "Belgrado",    fr: "Belgrade",  de: "Belgrad",   pt: "Belgrado" },
  // ── Russia / Ukraine ─────────────────────────────────────────────────────
  Moscow:       { it: "Mosca",    es: "Moscú",       fr: "Moscou",    de: "Moskau",    pt: "Moscovo" },
  "Saint Petersburg": { it: "San Pietroburgo", es: "San Petersburgo", fr: "Saint-Pétersbourg", de: "Sankt Petersburg", pt: "São Petersburgo" },
  "St. Petersburg":   { it: "San Pietroburgo", es: "San Petersburgo", fr: "Saint-Pétersbourg", de: "Sankt Petersburg", pt: "São Petersburgo" },
  "St Petersburg":    { it: "San Pietroburgo", es: "San Petersburgo", fr: "Saint-Pétersbourg", de: "Sankt Petersburg", pt: "São Petersburgo" },
  Kyiv:         { it: "Kiev",     es: "Kiev",        fr: "Kiev",      de: "Kiew",      pt: "Kiev" },
  Kiev:         { it: "Kiev",     es: "Kiev",        fr: "Kiev",      de: "Kiew",      pt: "Kiev" },
  Odessa:       { it: "Odessa",   fr: "Odessa",      de: "Odessa" },
  // ── Middle East ──────────────────────────────────────────────────────────
  Cairo:        { it: "Il Cairo", es: "El Cairo",    fr: "Le Caire",  de: "Kairo",     pt: "Cairo" },
  Jerusalem:    { it: "Gerusalemme", es: "Jerusalén", fr: "Jérusalem", de: "Jerusalem", pt: "Jerusalém" },
  Riyadh:       { it: "Riad",     es: "Riad",        fr: "Riyad",     de: "Riad",      pt: "Riade" },
  Baghdad:      { it: "Baghdad",  fr: "Bagdad",      es: "Bagdad",    pt: "Bagdade" },
  Tehran:       { it: "Teheran",  es: "Teherán",     fr: "Téhéran",   de: "Teheran",   pt: "Teerão" },
  // ── Africa ───────────────────────────────────────────────────────────────
  "Cape Town":  { it: "Città del Capo", es: "Ciudad del Cabo", fr: "Le Cap", de: "Kapstadt", pt: "Cidade do Cabo" },
  Tunis:        { it: "Tunisi",   es: "Túnez",       fr: "Tunis",     de: "Tunis",     pt: "Tunes" },
  Algiers:      { it: "Algeri",   es: "Argel",       fr: "Alger",     de: "Algier",    pt: "Argel" },
  Tripoli:      { it: "Tripoli",  es: "Trípoli",     fr: "Tripoli",   de: "Tripolis",  pt: "Trípoli" },
  Khartoum:     { it: "Khartum",  fr: "Khartoum",    de: "Khartum" },
  Alexandria:   { it: "Alessandria d'Egitto", es: "Alejandría", fr: "Alexandrie", de: "Alexandria", pt: "Alexandria" },
  // ── Asia ─────────────────────────────────────────────────────────────────
  Beijing:      { it: "Pechino",  es: "Pekín",       fr: "Pékin",     de: "Peking",    pt: "Pequim" },
  Tokyo:        { it: "Tokyo",    es: "Tokio",       fr: "Tokyo",     de: "Tokio",     pt: "Tóquio" },
  Seoul:        { it: "Seul",     es: "Seúl",        fr: "Séoul",     de: "Seoul",     pt: "Seul" },
  Calcutta:     { it: "Calcutta", es: "Calcuta",     fr: "Calcutta",  de: "Kalkutta",  pt: "Calcutá" },
  Kolkata:      { it: "Calcutta", es: "Calcuta",     fr: "Calcutta",  de: "Kalkutta",  pt: "Calcutá" },
  Bombay:       { it: "Bombay",   es: "Bombay",      fr: "Bombay",    de: "Bombay",    pt: "Bombaim" },
  Mumbai:       { it: "Mumbai",   es: "Bombay",      fr: "Bombay",    de: "Mumbai",    pt: "Bombaim" },
  // ── Americas ─────────────────────────────────────────────────────────────
  "New York":   { it: "New York", es: "Nueva York",  fr: "New York",  de: "New York",  pt: "Nova Iorque" },
  "Mexico City":{ it: "Città del Messico", es: "Ciudad de México", fr: "Mexico", de: "Mexiko-Stadt", pt: "Cidade do México" },
  Havana:       { it: "L'Avana", es: "La Habana",    fr: "La Havane", de: "Havanna",   pt: "Havana" },
  "São Paulo":  { it: "San Paolo", fr: "São Paulo",  de: "São Paulo",  pt: "São Paulo" },
  "Rio de Janeiro": { it: "Rio de Janeiro" },
  "Buenos Aires":   { it: "Buenos Aires" },
  "Quebec City":    { it: "Québec", fr: "Québec",    es: "Quebec",    pt: "Quebec" },
};

export function cityNameLocalized(name: string, lang: string): string {
  const base = lang.split("-")[0];
  const overrides = CITY_NAME_OVERRIDES[name];
  if (overrides && overrides[base]) return overrides[base]!;
  return name;
}

// ── Async Nominatim-based city name resolution (with in-memory cache) ────────
const _cityNameCache = new Map<string, string>(); // "name|country|lang" → localized

export async function resolveLocalizedCityNameAsync(
  name: string, country: string, lang: string, lat?: number, lng?: number,
): Promise<string> {
  const base = lang.split("-")[0];
  // 1. Static map
  const staticResult = cityNameLocalized(name, base);
  if (staticResult !== name) return staticResult;
  if (base === "en") return name;
  // 2. Cache
  const cacheKey = `${name}|${country}|${base}`;
  if (_cityNameCache.has(cacheKey)) return _cityNameCache.get(cacheKey)!;
  // 3. Nominatim
  try {
    const url = (typeof lat === "number" && typeof lng === "number")
      ? `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&namedetails=1&zoom=10`
      : `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(name)}&countrycodes=${country.toLowerCase()}&format=json&limit=1&namedetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VoyagerTravelApp/1.0", "Accept-Language": `${base},en;q=0.5` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as unknown;
    let nd: Record<string, string> | undefined;
    if (Array.isArray(data)) {
      nd = (data[0] as { namedetails?: Record<string, string> })?.namedetails;
    } else {
      nd = (data as { namedetails?: Record<string, string> })?.namedetails;
    }
    const localized = nd?.[`name:${base}`] ?? nd?.["name:en"] ?? name;
    _cityNameCache.set(cacheKey, localized);
    return localized;
  } catch {
    _cityNameCache.set(cacheKey, name);
    return name;
  }
}

/** React hook: returns Map<"country|name", localizedName>.
 *  Resolves immediately from static map; then async from Nominatim for misses. */
export function useLocalizedCityNames(
  cities: Array<{ name: string; country: string; lat?: number; lng?: number }>,
  lang: string,
): Map<string, string> {
  const base = lang.split("-")[0];
  const [names, setNames] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const c of cities) m.set(`${c.country}|${c.name}`, cityNameLocalized(c.name, base));
    return m;
  });

  const citiesKey = cities.map((c) => `${c.country}|${c.name}`).join(",");

  useEffect(() => {
    if (cities.length === 0) return;
    let alive = true;
    const updated = new Map<string, string>();
    for (const c of cities) updated.set(`${c.country}|${c.name}`, cityNameLocalized(c.name, base));
    setNames(new Map(updated));

    if (base === "en") return;
    const pending = cities.filter((c) => cityNameLocalized(c.name, base) === c.name);
    if (pending.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    async function resolveSequentially() {
      for (let i = 0; i < pending.length; i++) {
        if (!alive) break;
        const c = pending[i];
        const localized = await resolveLocalizedCityNameAsync(c.name, c.country, base, c.lat, c.lng);
        if (!alive) break;
        updated.set(`${c.country}|${c.name}`, localized);
        setNames(new Map(updated));
        if (i < pending.length - 1) {
          await new Promise<void>((r) => { timer = setTimeout(r, 1100); });
        }
      }
    }
    resolveSequentially().catch(() => { /* ignore */ });
    return () => { alive = false; if (timer) clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citiesKey, base]);

  return names;
}

// ── City loading (async, module-level cache + React hook) ───────────────────
export type CityEntry = { name: string; country: string; flag: string; lat?: number; lng?: number };

const CITYLESS_FALLBACK: Record<string, string> = {
  HK: "Hong Kong", MO: "Macao", SG: "Singapore",
  VA: "Vatican City", MC: "Monaco", GI: "Gibraltar",
};

const COUNTRIESNOW_NAME_MAP: Record<string, string> = {
  "Côte d'Ivoire": "Ivory Coast", "Korea (South)": "South Korea",
  "Korea (North)": "North Korea", "Congo, DR": "DR Congo",
  "Myanmar": "Myanmar (Burma)", "Czechia": "Czech Republic",
  "North Macedonia": "Macedonia", "Cabo Verde": "Cape Verde",
  "Timor-Leste": "East Timor", "Eswatini": "Swaziland",
};

const _cityCache = new Map<string, CityEntry[]>();
const _cityLoading = new Set<string>();
const _cityListeners = new Map<string, Array<() => void>>();

function _notifyCityListeners(iso: string) {
  for (const cb of _cityListeners.get(iso) ?? []) { try { cb(); } catch { /* ignore */ } }
}

async function _fetchCitiesForCountry(iso: string): Promise<void> {
  if (_cityCache.has(iso) || _cityLoading.has(iso)) return;
  _cityLoading.add(iso);
  const flag = flagOf(iso);
  if (CITYLESS_FALLBACK[iso]) {
    _cityCache.set(iso, [{ name: CITYLESS_FALLBACK[iso], country: iso, flag }]);
    _cityLoading.delete(iso);
    _notifyCityListeners(iso);
    return;
  }
  const rawName = countryByIso(iso)?.name ?? iso;
  const apiName = COUNTRIESNOW_NAME_MAP[rawName] ?? rawName;
  try {
    const res = await fetch(
      `https://countriesnow.space/api/v0.1/countries/cities/q?country=${encodeURIComponent(apiName)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const json = await res.json() as { data?: unknown };
    const cityNames: string[] = Array.isArray(json.data) ? (json.data as string[]) : [];
    const cities: CityEntry[] = cityNames
      .filter((n) => typeof n === "string" && n.trim().length > 0)
      .map((name) => ({ name: name.trim(), country: iso, flag }))
      .sort((a, b) => a.name.localeCompare(b.name));
    _cityCache.set(iso, cities);
  } catch {
    _cityCache.set(iso, []);
  }
  _cityLoading.delete(iso);
  _notifyCityListeners(iso);
}

export function citiesOfCountry(iso: string): CityEntry[] {
  const ISO = iso.toUpperCase();
  if (_cityCache.has(ISO)) return _cityCache.get(ISO)!;
  void _fetchCitiesForCountry(ISO);
  return [];
}

export function useCitiesOfCountry(isos: string[]): CityEntry[] {
  const [, forceUpdate] = useState(0);
  const key = isos.join(",");
  useEffect(() => {
    if (isos.length === 0) return;
    const cleanups: Array<() => void> = [];
    for (const raw of isos) {
      const ISO = raw.toUpperCase();
      const listener = () => forceUpdate((n) => n + 1);
      const list = _cityListeners.get(ISO) ?? [];
      list.push(listener);
      _cityListeners.set(ISO, list);
      cleanups.push(() => {
        const l = _cityListeners.get(ISO);
        if (l) _cityListeners.set(ISO, l.filter((x) => x !== listener));
      });
      void _fetchCitiesForCountry(ISO);
    }
    return () => cleanups.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const cities: CityEntry[] = [];
  for (const raw of isos) {
    const ISO = raw.toUpperCase();
    for (const c of (_cityCache.get(ISO) ?? [])) cities.push(c);
  }
  return cities;
}

export async function geocodeCity(name: string, iso: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search` +
      `?city=${encodeURIComponent(name)}&countrycodes=${iso.toLowerCase()}` +
      `&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VoyagerTravelApp/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch { /* ignore */ }
  return null;
}

type Change = { until: string; currency: string };
const HISTORY: Record<string, Change[]> = {
  HR:[{until:"2023-01-01",currency:"HRK"}],LT:[{until:"2015-01-01",currency:"LTL"}],
  LV:[{until:"2014-01-01",currency:"LVL"}],EE:[{until:"2011-01-01",currency:"EEK"}],
  SK:[{until:"2009-01-01",currency:"SKK"}],MT:[{until:"2008-01-01",currency:"MTL"}],
  CY:[{until:"2008-01-01",currency:"CYP"}],SI:[{until:"2007-01-01",currency:"SIT"}],
  GR:[{until:"2001-01-01",currency:"GRD"}],DE:[{until:"1999-01-01",currency:"DEM"}],
  FR:[{until:"1999-01-01",currency:"FRF"}],IT:[{until:"1999-01-01",currency:"ITL"}],
  ES:[{until:"1999-01-01",currency:"ESP"}],PT:[{until:"1999-01-01",currency:"PTE"}],
  NL:[{until:"1999-01-01",currency:"NLG"}],BE:[{until:"1999-01-01",currency:"BEF"}],
  LU:[{until:"1999-01-01",currency:"LUF"}],AT:[{until:"1999-01-01",currency:"ATS"}],
  FI:[{until:"1999-01-01",currency:"FIM"}],IE:[{until:"1999-01-01",currency:"IEP"}],
  TR:[{until:"2005-01-01",currency:"TRL"}],
};

export function currencyForCountryAt(iso: string, dateISO: string): string | null {
  const ISO = iso.toUpperCase();
  const changes = HISTORY[ISO];
  if (changes) {
    for (const ch of changes) { if (dateISO < ch.until) return ch.currency; }
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
