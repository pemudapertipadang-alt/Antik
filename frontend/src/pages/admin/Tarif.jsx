import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Leaf, Package, Recycle, Trash2, Camera, Sprout, Box, Info, Sparkles } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { rp } from "@/components/ui-kit";
import { Btn, Card, Field, PageHeader, fmtDate, inputCls, nf } from "./shared";

const WASTE = [
  { k: "organik", label: "Organik", unit: "kg", icon: Leaf, tone: "bg-[#E3EFE6] text-[#1F5C3F]" },
  { k: "anorganik", label: "Anorganik", unit: "kg", icon: Package, tone: "bg-[#E4ECF6] text-[#1E4F8A]" },
  { k: "ecobrick", label: "Ecobrick", unit: "botol", icon: Recycle, tone: "bg-[#FBEEDC] text-[#B45309]" },
  { k: "residu", label: "Residu", unit: "kg", icon: Trash2, tone: "bg-[#EEF0EC] text-[#5B6560]" },
];
const MISSION_ICON = { camera: Camera, sprout: Sprout, bottle: Box };

function RupiahInput({ value, onChange, testid, suffix }) {
  return (
    <div className="relative">
      <input data-testid={testid} type="number" min="0" inputMode="numeric" value={value}
        onChange={(e) => onChange(e.target.value)} className={`${inputCls} pr-20 text-right font-bold`} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#4B5A52]">{suffix}</span>
    </div>
  );
}

export default function Tarif() {
  const [d, setD] = useState(null);
  const [rates, setRates] = useState({});
  const [bonus, setBonus] = useState("10");
  const [missions, setMissions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mBusy, setMBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/settings/rates");
      setD(data);
      setRates(Object.fromEntries(Object.entries(data.rates).map(([k, v]) => [k, String(v)])));
      setBonus(String(data.clean_bonus_pct));
      setMissions(data.missions.map((m) => ({ ...m, points: String(m.points) })));
    } catch (e) { toast.error(apiErr(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveRates = async () => {
    const body = Object.fromEntries(WASTE.map((w) => [w.k, parseInt(rates[w.k], 10) || 0]));
    body.clean_bonus_pct = parseInt(bonus, 10) || 0;
    setBusy(true);
    try { await api.put("/admin/settings/rates", body); toast.success("Tarif setoran disimpan"); load(); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const saveMission = async (m) => {
    setMBusy(m.id);
    try {
      await api.put(`/admin/missions/${m.id}`, { title: m.title, desc: m.desc, points: parseInt(m.points, 10) || 0 });
      toast.success(`Misi “${m.title}” disimpan`);
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setMBusy(null); }
  };

  const setM = (id, k, v) => setMissions((ms) => ms.map((m) => (m.id === id ? { ...m, [k]: v } : m)));

  if (!d) return <p className="text-sm text-[#4B5A52]">Memuat…</p>;

  // example: 5 kg organik + 2 kg anorganik + 3 ecobrick
  const ex = 5 * (parseInt(rates.organik, 10) || 0) + 2 * (parseInt(rates.anorganik, 10) || 0) + 3 * (parseInt(rates.ecobrick, 10) || 0);

  return (
    <>
      <PageHeader title="Pengaturan Tarif" desc="Nilai poin untuk setoran dan misi harian. 1 poin = Rp1, jadi warga langsung tahu nilai rupiah dari kerjanya." />

      <div className="flex items-start gap-3 rounded-2xl border border-[#CFE3D6] bg-[#E3EFE6] p-4 text-sm text-[#143D2A]">
        <Info size={18} className="mt-0.5 shrink-0" />
        <div>
          <b>1 poin = Rp1.</b> Perubahan tarif hanya berlaku untuk setoran & misi <b>berikutnya</b> — poin yang sudah diterima warga tidak berubah.
          Harga hadiah diatur di menu <b>Katalog Hadiah</b>.
        </div>
      </div>

      <Card className="p-5 md:p-6">
        <div className="mb-5 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-xl font-extrabold">Tarif setoran timbangan</h2>
            <p className="text-xs text-[#4B5A52]">Dipakai petugas saat menimbang sampah warga.</p>
          </div>
          {d.updated_at && <p className="text-[11px] text-[#4B5A52]">Terakhir diubah {fmtDate(d.updated_at, true)} oleh {d.updated_by}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {WASTE.map((w) => (
            <div key={w.k} className="flex flex-col gap-3 rounded-2xl border border-[#DCE2D8] p-4">
              <div className="flex items-center gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${w.tone}`}><w.icon size={18} /></span>
                <span className="font-bold">{w.label}</span>
              </div>
              <RupiahInput testid={`rate-input-${w.k}`} value={rates[w.k] ?? ""} suffix={`poin/${w.unit}`}
                onChange={(v) => setRates((r) => ({ ...r, [w.k]: v }))} />
              <div className="text-xs font-semibold text-[#1F5C3F]">= {rp(parseInt(rates[w.k], 10) || 0)} per {w.unit}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr] md:items-end">
          <Field label="Bonus pilah bersih" hint="Tambahan dari total setoran jika pilahan bersih & terpisah.">
            <RupiahInput testid="rate-input-bonus" value={bonus} suffix="%" onChange={setBonus} />
          </Field>
          <div className="flex items-center gap-3 rounded-2xl bg-[#F7F8F4] p-4 text-sm">
            <Sparkles size={18} className="shrink-0 text-[#B45309]" />
            <span data-testid="rate-example">Contoh: 5 kg organik + 2 kg anorganik + 3 ecobrick = <b>{nf(ex)} poin</b> (senilai <b>{rp(ex)}</b>),
              +{bonus || 0}% jika bersih = <b>{rp(Math.round(ex * (1 + (parseInt(bonus, 10) || 0) / 100)))}</b></span>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Btn data-testid="rate-save-button" loading={busy} onClick={saveRates}>Simpan tarif setoran</Btn>
        </div>
      </Card>

      <Card className="p-5 md:p-6">
        <h2 className="font-display text-xl font-extrabold">Nilai misi harian</h2>
        <p className="mb-5 text-xs text-[#4B5A52]">Poin yang didapat warga setiap menyelesaikan misi (sekali per hari).</p>
        <div className="flex flex-col gap-3">
          {missions.map((m) => {
            const I = MISSION_ICON[m.icon] || Leaf;
            return (
              <div key={m.id} data-testid={`mission-setting-${m.id}`}
                className="grid grid-cols-1 items-end gap-3 rounded-2xl border border-[#DCE2D8] p-4 md:grid-cols-[auto_1fr_1.4fr_180px_auto]">
                <span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-[#FBEEDC] text-[#B45309] md:flex"><I size={18} /></span>
                <Field label="Nama misi"><input data-testid={`mission-title-${m.id}`} className={inputCls} value={m.title} onChange={(e) => setM(m.id, "title", e.target.value)} /></Field>
                <Field label="Keterangan"><input className={inputCls} value={m.desc} onChange={(e) => setM(m.id, "desc", e.target.value)} /></Field>
                <Field label={`Nilai · ${rp(parseInt(m.points, 10) || 0)}`}>
                  <RupiahInput testid={`mission-points-${m.id}`} value={m.points} suffix="poin" onChange={(v) => setM(m.id, "points", v)} />
                </Field>
                <Btn variant="soft" loading={mBusy === m.id} data-testid={`mission-save-${m.id}`} onClick={() => saveMission(m)}>Simpan</Btn>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
