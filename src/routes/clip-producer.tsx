import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useStudio, type Episode } from "@/lib/videoStudio";
import { cast, useCast } from "@/lib/castStudio";
import { useServerFn } from "@tanstack/react-start";
import { driveUploadClip } from "@/lib/driveSync.functions";
import { readSettings } from "@/lib/driveSyncSettings";

export const Route = createFileRoute("/clip-producer")({
  head: () => ({
    meta: [
      { title: "Clip Producer — Render Clips From Video Scripts" },
      { name: "description", content: "Turn a video script into a rendered clip, scene by scene, and send it to the approval queue." },
      { property: "og:title", content: "Clip Producer" },
      { property: "og:description", content: "Scene-by-scene clip rendering from your video scripts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClipPage,
});

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "gray";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(/\s+/);
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

function ClipPage() {
  const { episodes, band } = useStudio();
  const [epId, setEpId] = useState("");
  const [slot, setSlot] = useState("pre-open");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const upload = useServerFn(driveUploadClip);
  const castState = useCast();
  const [autoDrive, setAutoDrive] = useState(true);
  const ep: Episode | undefined = episodes.find((e) => e.id === epId);

  const render = async () => {
    const canvas = canvasRef.current;
    if (!ep || !canvas) return;
    if (ep.scenes.length === 0) { toast.error("לפרק אין סצנות — צור תסריט באולפן הווידאו"); return; }
    if (typeof MediaRecorder === "undefined") { toast.error("הדפדפן לא תומך בהקלטת וידאו"); return; }
    const ctx = canvas.getContext("2d")!;
    const colors = { bg: cssVar("--background"), fg: cssVar("--foreground"), pr: cssVar("--primary"), mu: cssVar("--muted-foreground") };
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    for (let i = 0; i < ep.scenes.length; i++) {
      const s = ep.scenes[i];
      const speaker = band.find((b) => b.id === s.speakerId)?.name ?? s.speakerId;
      const ms = (s.seconds * 1000) / speed;
      const t0 = performance.now();
      setProgress(`סצנה ${i + 1}/${ep.scenes.length}: ${s.beat}`);
      while (performance.now() - t0 < ms) {
        const p = (performance.now() - t0) / ms;
        ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = colors.pr; ctx.fillRect(0, 700, 1280 * p, 20);
        ctx.direction = "rtl"; ctx.textAlign = "right";
        ctx.fillStyle = colors.mu; ctx.font = "28px sans-serif"; ctx.fillText(`${ep.title} · ${s.beat}`, 1220, 70);
        ctx.fillStyle = colors.pr; ctx.font = "bold 40px sans-serif"; ctx.fillText(speaker, 1220, 170);
        ctx.fillStyle = colors.fg; ctx.font = "44px sans-serif"; wrap(ctx, s.line, 1220, 260, 1140, 60);
        if (s.bRoll) { ctx.fillStyle = colors.mu; ctx.font = "italic 24px sans-serif"; ctx.fillText(s.bRoll, 1220, 660); }
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: "video/webm" });
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    const url = URL.createObjectURL(blob);
    setClipUrl(url);
    setProgress(null);
    const fileName = `${ep.title.replace(/[^\w\u0590-\u05FF-]+/g, "_")}_${date.replace(/[:T]/g, "-")}.webm`;
    let clipPath = fileName;
    const folderId = readSettings().folderId;
    if (autoDrive && folderId) {
      setProgress("מעלה לגוגל דרייב...");
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await upload({ data: { folderId, name: fileName, mimeType: "video/webm", base64: btoa(bin) } });
      setProgress(null);
      if (r.ok) { clipPath = `drive:${r.path}`; toast.success("הקליפ נשמר בגוגל דרייב"); }
      else toast.error(`העלאה לדרייב נכשלה: ${r.error}`);
    } else if (autoDrive) toast.info("לא נבחרה תיקיית דרייב — הקליפ נשמר מקומית בלבד");
    cast.enqueue({
      title: ep.title, slotId: slot, episodeId: ep.id, clipPath,
      productionDate: new Date(date).toISOString(),
      seconds: ep.scenes.reduce((a, s) => a + s.seconds, 0), status: "awaiting_approval",
      note: `${ep.scenes.length} סצנות, ${(blob.size / 1e6).toFixed(1)}MB`,
    });
    toast.success("הקליפ נוצר ונכנס לתור האישור");
  };

  const field = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";
  return (
    <div dir="rtl" className="space-y-6 p-6">
      <h1 className="font-display text-2xl font-semibold">מפיק הקליפים</h1>
      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
        <label className="text-sm">תסריט
          <select className={`${field} mt-1 w-full`} value={epId} onChange={(e) => setEpId(e.target.value)}>
            <option value="">בחר פרק</option>
            {episodes.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.scenes.length} סצנות)</option>)}
          </select>
        </label>
        <label className="text-sm">משבצת הפקה
          <select className={`${field} mt-1 w-full`} value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="pre-open">פתיחת מסחר</option><option value="post-open">שעה אחרי הפתיחה</option>
            <option value="weekly">שבועי</option><option value="monthly">חודשי</option><option value="quarterly">רבעוני</option>
            <option value="breaking">מבזק</option>
          </select>
        </label>
        <label className="text-sm">תאריך הפקה
          <input type="datetime-local" className={`${field} mt-1 w-full`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-sm">מהירות תצוגה מקדימה
          <select className={`${field} mt-1 w-full`} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={1}>זמן אמת</option><option value={2}>×2</option><option value={4}>×4</option>
          </select>
        </label>
      </section>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={autoDrive} onChange={(e) => setAutoDrive(e.target.checked)} />
        שמור כל קליפ אוטומטית בגוגל דרייב (clips/תאריך) כדי לחסוך מקום בשרת
      </label>
      {episodes.length === 0 && <p className="text-sm text-muted-foreground">אין תסריטים עדיין — צור פרק באולפן הווידאו.</p>}
      {ep && (
        <ol className="space-y-1 rounded-lg border border-border bg-card p-4 text-sm">
          {ep.scenes.map((s, i) => <li key={s.id}>{i + 1}. <b>{s.beat}</b> · {s.seconds}ש׳ — {s.line}</li>)}
        </ol>
      )}
      <button disabled={!ep || !!progress} onClick={render} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
        {progress ?? "צור קליפ"}
      </button>
      <canvas ref={canvasRef} width={1280} height={720} className="w-full max-w-3xl rounded-lg border border-border" />
      {clipUrl && (
        <div className="space-y-2">
          <video src={clipUrl} controls className="w-full max-w-3xl rounded-lg" />
          <a href={clipUrl} download={`${ep?.title ?? "clip"}.webm`} className="inline-block rounded-md border border-border px-3 py-2 text-sm">הורד קליפ</a>
        </div>
      )}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">בקרה מהירה — ממתינים לאישור</h2>
        {castState.queue.filter((q) => q.status === "awaiting_approval").length === 0 && <p className="text-sm text-muted-foreground">אין קליפים ממתינים.</p>}
        <ul className="divide-y divide-border text-sm">
          {castState.queue.filter((q) => q.status === "awaiting_approval").map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-medium">{q.title}</span>
              <span className="text-xs text-muted-foreground">{new Date(q.productionDate).toLocaleString("he-IL")} · {q.clipPath}</span>
              <button onClick={() => { cast.patchQueue(q.id, { status: "approved" }); toast.success("אושר"); }} className="mr-auto rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">אשר</button>
              <button onClick={() => { cast.removeQueued(q.id); toast.info("נדחה ונמחק"); }} className="rounded-md border border-border px-2 py-1 text-xs">דחה</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
