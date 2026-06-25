import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Compass, MapPin, Plane, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/app/language-switcher";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voyager — Travel Journal & Planner" },
      { name: "description", content: "Plan, log and remember every trip. Itineraries, expenses and live currency conversion." },
      { property: "og:title", content: "Voyager — Travel Journal & Planner" },
      { property: "og:description", content: "Plan, log and remember every trip." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/trips", replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-warm-gradient text-primary-foreground">
            <Compass className="h-5 w-5" />
          </span>
          <span className="font-serif text-lg font-semibold">{t("app_name")}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">{t("sign_in")}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-10 pb-20">
        <section className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              {t("hero_title")}
            </h1>
            <p className="mt-5 max-w-prose text-base text-muted-foreground sm:text-lg">
              {t("hero_sub")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-6">
                <Link to="/auth">{t("get_started")}</Link>
              </Button>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                { icon: Plane, label: t("timeline") },
                { icon: Wallet, label: t("expenses") },
                { icon: MapPin, label: t("exchange_rate") },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <Icon className="h-5 w-5 text-primary" />
                  <p className="mt-2 text-sm font-medium">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-[2rem] bg-warm-gradient shadow-soft md:ml-auto">
            <div className="absolute inset-6 grid place-items-center text-primary-foreground">
              <Compass className="h-40 w-40 opacity-90" strokeWidth={1.1} />
            </div>
            <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-background/95 p-4 text-sm shadow-soft">
              <div className="font-serif text-base font-semibold">Tokyo · Kyoto · Osaka</div>
              <div className="text-muted-foreground">12 {t("nights")} · ¥ → €</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
