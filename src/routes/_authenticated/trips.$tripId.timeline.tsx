import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plane, Train, Car, Bike, Ship, Hotel, MapPin, Sparkles, ArrowRightLeft,
  PlaneTakeoff, PlaneLanding, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { listItems, createItem, deleteItem, ITEM_KINDS } from "@/lib/itinerary.functions";
import { getTrip, updateTrip } from "@/lib/trips.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/trips/$tripId/timeline")({
  component: TimelineView,
});

const KIND_ICON: Record<(typeof ITEM_KINDS)[number], React.ComponentType<{ className?: string }>> = {
  outbound: PlaneTakeoff,
  return: PlaneLanding,
  flight: Plane,
  train: Train,
  car: Car,
  moto: Bike,
  ferry: Ship,
  transfer: ArrowRightLeft,
  lodging: Hotel,
  activity: Sparkles,
  zone: MapPin,
  other: MapPin,
};

function TimelineView() {
  const { tripId } = Route.useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tripFn = useServerFn(getTrip);
  const itemFn = useServerFn(listItems);
  const updFn = useServerFn(updateTrip);
  const delFn = useServerFn(deleteItem);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const items = useQuery({ queryKey: ["items", tripId], queryFn: () => itemFn({ data: { trip_id: tripId } }) });

  if (!trip.data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  const mode = trip.data.timeline_mode;
  const list = items.data ?? [];
  const outbound = list.find((i) => i.kind === "outbound");
  const ret = list.find((i) => i.kind === "return");
  const middle = list.filter((i) => i.kind !== "outbound" && i.kind !== "return");

  // Group middle
  let groups: { label: string; items: typeof middle }[] = [];
  if (mode === "days") {
    const start = new Date(trip.data.start_date);
    const end = new Date(trip.data.end_date);
    const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    groups = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      return {
        label: `${t("day_of", { n: i + 1 })} · ${d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })}`,
        items: middle.filter((it) =>
          it.start_at ? it.start_at.slice(0, 10) === iso : it.day_index === i + 1,
        ),
      };
    });
  } else {
    const byKind = new Map<string, typeof middle>();
    for (const it of middle) {
      const arr = byKind.get(it.kind) ?? [];
      arr.push(it);
      byKind.set(it.kind, arr);
    }
    groups = Array.from(byKind.entries()).map(([k, v]) => ({ label: t(k), items: v }));
  }

  async function setMode(m: "days" | "activities") {
    try {
      await updFn({ data: { id: tripId, patch: { timeline_mode: m } } });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  async function del(id: string) {
    if (!confirm(t("delete_confirm"))) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["items", tripId] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-border bg-card p-1 text-xs shadow-soft">
          <button
            className={`rounded-full px-3 py-1.5 transition ${mode === "days" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("days")}
          >{t("by_days")}</button>
          <button
            className={`rounded-full px-3 py-1.5 transition ${mode === "activities" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("activities")}
          >{t("by_activities")}</button>
        </div>
        <div className="ml-auto">
          <AddItemDialog tripId={tripId} />
        </div>
      </div>

      <div className="space-y-3">
        <TripBoundaryRow item={outbound} tripId={tripId} kind="outbound" />

        {groups.map((g) => (
          <section key={g.label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{g.label}</h3>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="relative space-y-3 border-l border-border pl-5">
                {g.items.map((it) => {
                  const Icon = KIND_ICON[it.kind as keyof typeof KIND_ICON] ?? MapPin;
                  return (
                    <li key={it.id} className="relative">
                      <span className="absolute -left-[27px] top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t(it.kind)}</p>
                          <p className="truncate font-medium">{it.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {it.location && <>{it.location} · </>}
                            {it.start_at && fmtDT(it.start_at)}
                            {it.end_at && ` → ${fmtDT(it.end_at)}`}
                          </p>
                          {it.notes && <p className="mt-1 text-xs text-muted-foreground">{it.notes}</p>}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => del(it.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        <TripBoundaryRow item={ret} tripId={tripId} kind="return" />
      </div>
    </div>
  );
}

function TripBoundaryRow({
  item, tripId, kind,
}: {
  item: { id: string; title: string; location: string | null; start_at: string | null } | undefined;
  tripId: string;
  kind: "outbound" | "return";
}) {
  const { t } = useTranslation();
  const Icon = kind === "outbound" ? PlaneTakeoff : PlaneLanding;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-warm-gradient p-4 text-primary-foreground shadow-soft">
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-widest opacity-90">{t(kind)}</p>
        {item ? (
          <p className="truncate font-medium">
            {item.title}{item.location ? ` · ${item.location}` : ""}{item.start_at ? ` · ${fmtDT(item.start_at)}` : ""}
          </p>
        ) : (
          <AddBoundaryButton tripId={tripId} kind={kind} />
        )}
      </div>
    </div>
  );
}

function AddBoundaryButton({ tripId, kind }: { tripId: string; kind: "outbound" | "return" }) {
  const { t } = useTranslation();
  return <AddItemDialog tripId={tripId} defaultKind={kind} trigger={<button className="text-sm underline opacity-95">{t("add_item")}</button>} />;
}

function AddItemDialog({
  tripId, defaultKind = "activity", trigger,
}: {
  tripId: string;
  defaultKind?: (typeof ITEM_KINDS)[number];
  trigger?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fn = useServerFn(createItem);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kind: defaultKind,
    title: "",
    location: "",
    start_at: "",
    end_at: "",
    notes: "",
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="rounded-full"><Plus className="mr-1.5 h-4 w-4" />{t("add_item")}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("add_item")}</DialogTitle></DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await fn({
                data: {
                  trip_id: tripId,
                  kind: form.kind,
                  title: form.title,
                  location: form.location || null,
                  start_at: form.start_at || null,
                  end_at: form.end_at || null,
                  notes: form.notes || null,
                  position: 0,
                },
              });
              qc.invalidateQueries({ queryKey: ["items", tripId] });
              setOpen(false);
              setForm({ ...form, title: "", location: "", start_at: "", end_at: "", notes: "" });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t("error_generic"));
            }
          }}
        >
          <div className="space-y-1.5">
            <Label>{t("category")}</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as (typeof ITEM_KINDS)[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_KINDS.map((k) => <SelectItem key={k} value={k}>{t(k)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("title")}</Label>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("location")}</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("starts_at")}</Label>
              <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("ends_at")}</Label>
              <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("notes")}</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="submit">{t("save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fmtDT(s: string) {
  const d = new Date(s);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}