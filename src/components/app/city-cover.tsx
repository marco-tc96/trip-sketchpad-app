import { MapPin } from "lucide-react";

/**
 * Renders a background for a trip cover. Priority:
 *   1. `src` (user-uploaded photo or explicit URL)
 *   2. `gradient` (default: flag-derived gradient for the trip's country)
 *   3. Neutral warm gradient placeholder
 */
export function CityCover({
  src,
  gradient,
  className,
  rounded,
  overlay,
}: {
  // Legacy: previously triggered a Wikipedia lookup. Kept as an optional
  // hint so existing call sites compile; not used for rendering.
  query?: string;
  src?: string | null;
  gradient?: string | null;
  className?: string;
  rounded?: string;
  /** Apply the dark legibility overlay. Defaults to `true` when a photo
   * is shown and `false` for flag-gradient backgrounds (which already
   * provide enough contrast on their own). */
  overlay?: boolean;
}) {
  const showOverlay = overlay ?? Boolean(src);
  return (
    <div className={`absolute inset-0 overflow-hidden ${rounded ?? ""}`}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className={`h-full w-full object-cover ${className ?? ""}`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : gradient ? (
        <div className="absolute inset-0" style={{ background: gradient }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-warm-gradient/40">
          <MapPin className="h-7 w-7 text-white/70" />
        </div>
      )}
      {showOverlay && <div className="absolute inset-0 bg-card-overlay" />}
    </div>
  );
}