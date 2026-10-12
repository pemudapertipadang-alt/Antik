import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Leaf, Package, Recycle, Coins } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { ExportBtn, Field, PageHeader, Pager, SearchInput, Select, StatCard, Table, downloadCsv, fmtDate, inputCls, kg, nf, todayISO, useDebounced } from "./shared";

const LIMIT = 20;
const monthStart = () => `${todayISO().slice(0, 8)}01`;

export default function Setoran() {
  const [q, setQ] = useState("");
  const [frm, setFrm] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [pid, setPid] = useState("");
  const [page, setPage] = useState(1);
  const [petugas, setPetugas] = useState([]);
  const [data, setData] = useState({ items: [], total: 0, totals: {} });
  const [loading, setLoading] = useState(true);
  const dq = useDebounced(q);

  const params = { q: dq || undefined, frm: frm || undefined, to: to || undefined, petugas_id: pid || undefined };

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/admin/setoran", { params: { ...params, page, limit: LIMIT } }); setData(data); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, frm, to, pid, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dq, frm, to, pid]);
  useEffect(() => { api.get("/admin/petugas").then((r) => setPetugas(r.data.items)).catch(() => {}); }, []);

  const t = data.totals || {};
  const val = (it, type) => it.items?.filter((x) => x.type === type).reduce((s, x) => s + x.value, 0) || 0;

  return (
    <>
      <PageHeader title="Laporan Setoran" desc="Semua timbangan yang dicatat petugas, lengkap dengan poin yang diberikan.">
        <ExportBtn testid="setoran-export-button" onClick={() => downloadCsv("/admin/setoran/export", params, `setoran_${frm || "awal"}_${to || "akhir"}.csv`)} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 md:flex md:items-end">
        <div className="col-span-2 md:col-span-1"><Field label="Cari"><SearchInput testid="setoran-search-input" value={q} onChange={setQ} placeholder="Nama warga, kode, petugas" /></Field></div>
        <Field label="Dari"><input data-testid="setoran-from" type="date" className={`${inputCls} md:w-44`} value={frm} onChange={(e) => setFrm(e.target.value)} /></Field>
        <Field label="Sampai"><input data-testid="setoran-to" type="date" className={`${inputCls} md:w-44`} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="col-span-2 md:col-span-1"><Field label="Petugas"><Select testid="setoran-petugas-filter" value={pid} onChange={setPid} className="md:w-52"
          options={[{ value: "", label: "Semua petugas" }, ...petugas.map((p) => ({ value: p.id, label: p.name }))]} /></Field></div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard testid="setoran-total-organik" label="Organik" value={kg(t.organik)} icon={Leaf} />
        <StatCard testid="setoran-total-anorganik" label="Anorganik" value={kg(t.anorganik)} icon={Package} tone="blue" sub={`Residu ${kg(t.residu)}`} />
        <StatCard testid="setoran-total-ecobrick" label="Ecobrick" value={`${nf(t.ecobrick)} botol`} icon={Recycle} tone="amber" />
        <StatCard testid="setoran-total-poin" label="Poin diberikan" value={nf(t.points)} icon={Coins} tone="dark" sub={`${nf(data.total)} setoran`} />
      </div>

      <Table loading={loading} empty={data.items.length === 0 ? "Tidak ada setoran di rentang ini." : null}
        head={["Waktu", "Warga", "Petugas", { label: "Organik", right: true }, { label: "Anorganik", right: true }, { label: "Residu", right: true }, { label: "Ecobrick", right: true }, { label: "Bonus", right: true }, { label: "Total poin", right: true }]}>
        {data.items.map((it) => (
          <tr key={it.id} data-testid={`setoran-row-${it.id}`} className="hover:bg-[#FAFBF8]">
            <td className="whitespace-nowrap px-4 py-3 text-[#4B5A52]">{fmtDate(it.created_at, true)}</td>
            <td className="px-4 py-3"><div className="font-bold">{it.warga_name}</div><div className="text-xs text-[#4B5A52]">{it.member_code}</div></td>
            <td className="px-4 py-3 text-[#4B5A52]">{it.petugas_name}</td>
            <td className="px-4 py-3 text-right">{kg(val(it, "organik"))}</td>
            <td className="px-4 py-3 text-right">{kg(val(it, "anorganik"))}</td>
            <td className="px-4 py-3 text-right">{kg(val(it, "residu"))}</td>
            <td className="px-4 py-3 text-right">{nf(val(it, "ecobrick"))}</td>
            <td className="px-4 py-3 text-right text-[#4B5A52]">{it.bonus_points ? `+${nf(it.bonus_points)}` : "—"}</td>
            <td className="px-4 py-3 text-right font-extrabold text-[#1F5C3F]">+{nf(it.total_points)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={page} limit={LIMIT} total={data.total} onPage={setPage} />
    </>
  );
}
