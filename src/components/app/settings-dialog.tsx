import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Droplets, LayoutGrid, Loader2, LogOut, Moon, Settings as SettingsIcon, Sun, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
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
import { useDockStyle } from "@/lib/dock-style";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { checkUsernameAvailable } from "@/lib/profile.functions";

export type ProfileFormValues = {
  display_name: string;
  username: string;
  home_currency: string;
  language: Lang;
  home_country: string;
  birth_country: string;
};

type UsernameStatus = "idle" | "checking" | "available" | "taken";

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
  const { dockStyle, setDockStyle } = useDockStyle();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileFormValues>(initial);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  const checkUsernameFn = useServerFn(checkUsernameAvailable);

  // Re-sync form whenever dialog is reopened
  useEffect(() => {
    if (open) {
      setForm(initial);
      setUsernameStatus("idle");
    }
  }, [open, initial]);

  // Debounced username availability check
  useEffect(() => {
    const trimmed = form.username.trim();
    // No check needed if same as initial or too short
    if (!trimmed || trimmed === initial.username) {
      setUsernameStatus("idle");
      return;
    }
    if (trimmed.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsernameFn({ data: { username: trimmed } });
        setUsernameStatus(result.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username, initial.username, checkUsernameFn]);

  const lang = i18n.language || "it";
  const countries = allCountries()
    .map((c) => ({ ...c, label: countryNameLocalized(c.iso, lang) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  async function handleSave() {
    if (usernameStatus === "taken") {
      toast.error(t("username_taken"));
      return;
    }
    if (usernameStatus === "checking") {
      toast.error(t("error_generic"));
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      setOpen(false);
    } catch (e) {
      if (e instanceof Error && e.message === "username_taken") {
        setUsernameStatus("taken");
        toast.error(t("username_taken"));
      }
      // Other errors are handled by onSave
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

          {/* Username with availability indicator */}
          <div className="space-y-1.5">
            <Label>{t("username")}</Label>
            <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
              <span className="pl-3 text-sm text-muted-foreground">@</span>
              <Input
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value.replace(/\s+/g, "").toLowerCase() })
                }
                className={cn(
                  "border-0 focus-visible:ring-0",
                  usernameStatus === "taken" && "text-destructive",
                )}
                placeholder="username"
              />
              <span className="pr-3">
                {usernameStatus === "checking" && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {usernameStatus === "available" && (
                  <Check className="h-4 w-4 text-emerald-500" />
                )}
                {usernameStatus === "taken" && (
                  <X className="h-4 w-4 text-destructive" />
                )}
              </span>
            </div>
            {usernameStatus === "taken" && (
              <p className="text-xs text-destructive">{t("username_taken")}</p>
            )}
            {usernameStatus === "available" && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {t("username_available")}
              </p>
            )}
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

          {/* Country of residence + Country of birth */}
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="space-y-1.5">
              <Label>{t("birth_country")}</Label>
              <Select
                value={form.birth_country || "_none"}
                onValueChange={(v) => setForm({ ...form, birth_country: v === "_none" ? "" : v })}
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
          </div>

          {/* Appearance */}
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

          {/* Dock style — purely visual, device-local (not saved to the
              profile row, same as the light/dark toggle above), so it takes
              effect immediately via useDockStyle without going through
              onSave/handleSave at all. */}
          <div className="space-y-1.5">
            <Label>{t("dock_style")}</Label>
            <div className="inline-flex w-full rounded-full border border-border bg-secondary/40 p-1 text-sm">
              <button
                type="button"
                onClick={() => setDockStyle("default")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition",
                  dockStyle === "default"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                {t("dock_style_default")}
              </button>
              <button
                type="button"
                onClick={() => setDockStyle("liquid")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition",
                  dockStyle === "liquid"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Droplets className="h-3.5 w-3.5" />
                {t("dock_style_liquid")}
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
          <Button
            onClick={handleSave}
            disabled={saving || usernameStatus === "taken" || usernameStatus === "checking"}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
