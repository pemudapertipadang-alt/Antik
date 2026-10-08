import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Truck, ChevronRight, Camera, FileText, Sprout, BookOpen } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { C, PhoneShell } from "@/components/ui-kit";
import BottomNav from "@/components/BottomNav";

const nf = (n) => new Intl.NumberFormat("id-ID").format(n);

export default function Beranda() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/warga/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const d = data;
  const initials = (user?.name || "W").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();

  return (
    <PhoneShell>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 12px" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#FCEFD9", color: C.amber,
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.muted }}>Selamat datang,</div>
          <div style={{ fontWeight: 800, fontSize: 18 }} data-testid="warga-name">{user?.name}</div>
          <div style={{ fontSize: 12, color: C.muted }}>RT {user?.rt} / RW {user?.rw} · {user?.kelurahan}</div>
        </div>
        <button aria-label="Notifikasi" data-testid="notif-button" style={{
          position: "relative", width: 44, height: 44, borderRadius: 14, border: `1px solid ${C.line}`,
          background: "#fff", color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <Bell size={22} strokeWidth={1.9} />
          <span style={{ position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: "50%", background: "#C2410C" }} />
        </button>
      </header>

      <main className="pi-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 20px 20px",
        display: "flex", flexDirection: "column", gap: 16 }}>

        {/* balance */}
        <section className="pi-fade" style={{ background: C.green, color: "#fff", borderRadius: 24, padding: 20,
          display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, color: "#CFE3D6", fontWeight: 600 }}>Saldo poin</div>
              <div className="font-display" data-testid="point-balance" style={{ fontWeight: 800, fontSize: 46, lineHeight: 1.05, letterSpacing: "-1px" }}>
                {d ? nf(d.points) : "—"}
              </div>
            </div>
            {d && <div style={{ fontSize: 12, fontWeight: 700, background: C.green2, padding: "6px 10px", borderRadius: 999 }}>
              +{nf(d.week_points)} minggu ini</div>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button data-testid="go-tukar-button" onClick={() => nav("/tukar")} style={{ flex: 1, height: 44, borderRadius: 14, background: "#fff",
              color: C.green, fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>Tukar poin</button>
            <button data-testid="go-history-button" onClick={() => nav("/jemput")} style={{ flex: 1, height: 44, borderRadius: 14,
              border: "1px solid #6FA287", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Riwayat setoran</button>
          </div>
        </section>

        {/* next pickup */}
        <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20,
          padding: "14px 10px 14px 16px", display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: C.greenSoft, color: C.green,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Truck size={24} strokeWidth={1.9} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>Jemput berikutnya</div>
            {d?.next_pickup ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{d.next_pickup.label} · {d.next_pickup.time}</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.4, textTransform: "capitalize" }}>{d.next_pickup.type} — siapkan wadah di depan rumah</div>
              </>
            ) : <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>Belum ada jadwal terdekat</div>}
          </div>
          <button aria-label="Lihat jadwal jemput" data-testid="next-pickup-arrow" onClick={() => nav("/jemput")}
            style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
              color: C.ink, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
            <ChevronRight size={22} strokeWidth={1.9} />
          </button>
        </section>

        {/* quick steps */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Langkah hari ini</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
            {[
              { icon: Camera, label: "Foto pilahan", color: C.green },
              { icon: FileText, label: "Ecobrick", color: C.amber },
              { icon: Sprout, label: "Tanam", color: C.green },
              { icon: BookOpen, label: "Panduan", color: C.blue },
            ].map((s, i) => (
              <button key={i} data-testid={`quickstep-${i}`} onClick={() => nav("/misi")} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none",
                border: "none", color: C.ink, fontSize: 12, fontWeight: 600, textAlign: "center", cursor: "pointer" }}>
                <span style={{ width: 56, height: 56, borderRadius: 18, background: "#fff", border: `1px solid ${C.line}`,
                  color: s.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <s.icon size={24} strokeWidth={1.9} />
                </span>{s.label}
              </button>
            ))}
          </div>
        </section>

        {/* impact */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Dampakmu bulan ini</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            <Stat dot={C.green} val={d?.impact.organik ?? 0} unit="kg" label="Organik" />
            <Stat dot={C.blue} val={d?.impact.anorganik ?? 0} unit="kg" label="Anorganik" />
            <Stat dot={C.amber2} val={d?.impact.ecobrick ?? 0} unit="botol" label="Ecobrick" />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Sampah organikmu masuk ke batch pupuk organik yang diolah mitra pengolah skala industri.</p>
        </section>

        {/* batch */}
        {d && (
          <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, padding: 16,
            display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Batch pupuk #{d.batch.number}</h2>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{d.batch.current} / {d.batch.target} ton</div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "#E6EAE3", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (d.batch.current / d.batch.target) * 100)}%`, height: "100%",
                borderRadius: 999, background: C.green, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              RW {user?.rw} peringkat {d.batch.rank} — {d.batch.rate}% KK sudah rutin memilah. Truk ke pengolah berangkat saat batch penuh.</div>
          </section>
        )}
      </main>

      <BottomNav />
    </PhoneShell>
  );
}

function Stat({ dot, val, unit, label }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 12,
      display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
      <div className="font-display" style={{ fontWeight: 800, fontSize: 22 }}>
        {String(val).replace(".", ",")}<span style={{ fontSize: 13, fontWeight: 600 }}> {unit}</span></div>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
    </div>
  );
}
