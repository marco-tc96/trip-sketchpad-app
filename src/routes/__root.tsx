import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { Compass } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@/i18n";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme";
import { DockStyleProvider } from "@/lib/dock-style";
import { Toaster } from "@/components/ui/sonner";
import { subscribePush, checkTripNotifications } from "@/lib/notifications.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Splash screen ─────────────────────────────────────────────────────────────

function SplashScreen({ fading }: { fading: boolean }) {
  return (
    <div
      className={[
        "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background",
        "transition-opacity duration-500",
        fading ? "pointer-events-none opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-warm-gradient shadow-soft">
          <Compass className="h-10 w-10 text-white" strokeWidth={1.75} />
        </div>
        <span className="font-serif text-3xl font-bold tracking-tight text-foreground">
          Voyager
        </span>
      </div>
    </div>
  );
}

/** Renders children immediately (so they can start loading in background),
 *  then overlays the splash until auth resolves and fades it out. */
function SplashWrapper({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!loading && visible) {
      setFading(true);
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [loading, visible]);

  return (
    <>
      {children}
      {visible && <SplashScreen fading={fading} />}
    </>
  );
}

// ── Push helpers ──────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// ── Notification bootstrap ────────────────────────────────────────────────────

/**
 * Mounts inside AuthProvider. Renders nothing.
 * 1. Registers /sw.js and subscribes to Web Push (once per user session).
 * 2. Polls checkTripNotifications every 5 min so in-app notifications
 *    appear even before the edge-function cron fires.
 */
function NotificationBootstrap() {
  const { user } = useAuth();
  const subscribeFn = useServerFn(subscribePush);
  const checkFn = useServerFn(checkTripNotifications);
  const qc = useQueryClient();

  // Register service worker + subscribe to Web Push
  useEffect(() => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapidKey = "BHxhapEufuQxX5IHMuzyHNRAQQuSFdfTv0mUqmVPclpd7uiwlD_O8kcNThXqrLJM39EbkZ5VinIWkYVM7wSUtVI";

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        let perm = Notification.permission;
        if (perm === "default") perm = await Notification.requestPermission();
        if (perm !== "granted") return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
          });
        }

        const p256dh = sub.getKey("p256dh");
        const authKey = sub.getKey("auth");
        if (!p256dh || !authKey) return;

        await subscribeFn({
          data: {
            endpoint: sub.endpoint,
            p256dh: arrayBufferToBase64(p256dh),
            auth: arrayBufferToBase64(authKey),
          },
        });
      } catch (e) {
        console.error("[Voyager] Push subscription failed:", e);
      }
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for trip notifications every 5 minutes
  useEffect(() => {
    if (!user) return;

    const check = async () => {
      try {
        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        await checkFn({ data: { localDate, utcOffsetMinutes: -now.getTimezoneOffset() } });
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["notifications-count"] });
      } catch (e) {
        console.error("[Voyager] Notification check failed:", e);
      }
    };

    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ── Root route ────────────────────────────────────────────────────────────────

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // maximum-scale=1 + user-scalable=no disable pinch/double-tap zoom of
      // the whole page on mobile — without this, a user could zoom the
      // entire app in/out (not just the map), throwing off fixed-position
      // headers/docks and touch targets across every page.
      // viewport-fit=cover lets the page draw underneath the iOS status bar/
      // notch and home indicator (paired with apple-mobile-web-app-status-
      // bar-style below) instead of the OS leaving that whole strip an
      // opaque, un-themed black bar the app can't paint anything behind —
      // env(safe-area-inset-top) below then reserves exactly that height for
      // a blurred header so the system clock/battery icons stay legible with
      // the app's own content visible (blurred) behind them, matching how
      // native iOS apps treat the status bar area.
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "Voyager — Travel Journal & Planner" },
      { name: "description", content: "Track every trip: itineraries, flights, lodging, expenses and live currency conversion. Plan future journeys with a beautiful timeline." },
      { name: "theme-color", content: "#c2632c" },
      // Only takes effect when installed to the home screen (standalone
      // PWA) — "black-translucent" is what makes the status bar area
      // translucent/overlaid instead of a solid opaque bar.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:title", content: "Voyager — Travel Journal & Planner" },
      { property: "og:description", content: "Your trips, itineraries and expenses in one elegant place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-512.png" },
      { rel: "icon", href: "/icons/icon-512.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Sync dark-mode class before first paint — prevents flash of wrong theme on splash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('voyager.theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Plain CSS @supports (not a Tailwind arbitrary variant, which can't
            express a bare property-support check reliably) — on a WebView
            that doesn't implement backdrop-filter at all, #status-bar-blur
            falls back to a solid, on-brand strip instead of the near-
            invisible black-10%/white-5% tint alone, which is what read as
            "no effect" (Foto 3: system-bar text still fully sharp). */}
        <style
          dangerouslySetInnerHTML={{
            __html: `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { #status-bar-blur { background: var(--background); opacity: 0.96; } }`,
          }}
        />
      </head>
      <body>
        {/* Rendered as a DIRECT child of <body>, OUTSIDE every context
            provider below (Query/Theme/DockStyle/Auth) — a `transform`,
            `filter` or `perspective` on ANY ancestor establishes a new
            containing block for `position: fixed` per spec, which silently
            turns this into something positioned relative to THAT ancestor
            instead of the viewport. Keeping it here, sibling to the whole
            provider tree, guarantees nothing any provider ever does to its
            wrapper can break the fixed positioning or the stacking context
            this relies on to sit above every page's content. */}
        <StatusBarBlur />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Fills exactly the iOS status-bar/notch strip (env(safe-area-inset-top) —
// 0 on any device without one, so this is a no-op everywhere else) with a
// blurred, translucent backdrop instead of leaving it the OS's own opaque
// bar. Requires viewport-fit=cover + apple-mobile-web-app-status-bar-style=
// black-translucent (see the <head> meta above) — without those two, iOS
// never lets page content extend under that area in the first place, so
// this div would just sit at y=0 with nothing behind it to blur.
// pointer-events-none so it's purely decorative and never swallows a tap
// meant for whatever's scrolled underneath it; a high z-index keeps it
// above every dialog/sheet, since the real status bar is always on top of
// the entire app, not just the current page's content.
//
// Moved to a direct child of <body> (see RootShell) and given its own
// `isolation: isolate` so it always opens a fresh stacking context rooted at
// the very top of the page, regardless of what z-index games any page below
// it plays — before this it lived deep inside QueryClientProvider >
// ThemeProvider > DockStyleProvider > AuthProvider, and if ANY of those (or
// anything Splash/Toaster mount nearby) ever gained a transform/filter of
// their own, this div's "fixed" positioning would have silently detached
// from the viewport and started tracking that ancestor instead — completely
// invisible in a static screenshot review, but exactly the kind of bug that
// makes a blur "just not show up" on a real device while looking correct in
// code.
//
// A `@supports not (backdrop-filter: ...)` fallback is now included too: on
// a WebView that doesn't implement backdrop-filter at all (some older
// in-app browsers), the previous version silently fell back to just the
// very faint `bg-black/10`/`bg-white/5` tint — which reads as "no effect
// at all", exactly what was reported ("si vede ancora testo e qualsiasi
// dettaglio a fuoco"). The fallback swaps in the page's own solid
// background colour instead, so unsupported browsers at least get an
// opaque, on-brand strip rather than a nearly-invisible tint over sharp
// text.
function StatusBarBlur() {
  return (
    <div
      id="status-bar-blur"
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] bg-black/10 dark:bg-white/5"
      style={{
        height: "env(safe-area-inset-top, 0px)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        isolation: "isolate",
        transform: "translateZ(0)",
        willChange: "backdrop-filter",
      }}
    />
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DockStyleProvider>
          <AuthProvider>
            <NotificationBootstrap />
            <SplashWrapper>
              <Outlet />
            </SplashWrapper>
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </DockStyleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}