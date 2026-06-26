import { useQuery } from "@tanstack/react-query";
import { fetchCityCover } from "@/lib/wiki-cover";
import { MapPin } from "lucide-react";

/**
 * Renders a background image for a trip. If `src` is provided (user-uploaded
 * or stored Wikipedia URL), uses it directly. Otherwise asynchronously looks
 * up a Wikipedia thumbnail for the given query.
 */
export function CityCover({
  query,
  src,
  className,
  rounded,
}: {
  query: string;
  src?: string | null;
  className?: string;
  rounded?: string;
}) {
  const q = useQuery({
    queryKey: ["wiki-cover", query],
    queryFn: () => fetchCityCover(query),
    enabled: !src && !!query,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const url = src || q.data || null;

  return (
    <div className={`absolute inset-0 overflow-hidden ${rounded ?? ""}`}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className={`h-full w-full ${className ?? ""}`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-warm-gradient/40">
          <MapPin className="h-7 w-7 text-white/70" />
        </div>
      )}
      <div className="absolute inset-0 bg-card-overlay" />
    </div>
  );
}
