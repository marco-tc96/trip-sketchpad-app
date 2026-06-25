import { Link } from "@tanstack/react-router";
import { LogOut, Settings as SettingsIcon, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/auth-context";

export function AppHeader({ right }: { right?: React.ReactNode }) {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/trips" className="flex items-center gap-2 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warm-gradient text-primary-foreground">
            <Compass className="h-5 w-5" />
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight truncate">
            {t("app_name")}
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {right}
          <ThemeToggle />
          <LanguageSwitcher />
          {user && (
            <>
              <Button asChild variant="ghost" size="icon" aria-label={t("settings")}>
                <Link to="/settings"><SettingsIcon className="h-4 w-4" /></Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label={t("sign_out")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}