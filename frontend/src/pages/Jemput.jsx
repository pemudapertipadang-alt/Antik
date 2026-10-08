import { useEffect, useState } from "react";
import { Check, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import api, { apiErr } from "@/lib/api";
import { C, PhoneShell } from "@/components/ui-kit";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const dayNum = (iso) => Number(iso.slice(8, 10));

// real scannable QR encoding the member code
function MemberQr({ value, size = 92 }) {
  return (
    <div style={{ padding: 6, background: "#fff", borderRadius: 10, border: `1px solid ${C.line}` }}>
      <QRCodeSVG value={value || "ATK"} size={size} level="M" fgColor={C.ink} bgColor="#ffffff" />
    </div>
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
          <div data-testid="member-qr"><MemberQr value={data?.member_code || "ATK"} /></div>
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
