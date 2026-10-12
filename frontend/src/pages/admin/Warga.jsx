import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, KeyRound, Plus, Minus } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import {
  Badge, Btn, Card, Confirm, ExportBtn, Field, Modal, PageHeader, Pager, SearchInput, Select, Table, Toggle,
  downloadCsv, fmtDate, inputCls, kg, nf, useDebounced,
} from "./shared";

const LIMIT = 20;

export default function Warga() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [rw, setRw] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const dq = useDebounced(q);
  const drw = useDebounced(rw);

  const params = { q: dq || undefined, status: status === "all" ? undefined : status, rw: drw || undefined };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/warga", { params: { ...params, page, limit: LIMIT } });
      setData(data);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, status, drw, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dq, status, drw]);

  return (
    <>
      <PageHeader title="Warga" desc="Kelola data anggota, status akun, dan saldo poin.">
        <ExportBtn testid="warga-export-button" onClick={() => downloadCsv("/admin/warga/export", params, "warga.csv")} />
      </PageHeader>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchInput testid="warga-search-input" value={q} onChange={setQ} placeholder="Cari nama, HP, atau kode anggota" />
        <Select testid="warga-status-filter" value={status} onChange={setStatus} className="md:w-44"
          options={[{ value: "all", label: "Semua status" }, { value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }]} />
        <input data-testid="warga-rw-filter" value={rw} onChange={(e) => setRw(e.target.value)} placeholder="Filter RW (mis. 05)"
          className={`${inputCls} md:w-44`} />
      </div>

      <Table loading={loading} empty={data.items.length === 0 ? "Tidak ada warga yang cocok." : null}
        head={["Anggota", "No HP", "Alamat", { label: "Poin", right: true }, { label: "Setoran", right: true }, "Status", ""]}>
        {data.items.map((u) => (
          <tr key={u.id} className="hover:bg-[#FAFBF8]" data-testid={`warga-row-${u.id}`}>
            <td className="px-4 py-3">
              <div className="font-bold">{u.name}</div>
              <div className="text-xs text-[#4B5A52]">{u.member_code}</div>
            </td>
            <td className="px-4 py-3 text-[#4B5A52]">{u.phone}</td>
            <td className="px-4 py-3">
              <div className="text-sm">RT {u.rt} / RW {u.rw}</div>
              <div className="max-w-[220px] truncate text-xs text-[#4B5A52]">{[u.kelurahan, u.kecamatan].filter(Boolean).join(", ")}</div>
            </td>
            <td className="px-4 py-3 text-right font-extrabold text-[#9A4A0B]">{nf(u.points)}</td>
            <td className="px-4 py-3 text-right">
              <div className="font-bold">{nf(u.setoran_count)}</div>
              <div className="text-[11px] text-[#4B5A52]">{u.last_setoran ? fmtDate(u.last_setoran) : "—"}</div>
            </td>
            <td className="px-4 py-3"><Badge kind={u.active ? "aktif" : "nonaktif"}>{u.active ? "Aktif" : "Nonaktif"}</Badge></td>
            <td className="px-4 py-3 text-right">
              <Btn variant="soft" size="sm" data-testid={`warga-detail-${u.id}`} onClick={() => setOpenId(u.id)}>
                <Eye size={14} /> Detail</Btn>
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} limit={LIMIT} total={data.total} onPage={setPage} />

      {openId && <WargaDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

function WargaDetail({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("profil");
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);
  const [adj, setAdj] = useState({ mode: "add", amount: "", reason: "" });
  const [adjBusy, setAdjBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/warga/${id}`);
      setD(data);
      const u = data.user;
      setForm({ name: u.name, phone: u.phone, kabupaten: u.kabupaten || "", kecamatan: u.kecamatan || "",
        kelurahan: u.kelurahan || "", rt: u.rt || "", rw: u.rw || "" });
    } catch (e) { toast.error(apiErr(e)); onClose(); }
  }, [id, onClose]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/warga/${id}`, form);
      toast.success("Data warga disimpan");
      await load(); onChanged();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };

  const toggleActive = async () => {
    try {
      await api.patch(`/admin/warga/${id}`, { active: !d.user.active });
      toast.success(d.user.active ? "Akun dinonaktifkan" : "Akun diaktifkan kembali");
      setConfirmActive(false);
      await load(); onChanged();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const submitAdj = async () => {
    const n = parseInt(adj.amount, 10);
    if (!n || n <= 0) return toast.error("Masukkan jumlah poin");
    if (!adj.reason.trim()) return toast.error("Alasan wajib diisi");
    setAdjBusy(true);
    try {
      await api.post(`/admin/warga/${id}/points`, { delta: adj.mode === "add" ? n : -n, reason: adj.reason });
      toast.success("Poin diperbarui");
      setAdj({ mode: "add", amount: "", reason: "" });
      await load(); onChanged();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setAdjBusy(false); }
  };

  const resetPin = async () => {
    if (!/^\d{4,}$/.test(pin)) return toast.error("PIN minimal 4 digit angka");
    setPinBusy(true);
    try {
      await api.post(`/admin/users/${id}/reset-pin`, { pin });
      toast.success("PIN berhasil diganti");
      setPin("");
    } catch (e) { toast.error(apiErr(e)); }
    finally { setPinBusy(false); }
  };

  const u = d?.user;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open onClose={onClose} wide testid="warga-detail-modal"
      title={u ? u.name : "Memuat…"} desc={u ? `${u.member_code} · terdaftar ${fmtDate(u.created_at)}` : ""}>
      {u && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3"><div className="text-[11px] font-bold uppercase text-[#4B5A52]">Saldo poin</div>
              <div data-testid="warga-detail-points" className="font-display text-2xl font-extrabold text-[#9A4A0B]">{nf(u.points)}</div></Card>
            <Card className="p-3"><div className="text-[11px] font-bold uppercase text-[#4B5A52]">Setoran</div>
              <div className="font-display text-2xl font-extrabold">{nf(d.setoran.length)}</div></Card>
            <Card className="flex flex-col justify-between gap-1 p-3">
              <div className="text-[11px] font-bold uppercase text-[#4B5A52]">Akun aktif</div>
              <Toggle testid="warga-active-toggle" checked={u.active} onChange={() => setConfirmActive(true)} />
            </Card>
          </div>

          <div className="flex gap-1 rounded-xl bg-[#F3F5EF] p-1">
            {[["profil", "Profil"], ["poin", "Atur poin"], ["riwayat", "Riwayat"]].map(([k, l]) => (
              <button key={k} data-testid={`warga-tab-${k}`} onClick={() => setTab(k)}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${tab === k ? "bg-white text-[#1F5C3F] shadow-sm" : "text-[#4B5A52]"}`}>{l}</button>
            ))}
          </div>

          {tab === "profil" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nama"><input data-testid="warga-edit-name" className={inputCls} value={form.name} onChange={set("name")} /></Field>
                <Field label="No HP"><input data-testid="warga-edit-phone" className={inputCls} value={form.phone} onChange={set("phone")} /></Field>
                <Field label="Kabupaten/Kota"><input className={inputCls} value={form.kabupaten} onChange={set("kabupaten")} /></Field>
                <Field label="Kecamatan"><input className={inputCls} value={form.kecamatan} onChange={set("kecamatan")} /></Field>
                <Field label="Kelurahan/Nagari"><input className={inputCls} value={form.kelurahan} onChange={set("kelurahan")} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="RT"><input data-testid="warga-edit-rt" className={inputCls} value={form.rt} onChange={set("rt")} /></Field>
                  <Field label="RW"><input data-testid="warga-edit-rw" className={inputCls} value={form.rw} onChange={set("rw")} /></Field>
                </div>
              </div>
              <div className="flex justify-end">
                <Btn data-testid="warga-save-button" loading={saving} onClick={save}>Simpan perubahan</Btn>
              </div>
              <div className="rounded-2xl border border-dashed border-[#DCE2D8] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold"><KeyRound size={16} /> Reset PIN</div>
                <div className="flex gap-2">
                  <input data-testid="warga-new-pin" className={inputCls} type="password" inputMode="numeric"
                    placeholder="PIN baru (min. 4 digit)" value={pin} onChange={(e) => setPin(e.target.value)} />
                  <Btn variant="outline" loading={pinBusy} data-testid="warga-reset-pin-button" onClick={resetPin}>Ganti PIN</Btn>
                </div>
              </div>
            </div>
          )}

          {tab === "poin" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {[["add", "Tambah poin", Plus], ["sub", "Kurangi poin", Minus]].map(([k, l, I]) => (
                  <button key={k} data-testid={`adj-mode-${k}`} onClick={() => setAdj((a) => ({ ...a, mode: k }))}
                    className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${adj.mode === k
                      ? (k === "add" ? "border-[#1F5C3F] bg-[#E3EFE6] text-[#1F5C3F]" : "border-[#9A4A0B] bg-[#FBEEDC] text-[#9A4A0B]")
                      : "border-[#DCE2D8] bg-white text-[#4B5A52]"}`}>
                    <I size={16} /> {l}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                <Field label="Jumlah poin"><input data-testid="adj-amount" className={inputCls} type="number" min="1"
                  value={adj.amount} onChange={(e) => setAdj((a) => ({ ...a, amount: e.target.value }))} /></Field>
                <Field label="Alasan"><input data-testid="adj-reason" className={inputCls} placeholder="mis. Koreksi timbangan 10 Okt"
                  value={adj.reason} onChange={(e) => setAdj((a) => ({ ...a, reason: e.target.value }))} /></Field>
              </div>
              <div className="flex justify-end">
                <Btn data-testid="adj-submit" loading={adjBusy} onClick={submitAdj}>Simpan penyesuaian</Btn>
              </div>
              <div>
                <div className="mb-2 text-xs font-bold uppercase text-[#4B5A52]">Riwayat penyesuaian</div>
                {d.adjustments.length === 0 && <p className="text-sm text-[#4B5A52]">Belum ada penyesuaian.</p>}
                <div className="flex flex-col divide-y divide-[#EEF0EA]">
                  {d.adjustments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div><div className="font-semibold">{a.reason}</div>
                        <div className="text-xs text-[#4B5A52]">{fmtDate(a.created_at, true)} · oleh {a.admin_name}</div></div>
                      <span className={`font-extrabold ${a.delta > 0 ? "text-[#1F5C3F]" : "text-[#9A4A0B]"}`}>{a.delta > 0 ? "+" : ""}{nf(a.delta)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "riwayat" && (
            <div className="flex flex-col gap-5">
              <div>
                <div className="mb-2 text-xs font-bold uppercase text-[#4B5A52]">Setoran</div>
                {d.setoran.length === 0 && <p className="text-sm text-[#4B5A52]">Belum ada setoran.</p>}
                <div className="flex flex-col divide-y divide-[#EEF0EA]">
                  {d.setoran.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div><div className="font-semibold">{t.summary}</div>
                        <div className="text-xs text-[#4B5A52]">{fmtDate(t.created_at, true)} · {t.petugas_name}
                          {t.items?.filter((i) => i.type !== "ecobrick").length ? ` · ${t.items.filter((i) => i.type !== "ecobrick").map((i) => `${i.type} ${kg(i.value)}`).join(", ")}` : ""}</div></div>
                      <span className="font-extrabold text-[#1F5C3F]">+{nf(t.total_points)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-bold uppercase text-[#4B5A52]">Penukaran</div>
                {d.redemptions.length === 0 && <p className="text-sm text-[#4B5A52]">Belum ada penukaran.</p>}
                <div className="flex flex-col divide-y divide-[#EEF0EA]">
                  {d.redemptions.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div><div className="font-semibold">{r.item_name}</div>
                        <div className="text-xs text-[#4B5A52]">{fmtDate(r.created_at, true)}</div></div>
                      <div className="flex items-center gap-2"><Badge kind={r.status === "berhasil" ? "selesai" : r.status}>
                        {r.status === "berhasil" ? "selesai" : r.status}</Badge>
                        <span className="font-extrabold text-[#9A4A0B]">-{nf(r.points)}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {u && (
        <Confirm open={confirmActive} onClose={() => setConfirmActive(false)} danger={u.active}
          title={u.active ? "Nonaktifkan akun warga?" : "Aktifkan kembali akun?"}
          desc={u.active ? `${u.name} tidak akan bisa masuk aplikasi dan tidak bisa menerima setoran sampai diaktifkan lagi.`
            : `${u.name} akan bisa masuk dan menyetor sampah lagi.`}
          confirmLabel={u.active ? "Nonaktifkan" : "Aktifkan"} onConfirm={toggleActive} />
      )}
    </Modal>
  );
}
