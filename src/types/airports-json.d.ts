declare module "airports-json" {
  export interface Airport {
    id?: string;
    ident?: string;
    type?: string;
    name: string;
    latitude_deg?: string;
    longitude_deg?: string;
    iso_country?: string;
    iso_region?: string;
    municipality?: string;
    scheduled_service?: string;
    gps_code?: string;
    iata_code?: string;
    local_code?: string;
  }
  export const airports: Airport[];
  export const countries: unknown[];
  export const regions: unknown[];
  const _default: { airports: Airport[]; countries: unknown[]; regions: unknown[] };
  export default _default;
}