import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/app/language-switcher";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Voyager" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("password_updated"));
      nav({ to: "/trips", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center px-4 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-warm-gradient text-primary-foreground">
            <Compass className="h-5 w-5" />
          </span>
          <span className="font-serif text-lg font-semibold">Voyager</span>
        </Link>
        <div className="ml-auto">
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-10">
        <div className="text-center">
          <h1 className="font-serif text-3xl font-bold">{t("reset_password")}</h1>
        </div>

        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">
            {t("open_from_email_link")}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("new_password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {t("update_password")}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
