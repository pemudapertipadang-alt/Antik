import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, Check, LogOut, Search } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { C, PhoneShell, rp } from "@/components/ui-kit";
import QrScanner from "@/components/QrScanner";
import { toast } from "sonner";

const ROWS = [
  { type: "organik", name: "Organik", unit: "kg", step: 0.5, color: C.green },
  { type: "anorganik", name: "Anorganik", unit: "kg", step: 0.5, color: C.blue },
  { type: "ecobrick", name: "Ecobrick", unit: "botol", step: 1, color: C.amber2 },
  { type: "residu", name: "Residu", unit: "kg", step: 0.5, color: "#5B6560" },
];
// fallback until /petugas/rates loads (1 poin = Rp1, editable by pengelola)
const DEFAULT_RATE = { organik: 500, anorganik: 1500, ecobrick: 1000, residu: 0 };
const nf = (n) => new Intl.NumberFormat("id-ID").format(n);

export default function Petugas() {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [code, setCode] = useState("");
  const [warga, setWarga] = useState(null);
  const [vals, setVals] = useState({ organik: 0, anorganik: 0, ecobrick: 0, residu: 0 });
  const [clean, setClean] = useState(false);
  const [saved, setSaved] = useState(false);
  const [today, setToday] = useState({ count: 0, total_points: 0, transactions: [] });
  const [scanning, setScanning] = useState(false);

  const [RATE, setRate] = useState(DEFAULT_RATE);
  const [bonusPct, setBonusPct] = useState(10);

  const loadToday = () => api.get("/petugas/today").then((r) => setToday(r.data)).catch(() => {});
  useEffect(() => {
    loadToday();
    api.get("/petugas/rates").then((r) => { setRate(r.data.rates); setBonusPct(r.data.clean_bonus_pct); }).catch(() => {});
  }, []);

  const find = async (c) => {
    const q = (c ?? code).trim();
    if (!q) return toast.error("Masukkan kode anggota");
    try {
      const { data } = await api.get(`/petugas/warga/${encodeURIComponent(q)}`);
      setWarga(data);
      setVals({ organik: 0, anorganik: 0, ecobrick: 0, residu: 0 });
      setClean(false);
      setSaved(false);
    } catch (e) { toast.error(apiErr(e)); setWarga(null); }
  };

  const onScanResult = (text) => {
    setScanning(false);
    setCode(text);
    toast.success(`QR terbaca: ${text}`);
    find(text);
  };

  const adj = (type, delta, step) => setVals((v) => ({ ...v, [type]: Math.max(0, Math.round((v[type] + delta * step) * 10) / 10) }));

  const base = ROWS.reduce((s, r) => s + Math.round(vals[r.type] * RATE[r.type]), 0);
  const bonus = clean ? Math.round(base * bonusPct / 100) : 0;
  const total = base + bonus;
  const kg = vals.organik + vals.anorganik + vals.residu;

  const save = async () => {
    const items = ROWS.filter((r) => vals[r.type] > 0).map((r) => ({ type: r.type, value: vals[r.type], unit: r.unit }));
    if (items.length === 0) return toast.error("Isi hasil timbang dulu");
    try {
      const { data } = await api.post("/petugas/weigh", { member_code: warga.member_code, items, clean_bonus: clean });
      toast.success(`+${nf(data.total_points)} poin (senilai ${rp(data.total_points)}) untuk ${data.warga_name}`);
      setSaved(true);
      loadToday();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const next = () => { setWarga(null); setCode(""); setSaved(false); };

  return (
    <PhoneShell dark>
      <header style={{ background: C.dark, color: "#fff", padding: "18px 20px 16px", display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase",
            background: "#24362D", color: "#CFE3D6", padding: "6px 10px", borderRadius: 999 }}>Mode petugas</span>
          <button data-testid="petugas-logout" onClick={() => { logout(); nav("/"); }} style={{ background: "none", border: "none",
            color: "#CFE3D6", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, minHeight: 44 }}>
            <LogOut size={16} /> Keluar</button>
        </div>
        <div>
          <div className="font-display" style={{ fontWeight: 800, fontSize: 24 }}>Jemput &amp; Timbang</div>
          <div style={{ fontSize: 13, color: "#B9C7BF" }}>{user?.name} · setoran ke-{today.count + 1} hari ini · {nf(today.total_points)} poin tercatat</div>
        </div>

        {/* scan / lookup */}
        <button data-testid="open-scanner-button" onClick={() => setScanning(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%",
            height: 52, borderRadius: 16, border: "none", background: C.green, color: "#fff",
            fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
          <ScanLine size={22} strokeWidth={2} /> Pindai QR warga
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, height: 1, background: "#2E3F37" }} />
          <span style={{ fontSize: 12, color: "#8FA398", fontWeight: 600 }}>atau masukkan kode</span>
          <span style={{ flex: 1, height: 1, background: "#2E3F37" }} />
        </div>
        <div style={{ background: "#24362D", borderRadius: 16, padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <ScanLine size={20} color="#B9C7BF" style={{ flexShrink: 0, marginLeft: 4 }} />
          <input data-testid="member-code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && find()} placeholder="Kode anggota, mis. PLH-0503-0127"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "#fff",
              fontFamily: "inherit", fontSize: 14, fontWeight: 600 }} />
          <button data-testid="find-warga-button" onClick={() => find()} style={{ height: 40, padding: "0 14px", borderRadius: 12,
            border: "1px solid #4A6155", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 13,
            display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
            <Search size={16} /> Cari</button>
        </div>
      </header>

      {scanning && <QrScanner onResult={onScanResult} onClose={() => setScanning(false)} />}

      <main className="pi-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px",
        display: "flex", flexDirection: "column", gap: 10, background: C.bg }}>
        {!warga ? (
          <div style={{ marginTop: 24, textAlign: "center", color: C.muted, display: "flex", flexDirection: "column", gap: 20 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>Pindai / masukkan kode anggota warga untuk mulai menimbang.<br/>Coba kode <b>PLH-0503-0127</b>.</p>
            {today.transactions.length > 0 && (
              <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.ink }}>Setoran hari ini</h3>
                {today.transactions.map((t) => (
                  <div key={t.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 12,
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{t.warga_name}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{t.summary}</div></div>
                    <div style={{ fontWeight: 800, color: C.amber }}>+{nf(t.total_points)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* warga card */}
            <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#FCEFD9", color: C.amber,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                {warga.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div data-testid="found-warga-name" style={{ fontWeight: 800, fontSize: 15 }}>{warga.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{warga.member_code} · RT {warga.rt}/RW {warga.rw} · {nf(warga.points)} poin</div>
              </div>
            </div>

            <h2 style={{ margin: "4px 0 2px", fontSize: 15, fontWeight: 800 }}>Hasil timbang</h2>
            {ROWS.map((r) => (
              <div key={r.type} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 12,
                display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: r.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{r.name}</div>
                  <div data-testid={`rate-${r.type}`} style={{ fontSize: 12, color: C.muted }}>{nf(RATE[r.type] ?? 0)} poin / {r.unit} · {rp(RATE[r.type] ?? 0)}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginTop: 2 }}>= {nf(Math.round(vals[r.type] * (RATE[r.type] ?? 0)))} poin</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button data-testid={`dec-${r.type}`} onClick={() => adj(r.type, -1, r.step)} style={stepBtn}>−</button>
                  <div style={{ minWidth: 58, textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{String(vals[r.type]).replace(".", ",")}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{r.unit}</div>
                  </div>
                  <button data-testid={`inc-${r.type}`} onClick={() => adj(r.type, 1, r.step)} style={stepBtn}>+</button>
                </div>
              </div>
            ))}

            <button data-testid="clean-bonus-toggle" onClick={() => setClean((v) => !v)} aria-pressed={clean}
              style={{ marginTop: 4, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 12,
                display: "flex", gap: 12, alignItems: "center", textAlign: "left", color: C.ink, cursor: "pointer" }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, border: `2px solid ${clean ? C.green : C.line}`,
                background: clean ? C.green : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {clean && <Check size={16} strokeWidth={3} />}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontWeight: 800, fontSize: 14 }}>Pilahan bersih &amp; terpisah</span>
                <span style={{ display: "block", fontSize: 12, color: C.muted }}>Organik tanpa plastik, anorganik kering — bonus {bonusPct}%</span>
              </span>
            </button>
          </>
        )}
      </main>

      {warga && (
        <footer style={{ background: "#fff", borderTop: `1px solid ${C.line}`, padding: "14px 20px 18px",
          display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              {Math.round(kg * 10) / 10} kg + {vals.ecobrick} ecobrick<br />Bonus pilah bersih +{nf(bonus)}</div>
            <div className="font-display" data-testid="weigh-total" style={{ fontWeight: 800, fontSize: 30, color: C.amber, textAlign: "right", lineHeight: 1.1 }}>{nf(total)} poin
              <div data-testid="weigh-total-rupiah" style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: "inherit" }}>senilai {rp(total)}</div></div>
          </div>
          {!saved ? (
            <button data-testid="save-weigh-button" onClick={save} style={{ width: "100%", height: 52, borderRadius: 14, border: "none",
              background: C.green, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              Simpan &amp; kirim struk ke WhatsApp</button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.green, fontWeight: 700, fontSize: 13 }}>
                <Check size={18} strokeWidth={2.4} /> Tersimpan. Struk terkirim ke WhatsApp {warga.name}.</div>
              <button data-testid="next-warga-button" onClick={next} style={{ width: "100%", height: 52, borderRadius: 14,
                border: `1px solid ${C.green}`, background: "#fff", color: C.green, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                Warga berikutnya</button>
            </div>
          )}
        </footer>
      )}
    </PhoneShell>
  );
}

const stepBtn = { width: 44, height: 44, borderRadius: 12, border: `1px solid ${C.line}`, background: C.bg,
  color: C.ink, fontSize: 20, fontWeight: 700, cursor: "pointer", padding: 0 };
