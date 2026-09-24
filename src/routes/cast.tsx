import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { cast, useCast, type CastRole, type GuestTrigger } from "@/lib/castStudio";

export const Route = createFileRoute("/cast")({
  head: () => ({
    meta: [
      { title: "Cast & Video Queue — Characters and Distribution Approval" },
      { name: "description", content: "Create and edit show characters, and approve queued videos per channel before distribution." },
      { property: "og:title", content: "Cast & Video Queue" },
      { property: "og:description", content: "Character editor and the approval queue for produced videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CastPage,
});

const ROLES: Record<CastRole, string> = {
  anchor: "מגיש", quant: "קוונט", skeptic: "ספקן", trader: "סוחר", comic: "קומיקאי", weather: "חזאית הבורסה", guest: "אורח / להקה",
};
const TRIGGERS: Record<GuestTrigger, string> = {
  always: "תמיד", fear_extreme: "פחד קיצוני", greed_extreme: "חמדנות קיצונית", high_volatility: "תנודתיות גבוהה",
  strong_uptrend: "מגמת עלייה", strong_downtrend: "מגמת ירידה", manual: "ידני",
};
const STATUS: Record<string, string> = {
  queued: "בתור", rendering: "בהפקה", awaiting_approval: "ממתין לאישור", approved: "אושר", distributed: "הופץ", deletable: "ניתן למחיקה",
};

function CastPage() {
  const { cast: members, queue, channels } = useCast();
  const field = "rounded-md border border-border bg-background px-2 py-1 text-sm";

  return (
    <div dir="rtl" className="space-y-8 p-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold">ניהול דמויות</h1>
          <button onClick={() => cast.create()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">דמות חדשה</button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {members.map((m) => (
            <div key={m.id} className="space-y-2 rounded-md border border-border bg-card p-3">
              <div className="flex gap-2">
                <input className={`${field} flex-1`} value={m.name} onChange={(e) => cast.update(m.id, { name: e.target.value })} />
                <select className={field} value={m.role} onChange={(e) => cast.update(m.id, { role: e.target.value as CastRole })}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className={field} value={m.language} onChange={(e) => cast.update(m.id, { language: e.target.value as "he" | "en" })}>
                  <option value="he">עברית</option><option value="en">English</option>
                </select>
              </div>
              <input className={`${field} w-full`} placeholder="קול" value={m.voice} onChange={(e) => cast.update(m.id, { voice: e.target.value })} />
              <textarea className={`${field} w-full`} rows={2} placeholder="אופי ותפקיד" value={m.persona} onChange={(e) => cast.update(m.id, { persona: e.target.value })} />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="checkbox" checked={m.enabled} onChange={(e) => cast.update(m.id, { enabled: e.target.checked })} />פעיל</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={m.guest} onChange={(e) => cast.update(m.id, { guest: e.target.checked })} />אורח</label>
                {m.guest && (
                  <select className={field} value={m.trigger} onChange={(e) => cast.update(m.id, { trigger: e.target.value as GuestTrigger })}>
                    {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
                <button onClick={() => cast.remove(m.id)} className="mr-auto text-xs text-destructive">מחק</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">תור סרטים ממתינים</h2>
        <p className="text-sm text-muted-foreground">כל סרט ממתין עד שתאשר ערוץ-ערוץ. אחרי הפצה הוא מסומן כניתן למחיקה בסוף השבוע.</p>
        {queue.length === 0 && <p className="text-sm text-muted-foreground">אין סרטים בתור עדיין — הם נוספים מלוח ההפקה.</p>}
        {queue.map((q) => (
          <div key={q.id} className="space-y-2 rounded-md border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <strong>{q.title}</strong>
              <span className="text-xs text-muted-foreground">{new Date(q.productionDate).toLocaleString("he-IL")} · {q.seconds}ש׳</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{STATUS[q.status] ?? q.status}</span>
              {q.clipPath && <span className="text-xs" dir="ltr">{q.clipPath}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {channels.map((c) => (
                <label key={c} className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs">
                  <input type="checkbox" checked={q.approvedChannels.includes(c)} onChange={() => cast.toggleChannelApproval(q.id, c)} />
                  {c}{q.distributedChannels.includes(c) ? " ✓" : ""}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                disabled={!q.approvedChannels.length}
                onClick={() => { cast.markDistributed(q.id); toast.success("סומן כהופץ"); }}
                className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >סמן כהופץ בערוצים שאושרו</button>
              <button onClick={() => cast.removeQueued(q.id)} className="rounded-md border border-border px-3 py-1 text-xs text-destructive">מחק מהתור</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
