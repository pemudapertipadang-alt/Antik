import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { C, PhoneShell, rp } from "@/components/ui-kit";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

export default function Misi() {
  const { refreshUser } = useAuth();
  const [data, setData] = useState(null);

  const load = () => api.get("/warga/missions").then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const complete = async (m) => {
    if (m.done) return;
    try {
      await api.post("/warga/missions/complete", { mission_id: m.id });
      toast.success(`+${m.points} poin (senilai ${rp(m.points)}) · ${m.title}`);
      await load();
      refreshUser();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const d = data;
  const activeStage = d?.stages.find((s) => s.status === "active");

  return (
    <PhoneShell>
      <header style={{ padding: "22px 20px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className="font-display" style={{ margin: 0, fontWeight: 800, fontSize: 28, letterSpacing: "-0.5px" }}>Misi Pilah</h1>
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>Kebiasaan kecil tiap hari, poin terkumpul tiap minggu.</p>
      </header>

      <main className="pi-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 20px 20px",
        display: "flex", flexDirection: "column", gap: 16 }}>

        {/* stages */}
        <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, padding: 16,
          display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Tahapan program</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 4 }}>
            {(d?.stages || []).map((s) => {
              const done = s.status === "done";
              const active = s.status === "active";
              return (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: done ? C.green : active ? "#fff" : "#E6EAE3",
                    border: active ? `3px solid ${C.green}` : "none",
                    color: done ? "#fff" : active ? C.green : C.muted,
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14,
                  }}>{done ? <Check size={18} strokeWidth={2.4} /> : s.step}</span>
                  <span style={{ fontSize: 12, fontWeight: active ? 800 : 600, lineHeight: 1.3, color: active ? C.green : done ? C.ink : C.muted }}>{s.title}</span>
                </div>
              );
            })}
          </div>
          {activeStage && (
            <div style={{ background: C.bg, borderRadius: 14, padding: 12, fontSize: 13, lineHeight: 1.5 }}>
              <strong>Tahap {activeStage.step} · {activeStage.title}</strong> — lanjutkan misi harian untuk membuka tahap berikutnya.
            </div>
          )}
        </section>

        {/* streak */}
        <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, padding: 16,
          display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px" }}>Rantai pilah</div>
              <div className="font-display" data-testid="streak-value" style={{ fontWeight: 800, fontSize: 28 }}>{d?.streak ?? 0} hari</div>
            </div>
            <div style={{ fontSize: 12, color: C.muted, textAlign: "right", maxWidth: 150, lineHeight: 1.4 }}>
              Selesaikan 1 misi tiap hari agar rantai tidak putus.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6 }}>
            {(d?.days || []).map((day, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ width: "100%", height: 30, borderRadius: 9,
                  background: day.done ? C.green : "#fff", border: `2px solid ${day.done ? C.green : C.line}` }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{day.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* daily missions */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Misi hari ini</h2>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{d?.earned ?? 0} / {d?.daily_total ?? 0} poin · {rp(d?.daily_total ?? 0)}</span>
          </div>
          {(d?.daily || []).map((m) => (
            <div key={m.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: 12,
              display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: m.done ? C.greenSoft : "#FCEFD9",
                color: m.done ? C.green : C.amber, display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                {m.done ? <Check size={22} strokeWidth={2.4} /> : `+${m.points}`}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{m.desc}</div>
                <div data-testid={`mission-rupiah-${m.id}`} style={{ fontSize: 12, fontWeight: 700, color: C.green, marginTop: 2 }}>{m.points} poin · senilai {rp(m.points)}</div>
              </div>
              <button data-testid={`mission-complete-${m.id}`} onClick={() => complete(m)} disabled={m.done}
                style={{ height: 44, padding: "0 12px", borderRadius: 12, border: "none",
                  background: m.done ? "#E6EAE3" : C.green, color: m.done ? C.muted : "#fff",
                  fontWeight: 700, fontSize: 13, cursor: m.done ? "default" : "pointer", flexShrink: 0 }}>
                {m.done ? "Selesai" : "Tandai"}
              </button>
            </div>
          ))}
        </section>
      </main>

      <BottomNav />
    </PhoneShell>
  );
}
