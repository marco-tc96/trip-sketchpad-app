import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, X, Plus } from "lucide-react";
import { createTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { CURRENCIES } from "@/lib/currencies";
import {
  allCountries,
  citiesOfCountry,
  countryByIso,
  currencyForCountryAt,
  flagOf,
} from "@/lib/country-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trips/new")({
  component: NewTrip,
});

type CityPick = { name: string; country: string; lat?: number; lng?: number };

function NewTrip() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const profileFn = useServerFn(getProfile);
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const createFn = useServerFn(createTrip);

  const countries = useMemo(() => allCountries(), []);

  const [title, setTitle] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("");
  const [emojiTouched, setEmojiTouched] = useState(false);
  const [pickedCountries, setPickedCountries] = useState<string[]>([]);
  // Auto-set cover emoji to the first country flag unless the user typed one.
  useEffect(() => {
    if (emojiTouched) return;
    const iso = pickedCountries[0];
    setCoverEmoji(iso ? flagOf(iso) : "");
  }, [pickedCountries, emojiTouched]);

  const [pickedCities, setPickedCities] = useState<CityPick[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [currency, setCurrency] = useState("EUR");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Auto-select currency based on first country and start date (historical aware).
  useEffect(() => {
    if (currencyTouched) return;
    const iso = pickedCountries[0];
    if (!iso) return;
    const ccy = currencyForCountryAt(iso, startDate);
    if (ccy) setCurrency(ccy);
  }, [pickedCountries, startDate, currencyTouched]);

  function toggleCountry(iso: string) {
    setPickedCountries((cs) =>
      cs.includes(iso) ? cs.filter((c) => c !== iso) : [...cs, iso],
    );
    // Drop cities whose country no longer selected.
    setPickedCities((cities) =>
      cities.filter(
        (c) => c.country !== iso || pickedCountries.includes(iso),
      ),
    );
  }

  function removeCountry(iso: string) {
    setPickedCountries((cs) => cs.filter((c) => c !== iso));
    setPickedCities((cities) => cities.filter((c) => c.country !== iso));
  }

  function toggleCity(c: CityPick) {
    setPickedCities((cs) => {
      const key = `${c.country}|${c.name}`;
      const exists = cs.some((x) => `${x.country}|${x.name}` === key);
      return exists
        ? cs.filter((x) => `${x.country}|${x.name}` !== key)
        : [...cs, c];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(t("title") + " ?");
      return;
    }
    setBusy(true);
    try {
      const primaryCountryIso = pickedCountries[0];
      const primaryCountryName = primaryCountryIso
        ? countryByIso(primaryCountryIso)?.name ?? null
        : null;
      const primaryCity = pickedCities[0]?.name ?? null;
      // Fall back to country flag if user didn't pick an emoji.
      const emoji =
        coverEmoji.trim() ||
        (primaryCountryIso ? flagOf(primaryCountryIso) : "✈️");

      const row = await createFn({
        data: {
          title: title.trim(),
          destination: primaryCity,
          country: primaryCountryName,
          countries: pickedCountries,
          cities: pickedCities,
          cover_url: null,
          start_date: startDate,
          end_date: endDate,
          local_currency: currency,
          cover_emoji: emoji,
          notes: notes || null,
          timeline_mode: "days",
        },
      });
      qc.invalidateQueries({ queryKey: ["trips"] });
      nav({ to: "/trips/$tripId", params: { tripId: row.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-3xl font-bold">{t("new_trip")}</h1>
      <form
        onSubmit={submit}
        className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft"
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <div className="space-y-1.5">
            <Label>Emoji</Label>
            <Input
              className="w-16 text-center text-xl"
              value={coverEmoji}
              onChange={(e) => {
                setCoverEmoji(e.target.value);
                setEmojiTouched(true);
              }}
              placeholder={pickedCountries[0] ? flagOf(pickedCountries[0]) : "✈️"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("title")}</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Croazia 2017, Tokyo capodanno…"
            />
          </div>
        </div>

        {/* Countries */}
        <div className="space-y-1.5">
          <Label>{t("country")}</Label>
          <CountryPicker
            countries={countries}
            picked={pickedCountries}
            onToggle={toggleCountry}
          />
          {pickedCountries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {pickedCountries.map((iso) => {
                const c = countryByIso(iso);
                if (!c) return null;
                return (
                  <Badge
                    key={iso}
                    variant="secondary"
                    className="gap-1 rounded-full pl-2 pr-1"
                  >
                    <span>{c.flag}</span>
                    <span>{c.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => removeCountry(iso)}
                      className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-foreground/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        {/* Cities */}
        <div className="space-y-1.5">
          <Label>{t("destination")}</Label>
          {pickedCountries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("country")} →
            </p>
          ) : (
            <CityPicker
              countries={pickedCountries}
              picked={pickedCities}
              onToggle={toggleCity}
            />
          )}
          {pickedCities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {pickedCities.map((c) => (
                <Badge
                  key={`${c.country}|${c.name}`}
                  variant="secondary"
                  className="gap-1 rounded-full pl-2 pr-1"
                >
                  <span>{flagOf(c.country)}</span>
                  <span>{c.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => toggleCity(c)}
                    className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-foreground/10"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("start_date")}</Label>
            <Input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("end_date")}</Label>
            <Input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Currency */}
        <div className="space-y-1.5">
          <Label>{t("local_currency")}</Label>
          <Select
            value={currency}
            onValueChange={(v) => {
              setCurrency(v);
              setCurrencyTouched(true);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {currency && !CURRENCIES.includes(currency as never) && (
                <SelectItem value={currency}>{currency}</SelectItem>
              )}
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {profile.data && (
              <>
                {t("home_currency")}: {profile.data.home_currency} ·{" "}
              </>
            )}
            {!currencyTouched && pickedCountries[0]
              ? `Auto (${countryByIso(pickedCountries[0])?.name}, ${startDate.slice(0, 4)})`
              : currencyTouched
                ? "Manual"
                : ""}
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label>{t("notes")}</Label>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={() => nav({ to: "/trips" })}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={busy} className="ml-auto">
            {t("save")}
          </Button>
        </div>
      </form>
    </main>
  );
}

function CountryPicker({
  countries,
  picked,
  onToggle,
}: {
  countries: ReturnType<typeof allCountries>;
  picked: string[];
  onToggle: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-muted-foreground">
            {picked.length === 0
              ? "Seleziona uno o più stati…"
              : `${picked.length} stat${picked.length === 1 ? "o" : "i"} selezionat${picked.length === 1 ? "o" : "i"}`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Cerca stato…" />
          <CommandList className="max-h-72">
            <CommandEmpty>Nessun risultato</CommandEmpty>
            <CommandGroup>
              {countries.map((c) => {
                const sel = picked.includes(c.iso);
                return (
                  <CommandItem
                    key={c.iso}
                    value={`${c.name} ${c.iso}`}
                    onSelect={() => onToggle(c.iso)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        sel ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="mr-2">{c.flag}</span>
                    <span>{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.currency}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CityPicker({
  countries,
  picked,
  onToggle,
}: {
  countries: string[];
  picked: CityPick[];
  onToggle: (c: CityPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const multi = countries.length > 1;

  const cities = useMemo(() => {
    const out: { name: string; country: string; flag: string; lat?: number; lng?: number }[] = [];
    for (const iso of countries) {
      for (const c of citiesOfCountry(iso)) out.push(c);
    }
    return out;
  }, [countries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cities.slice(0, 200);
    return cities
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 200);
  }, [cities, query]);

  const canAddCustom =
    query.trim().length >= 2 &&
    !filtered.some((c) => c.name.toLowerCase() === query.trim().toLowerCase());

  function addCustom() {
    const name = query.trim();
    if (!name) return;
    const iso = countries[0];
    onToggle({ name, country: iso });
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-muted-foreground">
            {picked.length === 0
              ? "Cerca o aggiungi città…"
              : `${picked.length} città selezionate`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digita per cercare…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-72">
            {filtered.length === 0 && !canAddCustom && (
              <CommandEmpty>Nessuna città</CommandEmpty>
            )}
            {canAddCustom && (
              <CommandGroup heading="Aggiungi">
                <CommandItem onSelect={addCustom}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Aggiungi "{query.trim()}"</span>
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((c) => {
                  const key = `${c.country}|${c.name}`;
                  const sel = picked.some(
                    (x) => `${x.country}|${x.name}` === key,
                  );
                  return (
                    <CommandItem
                      key={key}
                      value={key}
                      onSelect={() =>
                      onToggle({
                        name: c.name,
                        country: c.country,
                        lat: c.lat,
                        lng: c.lng,
                      })
                      }
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          sel ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {multi && <span className="mr-2">{c.flag}</span>}
                      <span>{c.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}