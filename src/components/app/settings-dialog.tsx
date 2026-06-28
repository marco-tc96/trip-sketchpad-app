import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LogOut, Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/currencies";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
import { allCountries, countryNameLocalized } from "@/lib/country-data";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export type ProfileFormValues = {
  display_name: string;
  username: string;
  home_currency: string;
  language: Lang;
  home_country: string;
};

export function SettingsDialog({
  initial,
  onSave,
  trigger,
}: {
  initial: ProfileFormValues;
  onSave: (values: ProfileFormValues) => Promise<void>;
  trigger?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileFormValues>(initial);

  // Re-sync the local form state whenever the dialog is (re)opened, so it
  // always reflects the latest saved profile rather than stale edits from a
  // previous open/close cycle.
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const lang = i18n.language || "it";
  const countries = allCountries()
    .map((c) => ({ ...c, label: countryNameLocalized(c.iso, lang) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      setOpen(false);
    } catch {
      // onSave is expected to surface its own error toast; keep the dialog
      // open so the user can retry without losing their edits.
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2">
            <SettingsIcon className="h-4 w-4" />
            {t("settings")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>{t("display_name")}</Label>
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("username")}</Label>
            <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
              <span className="pl-3 text-sm text-muted-foreground">@</span>
              <Input
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value.replace(/\s+/g, "").toLowerCase() })
                }
                className="border-0 focus-visible:ring-0"
                placeholder="username"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("home_currency")}</Label>
              <Select
                value={form.home_currency}
                onValueChange={(v) => setForm({ ...form, home_currency: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("language")}</Label>
              <Select
                value={form.language}
                onValueChange={(v) => setForm({ ...form, language: v as Lang })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("home_country")}</Label>
            <Select
              value={form.home_country || "_none"}
              onValueChange={(v) => setForm({ ...form, home_country: v === "_none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="_none">—</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.iso} value={c.iso}>
                    {c.flag} {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Appearance: persisted via useTheme (localStorage), independent
              from the rest of the profile form — it applies immediately on
              click rather than waiting for "Save", matching how it already
              behaved as a header icon before this change. */}
          <div className="space-y-1.5">
            <Label>{t("appearance")}</Label>
            <div className="inline-flex w-full rounded-full border border-border bg-secondary/40 p-1 text-sm">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition",
                  theme === "light"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sun className="h-3.5 w-3.5" />
                {t("light_mode")}
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition",
                  theme === "dark"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Moon className="h-3.5 w-3.5" />
                {t("dark_mode")}
              </button>
            </div>
          </div>

          <Button
            type="button"
            variant="destructive"
            onClick={handleSignOut}
            className="w-full gap-2"
          >
            <LogOut className="h-4 w-4" />
            {t("sign_out")}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
