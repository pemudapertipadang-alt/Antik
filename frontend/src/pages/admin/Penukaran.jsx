import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Clock, X } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Badge, Btn, ExportBtn, Field, Modal, PageHeader, Pager, SearchInput, Table, downloadCsv, fmtDate, inputCls, nf, useDebounced } from "./shared";

const LIMIT = 20;
const TABS = [
  { k: "menunggu", l: "Menunggu" },
  { k: "diproses", l: "Diproses" },
  { k: "selesai", l: "Selesai" },
  { k: "ditolak", l: "Ditolak" },
  { k: "semua", l: "Semua" },
];

export default function Penukaran() {
  const [status, setStatus] = useState("menunggu");
  const [q, setQ] = useState("");
  const [frm, setFrm] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, counts: {} });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [reject, setReject] = useState(null);
  const [note, setNote] = useState("");
  const dq = useDebounced(q);

  const params = { status, q: dq || undefined, frm: frm || undefined, to: to || undefined };

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/admin/redemptions", { params: { ...params, page, limit: LIMIT } }); setData(data); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dq, frm, to, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, dq, frm, to]);

  const update = async (r, next, n = "") => {
    setBusyId(r.id);
    try {
      await api.patch(`/admin/redemptions/${r.id}`, { status: next, note: n });
      toast.success(next === "ditolak" ? `Ditolak — ${nf(r.points)} poin dikembalikan ke ${r.user_name}`
        : next === "selesai" ? "Penukaran ditandai selesai" : "Penukaran sedang diproses");
      setReject(null); setNote("");
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusyId(null); }
  };

  const counts = data.counts || {};

  return (
    <>
      <PageHeader title="Penukaran Poin" desc="Proses permintaan hadiah warga. Penolakan otomatis mengembalikan poin dan stok.">
        <ExportBtn testid="penukaran-export-button" onClick={() => downloadCsv("/admin/redemptions/export", params, "penukaran.csv")} />
      </PageHeader>

      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {TABS.map((t) => {
          const n = t.k === "semua" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[t.k] || 0;
          const on = status === t.k;
          return (
            <button key={t.k} data-testid={`penukaran-tab-${t.k}`} onClick={() => setStatus(t.k)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold ${on ? "border-[#1F5C3F] bg-[#1F5C3F] text-white" : "border-[#DCE2D8] bg-white"}`}>
              {t.l}
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-white/20" : "bg-[#F3F5EF] text-[#4B5A52]"}`}>{nf(n)}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 md:flex md:items-end">
        <div className="col-span-2 md:col-span-1"><Field label="Cari"><SearchInput testid="penukaran-search-input" value={q} onChange={setQ} placeholder="Nama warga, kode, item" /></Field></div>
        <Field label="Dari"><input data-testid="penukaran-from" type="date" className={`${inputCls} md:w-44`} value={frm} onChange={(e) => setFrm(e.target.value)} /></Field>
        <Field label="Sampai"><input data-testid="penukaran-to" type="date" className={`${inputCls} md:w-44`} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <Table loading={loading} empty={data.items.length === 0 ? "Tidak ada penukaran." : null}
        head={["Waktu", "Warga", "Hadiah", { label: "Poin", right: true }, "Status", { label: "Aksi", right: true }]}>
        {data.items.map((r) => {
          const busy = busyId === r.id;
          return (
            <tr key={r.id} data-testid={`penukaran-row-${r.id}`} className="hover:bg-[#FAFBF8]">
              <td className="whitespace-nowrap px-4 py-3 text-[#4B5A52]">{fmtDate(r.created_at, true)}</td>
              <td className="px-4 py-3"><div className="font-bold">{r.user_name || "—"}</div>
                <div className="text-xs text-[#4B5A52]">{r.member_code} · {r.phone} · RT {r.rt}/RW {r.rw}</div></td>
              <td className="px-4 py-3"><div className="font-semibold">{r.item_name}</div>
                <div className="max-w-[240px] truncate text-xs text-[#4B5A52]">{r.note ? `Catatan: ${r.note}` : r.how}</div></td>
              <td className="px-4 py-3 text-right font-extrabold text-[#9A4A0B]">{nf(r.points)}</td>
              <td className="px-4 py-3"><Badge kind={r.status} testid={`penukaran-status-${r.id}`} />
                {r.processed_by && <div className="mt-1 text-[11px] text-[#4B5A52]">oleh {r.processed_by}</div>}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {r.status === "menunggu" && (
                    <Btn variant="outline" size="sm" loading={busy} data-testid={`penukaran-process-${r.id}`} onClick={() => update(r, "diproses")}>
                      <Clock size={14} /> Proses</Btn>
                  )}
                  {(r.status === "menunggu" || r.status === "diproses") && (
                    <>
                      <Btn variant="primary" size="sm" loading={busy} data-testid={`penukaran-done-${r.id}`} onClick={() => update(r, "selesai")}>
                        <Check size={14} /> Selesai</Btn>
                      <Btn variant="ghost" size="sm" data-testid={`penukaran-reject-${r.id}`} onClick={() => { setReject(r); setNote(""); }}>
                        <X size={14} className="text-[#B42318]" /> Tolak</Btn>
                    </>
                  )}
                  {(r.status === "selesai" || r.status === "ditolak") && <span className="text-xs text-[#4B5A52]">{fmtDate(r.updated_at, true)}</span>}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      <Pager page={page} limit={LIMIT} total={data.total} onPage={setPage} />

      {reject && (
        <Modal open onClose={() => setReject(null)} testid="penukaran-reject-modal" title="Tolak penukaran?"
          desc={`${reject.item_name} untuk ${reject.user_name}. ${nf(reject.points)} poin akan dikembalikan dan stok ditambah 1.`}>
          <Field label="Alasan penolakan"><textarea data-testid="penukaran-reject-note" rows={3} className={`${inputCls} h-auto py-2`}
            placeholder="mis. Stok fisik di Balai RW sedang kosong" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setReject(null)}>Batal</Btn>
            <Btn variant="danger" loading={busyId === reject.id} data-testid="penukaran-reject-submit"
              onClick={() => { if (!note.trim()) { toast.error("Alasan wajib diisi"); return; } update(reject, "ditolak", note); }}>Tolak & kembalikan poin</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
