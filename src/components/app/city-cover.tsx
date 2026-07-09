import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

/**
 * Renders a background for a trip cover. Priority:
 *   1. `src` (user-uploaded photo or explicit URL) — fades in over the gradient
 *   2. `gradient` (default: flag-derived gradient for the trip's country)
 *   3. Neutral warm gradient placeholder
 *
 * The gradient/placeholder is always rendered as the bottom layer so there
 * is never a transparent "blank" period while the photo is loading.
 */
export function CityCover({
  src,
  gradient,
  className,
  rounded,
  overlay,
  eager,
}: {
  /** Legacy hint kept for call-site compatibility; not used for rendering. */
  query?: string;
  src?: string | null;
  gradient?: string | null;
  className?: string;
  rounded?: string;
  /** Apply a dark legibility overlay. Defaults to `true` when a photo is shown. */
  overlay?: boolean;
  /** Load the image eagerly (e.g. the active carousel card). Defaults to lazy. */
  eager?: boolean;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset loaded state whenever the image URL changes
  useEffect(() => {
    setImgLoaded(false);
  }, [src]);

  const showOverlay = overlay ?? Boolean(src);

  return (
    <div className={`absolute inset-0 overflow-hidden ${rounded ?? ""}`}>
      {/* ── Background layer: always visible, prevents transparent period ── */}
      {gradient ? (
        <div className="absolute inset-0" style={{ background: gradient }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-warm-gradient/40">
          <MapPin className="h-7 w-7 text-white/70" />
        </div>
      )}

      {/* ── Photo layer: fades in over the gradient once loaded ── */}
      {src && (
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            imgLoaded ? "opacity-100" : "opacity-0"
          } ${className ?? ""}`}
        />
      )}

      {showOverlay && <div className="absolute inset-0 bg-card-overlay" />}
    </div>
  );
}
