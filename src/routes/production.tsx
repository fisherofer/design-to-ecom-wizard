import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { buildOrder, planSlots, schedule, useSchedule } from "@/lib/productionSchedule";
import { cast } from "@/lib/castStudio";
import { useNewsSources } from "@/lib/newsSources";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production Board — Event-Driven Show Schedule" },
      { name: "description", content: "Pre-open, post-open, weekly, monthly and seasonal programmes built from real events since the last show." },
      { property: "og:title", content: "Production Board" },
      { property: "og:description", content: "Event-driven programme schedule with coverage windows and build orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductionPage,
});

const READY: Record<string, string> = {
  due: "מוכן להפקה", early_possible: "אפשר להפיק מוקדם", waiting: "ממתין", disabled: "כבוי", needs_material: "חסר חומר",
};

function ProductionPage() {
  const state = useSchedule();
  const sources = useNewsSources();
  // Real material count = enabled sources relevant to the slot; actual reading happens on the Sources screen.
  const plans = useMemo(
    () => (state.slots.length ? planSlots(state, (_w, slot) =>
      sources.filter((s) => s.enabled && slot.regions.includes(s.region) && slot.kinds.includes(s.kind)).length) : []),
    [state, sources],
  );

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">לוח הפקה</h1>
          <p className="text-sm text-muted-foreground">כל תוכנית מכסה את האירועים מהתוכנית הקודמת שלה ועד רגע ההפקה.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={state.useHistory} onChange={(e) => schedule.setFlags({ useHistory: e.target.checked })} />השוואה להיסטוריה</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={state.buildEarly} onChange={(e) => schedule.setFlags({ buildEarly: e.target.checked })} />הפקה ברגע שיש מספיק חומר</label>
          <button onClick={() => schedule.reset()} className="rounded-md border border-border px-3 py-1">איפוס</button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {plans.map((p) => (
          <div key={p.slot.id} className="space-y-2 rounded-md border border-border bg-card p-3 text-sm">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={p.slot.enabled} onChange={(e) => schedule.patchSlot(p.slot.id, { enabled: e.target.checked })} />
              <strong className="flex-1">{p.slot.label}</strong>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{READY[p.readiness]}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>שעה <input type="time" value={p.slot.dueAt} onChange={(e) => schedule.patchSlot(p.slot.id, { dueAt: e.target.value })} className="rounded border border-border bg-background px-1" /></span>
              <span>אורך <input type="number" value={p.slot.targetSeconds} onChange={(e) => schedule.patchSlot(p.slot.id, { targetSeconds: Number(e.target.value) || 60 })} className="w-16 rounded border border-border bg-background px-1" />ש׳</span>
              <span>מינ׳ אירועים {p.slot.minEvents} · זמין {p.eventsAvailable}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              חלון: {new Date(p.window.fromISO).toLocaleString("he-IL")} ← {new Date(p.window.toISO).toLocaleString("he-IL")} ({Math.round(p.window.hours)} שעות)
            </div>
            <p className="text-xs">{p.reason}</p>
            <button
              disabled={p.readiness !== "due" && p.readiness !== "early_possible"}
              onClick={() => {
                const order = buildOrder(p, state);
                cast.enqueue({ title: order.title, slotId: order.slotId, productionDate: order.productionDate, seconds: order.targetSeconds, note: order.topic, status: "queued" });
                schedule.markProduced(p.slot.id);
                toast.success("נוסף לתור הסרטים — ממתין לאישור במסך הדמויות");
              }}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
            >צור הזמנת הפקה</button>
          </div>
        ))}
      </div>
    </div>
  );
}
