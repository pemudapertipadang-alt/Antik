import { useEffect, useMemo, useState } from "react";
import { Check, QrCode } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { C, PhoneShell } from "@/components/ui-kit";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const dayNum = (iso) => Number(iso.slice(8, 10));

// deterministic decorative QR grid from a string
function QrGrid({ value, size = 92 }) {
  const cells = 21;
  const bits = useMemo(() => {
    let h = 2166136261;
    const out = [];
    for (let i = 0; i < cells * cells; i++) {
      h ^= value.charCodeAt(i % value.length) + i * 31;
      h = Math.imul(h, 16777619);
      out.push(((h >>> 7) & 1) === 1);
    }
    return out;
  }, [value]);
  const px = size / cells;
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius: 8, background: "#fff" }}>
      {bits.map((b, i) => {
        const r = Math.floor(i / cells), c = i % cells;
        if (finder(r, c)) return null;
        return b ? <rect key={i} x={c * px} y={r * px} width={px} height={px} fill={C.ink} /> : null;
      })}
      {[[0, 0], [0, cells - 7], [cells - 7, 0]].map(([r, c], k) => (
        <g key={k}>
          <rect x={c * px} y={r * px} width={px * 7} height={px * 7} fill={C.green} />
          <rect x={(c + 1) * px} y={(r + 1) * px} width={px * 5} height={px * 5} fill="#fff" />
          <rect x={(c + 2) * px} y={(r + 2) * px} width={px * 3} height={px * 3} fill={C.green} />
        </g>
      ))}
    </svg>
  );
}

export default function Jemput() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = () => api.get("/warga/schedule").then((r) => {
    setData(r.data);
    const upcoming = r.data.schedules.find((s) => s.date >= new Date().toISOString().slice(0, 10));
    setSelected((prev) => prev || upcoming?.id || r.data.schedules[0]?.id || null);
  }).catch(() => {});

  useEffect(() => {
    load();
    api.get("/warga/history").then((r) => setHistory(r.data.history)).catch(() => {});
  }, []);

  const cur = data?.schedules.find((s) => s.id === selected);

  const toggleSiap = async () => {
    if (!cur) return;
    try {
      const { data: res } = await api.post("/warga/schedule/confirm", { schedule_id: cur.id });
      toast.success(res.confirmed ? "Petugas sudah diberi tahu" : "Konfirmasi dibatalkan");
      load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const typeColor = (t) => (t === "organik" ? C.green : t === "anorganik" ? C.blue : C.muted);

  return (
    <PhoneShell>
      <header style={{ padding: "22px 20px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className="font-display" style={{ margin: 0, fontWeight: 800, fontSize: 28, letterSpacing: "-0.5px" }}>Jadwal Jemput</h1>
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>RT {data?.rt} / RW {data?.rw}</p>
      </header>

      <main className="pi-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 20px 20px",
        display: "flex", flexDirection: "column", gap: 16 }}>

        {/* week strip */}
        <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {(data?.schedules || []).slice(0, 10).map((s) => {
            const active = s.id === selected;
            return (
              <button key={s.id} data-testid={`sched-${s.id}`} onClick={() => setSelected(s.id)} style={{
                flexShrink: 0, width: 60, height: 70, borderRadius: 16, cursor: "pointer",
                border: `1px solid ${active ? C.green : C.line}`, background: active ? C.greenSoft : "#fff",
                color: active ? C.green : C.ink, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{s.dow}</span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{dayNum(s.date)}</span>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor(s.type) }} />
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.muted }}>
          <Legend color={C.green} label="Organik" />
          <Legend color={C.blue} label="Anorganik & ecobrick" />
        </div>

        {/* selected detail */}
        {cur && (
          <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, padding: 16,
            display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, padding: "6px 10px", borderRadius: 999,
                background: cur.type === "organik" ? C.greenSoft : "#E4ECF6",
                color: cur.type === "organik" ? C.green : C.blue, textTransform: "capitalize" }}>{cur.type}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{cur.confirmed ? "Sudah dikonfirmasi" : "Belum konfirmasi"}</span>
            </div>
            <div>
              <div className="font-display" style={{ fontWeight: 800, fontSize: 22 }}>{cur.label}</div>
              <div style={{ fontSize: 14, color: C.muted }}>{cur.time} · {cur.petugas}</div>
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.5 }}>{cur.tip}</div>
            {cur.confirmed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.greenSoft, color: C.greenDark,
                  borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.5, fontWeight: 600 }}>
                  <Check size={18} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
                  Petugas sudah diberi tahu. Taruh wadah di depan rumah sebelum jam {cur.time.split("–")[0]}.
                </div>
                <button data-testid="cancel-siap-button" onClick={toggleSiap} style={outlineBtn}>Batalkan</button>
              </div>
            ) : (
              <button data-testid="siap-button" onClick={toggleSiap} style={{ height: 52, borderRadius: 14, border: "none",
                background: C.green, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Saya siap dijemput</button>
            )}
          </section>
        )}

        {/* QR member */}
        <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, padding: 16,
          display: "flex", gap: 16, alignItems: "center" }}>
          <div data-testid="member-qr"><QrGrid value={data?.member_code || "PLH"} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px",
              display: "flex", alignItems: "center", gap: 6 }}><QrCode size={14} /> QR anggota</div>
            <div data-testid="member-code" style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.4px" }}>{data?.member_code}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>Tunjukkan ke petugas saat penimbangan supaya poin langsung masuk.</div>
          </div>
        </section>

        {/* history */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Riwayat poin</h2>
          {history.length === 0 && <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Belum ada riwayat.</p>}
          {history.map((h, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 12,
              display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{h.detail}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{h.type === "setoran" ? "Setoran sampah" : "Tukar poin"} · {h.date.slice(0, 10)}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: h.points >= 0 ? C.green : C.amber }}>
                {h.points >= 0 ? "+" : ""}{h.points}</div>
            </div>
          ))}
        </section>
      </main>

      <BottomNav />
    </PhoneShell>
  );
}

const outlineBtn = { height: 44, borderRadius: 14, border: `1px solid ${C.line}`, background: "#fff",
  color: C.ink, fontWeight: 600, fontSize: 14, cursor: "pointer" };

function Legend({ color, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{label}
    </span>
  );
}
