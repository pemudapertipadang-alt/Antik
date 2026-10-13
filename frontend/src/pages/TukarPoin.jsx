import { useEffect, useMemo, useState } from "react";
import { Leaf, Smartphone, Home, Heart, Check } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { C, PhoneShell, rp } from "@/components/ui-kit";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const nf = (n) => new Intl.NumberFormat("id-ID").format(n);
const catIcon = { Kebun: Leaf, Pulsa: Smartphone, "Rumah Tangga": Home, Donasi: Heart };
const catTile = { Kebun: [C.greenSoft, C.green], Pulsa: ["#E4ECF6", C.blue],
  "Rumah Tangga": ["#FCEFD9", C.amber], Donasi: ["#FBE4E4", "#B4234B"] };

export default function TukarPoin() {
  const { user, refreshUser } = useAuth();
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("Semua");
  const [pick, setPick] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => api.get("/warga/catalog").then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => {
    const set = ["Semua", ...Array.from(new Set((data?.items || []).map((i) => i.category)))];
    return set;
  }, [data]);

  const items = (data?.items || []).filter((i) => cat === "Semua" || i.category === cat);
  const points = data?.points ?? user?.points ?? 0;

  const doRedeem = async () => {
    if (!pick) return;
    setLoading(true);
    try {
      const { data: res } = await api.post("/warga/redeem", { item_id: pick.id });
      setData((d) => ({ ...d, points: res.points }));
      refreshUser();
      setConfirmed(true);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
  };

  const close = () => { setPick(null); setConfirmed(false); };

  return (
    <PhoneShell>
      <header style={{ padding: "22px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 className="font-display" style={{ margin: 0, fontWeight: 800, fontSize: 28, letterSpacing: "-0.5px" }}>Tukar Poin</h1>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Saldo</span>
          <span data-testid="tukar-saldo" style={{ fontWeight: 800, fontSize: 18, color: C.amber }}>{nf(points)} poin</span>
          <span data-testid="tukar-saldo-rupiah" style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>senilai {rp(points)}</span>
        </div>
      </header>

      <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 20px 10px", flexShrink: 0 }}>
        {cats.map((c) => {
          const on = c === cat;
          return (
            <button key={c} data-testid={`cat-${c}`} onClick={() => setCat(c)} style={{
              height: 40, padding: "0 14px", borderRadius: 999, flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? C.green : C.line}`, background: on ? C.green : "#fff",
              color: on ? "#fff" : C.ink, fontWeight: 700, fontSize: 13 }}>{c}</button>
          );
        })}
      </div>

      <main className="pi-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 20px 20px",
        display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={{ background: C.green, color: "#fff", borderRadius: 22, padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#CFE3D6", textTransform: "uppercase", letterSpacing: "0.6px" }}>Dari sampahmu, ke kebunmu</div>
            <div className="font-display" style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>Pupuk organik hasil olahan sampah warga</div>
          </div>
          <div style={{ width: 76, height: 96, borderRadius: "12px 12px 18px 18px", background: C.green2,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0 }}>
            <Leaf size={30} color="#fff" strokeWidth={1.9} />
            <span style={{ fontSize: 12, fontWeight: 800 }}>5 kg</span>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
          {items.map((it) => {
            const Icon = catIcon[it.category] || Leaf;
            const [tbg, tfg] = catTile[it.category] || [C.greenSoft, C.green];
            const afford = points >= it.points;
            return (
              <div key={it.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: 12,
                display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: tbg, color: tfg,
                  display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={22} strokeWidth={1.9} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{it.sub}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: C.amber }}>{nf(it.points)} poin</span>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>senilai {rp(it.points)}</span>
                  </span>
                  <button data-testid={`redeem-${it.id}`} disabled={!afford}
                    onClick={() => { setPick(it); setConfirmed(false); }}
                    style={{ height: 40, minWidth: 44, padding: "0 12px", borderRadius: 12,
                      border: `1px solid ${afford ? C.green : C.line}`, background: "#fff",
                      color: afford ? C.green : C.muted, fontWeight: 700, fontSize: 13,
                      cursor: afford ? "pointer" : "not-allowed" }}>Tukar</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {pick && (
        <section className="pi-fade" style={{ background: "#fff", borderTop: `1px solid ${C.line}`,
          borderRadius: "24px 24px 0 0", boxShadow: "0 -10px 30px rgba(23,37,30,0.12)",
          padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
          {!confirmed ? (
            <>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px" }}>Konfirmasi penukaran</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{pick.name}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{nf(pick.points)} poin (senilai {rp(pick.points)}) · sisa saldo {nf(points - pick.points)} poin · {pick.how}</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button data-testid="redeem-cancel" onClick={close} style={{ flex: 1, height: 50, borderRadius: 14,
                  border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Batal</button>
                <button data-testid="redeem-confirm" onClick={doRedeem} disabled={loading} style={{ flex: 2, height: 50, borderRadius: 14,
                  border: "none", background: C.green, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Memproses..." : "Tukar sekarang"}</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.greenSoft, color: C.greenDark,
                borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.5, fontWeight: 600 }}>
                <Check size={18} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
                Permintaan terkirim: {pick.name}. Pengelola akan memproses penukaranmu — {pick.how}. Pantau statusnya di Riwayat poin.
              </div>
              <button data-testid="redeem-close" onClick={close} style={{ height: 48, borderRadius: 14, border: `1px solid ${C.line}`,
                background: "#fff", color: C.ink, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Tutup</button>
            </>
          )}
        </section>
      )}

      <BottomNav />
    </PhoneShell>
  );
}
