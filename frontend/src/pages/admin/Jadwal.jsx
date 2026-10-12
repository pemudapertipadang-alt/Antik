import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Badge, Btn, Confirm, Field, Modal, PageHeader, Select, Table, fmtDate, inputCls, nf, todayISO, useDebounced } from "./shared";

const TYPES = [
  { value: "organik", label: "Organik" },
  { value: "anorganik", label: "Anorganik" },
  { value: "residu", label: "Residu" },
  { value: "ecobrick", label: "Ecobrick" },
];
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Jadwal() {
  const [frm, setFrm] = useState(addDays(todayISO(), -7));
  const [to, setTo] = useState(addDays(todayISO(), 30));
  const [rw, setRw] = useState("");
  const [rt, setRt] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [petugas, setPetugas] = useState([]);
  const drw = useDebounced(rw);
  const drt = useDebounced(rt);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/schedules", { params: { frm: frm || undefined, to: to || undefined, rw: drw || undefined, rt: drt || undefined } });
      setItems(data.items);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
  }, [frm, to, drw, drt]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/admin/petugas").then((r) => setPetugas(r.data.items.filter((p) => p.active))).catch(() => {}); }, []);

  const save = async () => {
    if (!edit.date) return toast.error("Pilih tanggal");
    setBusy(true);
    const body = { date: edit.date, type: edit.type, time: edit.time, tip: edit.tip, petugas: edit.petugas, rt: edit.rt, rw: edit.rw };
    try {
      if (edit.id) {
        await api.put(`/admin/schedules/${edit.id}`, body);
        toast.success("Jadwal diperbarui");
      } else {
        const n = Math.max(1, Math.min(12, parseInt(edit.repeat, 10) || 1));
        for (let i = 0; i < n; i++) await api.post("/admin/schedules", { ...body, date: addDays(edit.date, i * 7) });
        toast.success(n > 1 ? `${n} jadwal mingguan dibuat` : "Jadwal dibuat");
      }
      setEdit(null); load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    try { await api.delete(`/admin/schedules/${del.id}`); toast.success("Jadwal dihapus"); setDel(null); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));
  const today = todayISO();

  return (
    <>
      <PageHeader title="Jadwal Jemput" desc="Atur jadwal penjemputan sampah per RT/RW. Warga melihat jadwal sesuai wilayahnya.">
        <Btn data-testid="schedule-add-button" onClick={() => setEdit({ date: today, type: "organik", time: "07.00–09.00", tip: "", petugas: petugas[0]?.name || "", rt: "03", rw: "05", repeat: 1 })}>
          <Plus size={16} /> Tambah jadwal</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 md:flex md:items-end">
        <Field label="Dari"><input data-testid="schedule-from" type="date" className={`${inputCls} md:w-44`} value={frm} onChange={(e) => setFrm(e.target.value)} /></Field>
        <Field label="Sampai"><input data-testid="schedule-to" type="date" className={`${inputCls} md:w-44`} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="RW"><input data-testid="schedule-rw-filter" className={`${inputCls} md:w-24`} placeholder="Semua" value={rw} onChange={(e) => setRw(e.target.value)} /></Field>
        <Field label="RT"><input data-testid="schedule-rt-filter" className={`${inputCls} md:w-24`} placeholder="Semua" value={rt} onChange={(e) => setRt(e.target.value)} /></Field>
      </div>

      <Table loading={loading} empty={items.length === 0 ? "Tidak ada jadwal di rentang ini." : null}
        head={["Tanggal", "Jenis", "Waktu", "Wilayah", "Petugas", { label: "Konfirmasi warga", right: true }, ""]}>
        {items.map((s) => {
          const past = s.date < today;
          return (
            <tr key={s.id} data-testid={`schedule-row-${s.id}`} className={`hover:bg-[#FAFBF8] ${past ? "opacity-55" : ""}`}>
              <td className="px-4 py-3"><div className="font-bold">{s.label}</div>
                <div className="text-xs text-[#4B5A52]">{fmtDate(s.date)}{s.date === today ? " · hari ini" : ""}</div></td>
              <td className="px-4 py-3"><Badge kind={s.type} /></td>
              <td className="px-4 py-3">{s.time}</td>
              <td className="px-4 py-3">RT {s.rt} / RW {s.rw}</td>
              <td className="px-4 py-3 text-[#4B5A52]">{s.petugas}</td>
              <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1 font-bold"><Users size={14} className="text-[#4B5A52]" />{nf(s.confirmed_count)}</span></td>
              <td className="px-4 py-3"><div className="flex justify-end gap-1">
                <Btn variant="ghost" size="sm" data-testid={`schedule-delete-${s.id}`} onClick={() => setDel(s)}><Trash2 size={14} className="text-[#B42318]" /></Btn>
                <Btn variant="soft" size="sm" data-testid={`schedule-edit-${s.id}`} onClick={() => setEdit({ ...s })}><Pencil size={14} /> Ubah</Btn></div></td>
            </tr>
          );
        })}
      </Table>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? "Ubah jadwal" : "Tambah jadwal"} testid="schedule-form-modal">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tanggal"><input data-testid="schedule-form-date" type="date" className={inputCls} value={edit.date} onChange={set("date")} /></Field>
            <Field label="Jenis sampah"><Select testid="schedule-form-type" value={edit.type} onChange={(v) => setEdit((x) => ({ ...x, type: v }))} options={TYPES} /></Field>
            <Field label="Waktu"><input data-testid="schedule-form-time" className={inputCls} value={edit.time} onChange={set("time")} /></Field>
            <Field label="Petugas">
              <input data-testid="schedule-form-petugas" list="petugas-list" className={inputCls} value={edit.petugas} onChange={set("petugas")} />
              <datalist id="petugas-list">{petugas.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            </Field>
            <Field label="RT"><input data-testid="schedule-form-rt" className={inputCls} value={edit.rt} onChange={set("rt")} /></Field>
            <Field label="RW"><input data-testid="schedule-form-rw" className={inputCls} value={edit.rw} onChange={set("rw")} /></Field>
            <div className="sm:col-span-2"><Field label="Tips untuk warga" hint="Kosongkan untuk memakai tips bawaan sesuai jenis sampah.">
              <textarea data-testid="schedule-form-tip" rows={2} className={`${inputCls} h-auto py-2`} value={edit.tip} onChange={set("tip")} /></Field></div>
            {!edit.id && (
              <Field label="Ulangi tiap minggu" hint="Jumlah minggu (1 = sekali saja, maks. 12).">
                <input data-testid="schedule-form-repeat" type="number" min="1" max="12" className={inputCls} value={edit.repeat} onChange={set("repeat")} />
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setEdit(null)}>Batal</Btn>
            <Btn data-testid="schedule-form-submit" loading={busy} onClick={save}>Simpan</Btn>
          </div>
        </Modal>
      )}

      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Hapus jadwal?"
        desc={`Jadwal ${del?.label} (RT ${del?.rt}/RW ${del?.rw}) akan dihapus beserta konfirmasi warganya.`}
        confirmLabel="Hapus" onConfirm={doDelete} />
    </>
  );
}
