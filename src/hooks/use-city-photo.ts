import { useQuery } from "@tanstack/react-query";
import { fetchCityCover } from "@/lib/wiki-cover";

/**
 * Resolves a Wikipedia photo URL for a city / location string. Returns null
 * while loading or when no usable photo is available. Cached via React Query
 * so repeated calls across the timeline don't hammer the API.
 */
export function useCityPhoto(query: string | null | undefined): string | null {
  const q = (query ?? "").trim();
  const { data } = useQuery({
    queryKey: ["city-photo", q.toLowerCase()],
    queryFn: () => fetchCityCover(q),
    enabled: q.length > 1,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });
  return data ?? null;
}