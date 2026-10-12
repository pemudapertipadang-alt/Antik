import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Badge, Btn, Confirm, Field, Modal, PageHeader, Table, Toggle, fmtDate, inputCls, nf } from "./shared";

const EMPTY = { name: "", phone: "", pin: "", rt: "", rw: "", kelurahan: "" };

export default function Petugas() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);       // null | {mode:'create'|'edit', ...}
  const [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState(null);
  const [pinFor, setPinFor] = useState(null);
  const [pin, setPin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/admin/petugas"); setItems(data.items); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      if (edit.mode === "create") {
        await api.post("/admin/petugas", { name: edit.name, phone: edit.phone, pin: edit.pin, rt: edit.rt, rw: edit.rw, kelurahan: edit.kelurahan });
        toast.success("Petugas ditambahkan");
      } else {
        await api.patch(`/admin/petugas/${edit.id}`, { name: edit.name, phone: edit.phone, rt: edit.rt, rw: edit.rw, kelurahan: edit.kelurahan });
        toast.success("Data petugas disimpan");
      }
      setEdit(null); load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const doToggle = async () => {
    try {
      await api.patch(`/admin/petugas/${toggle.id}`, { active: !toggle.active });
      toast.success(toggle.active ? "Petugas dinonaktifkan" : "Petugas diaktifkan");
      setToggle(null); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const doPin = async () => {
    if (!/^\d{4,}$/.test(pin)) return toast.error("PIN minimal 4 digit angka");
    setBusy(true);
    try {
      await api.post(`/admin/users/${pinFor.id}/reset-pin`, { pin });
      toast.success("PIN petugas diganti");
      setPinFor(null); setPin("");
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <PageHeader title="Petugas" desc="Akun petugas lapangan yang menimbang dan mencatat setoran warga.">
        <Btn data-testid="petugas-add-button" onClick={() => setEdit({ mode: "create", ...EMPTY })}><Plus size={16} /> Tambah petugas</Btn>
      </PageHeader>

      <Table loading={loading} empty={items.length === 0 ? "Belum ada petugas." : null}
        head={["Petugas", "No HP", "Wilayah", { label: "Hari ini", right: true }, { label: "Bulan ini", right: true }, { label: "Total", right: true }, "Aktif", ""]}>
        {items.map((p) => (
          <tr key={p.id} data-testid={`petugas-row-${p.id}`} className="hover:bg-[#FAFBF8]">
            <td className="px-4 py-3"><div className="font-bold">{p.name}</div>
              <div className="text-xs text-[#4B5A52]">{p.member_code} · sejak {fmtDate(p.created_at)}</div></td>
            <td className="px-4 py-3 text-[#4B5A52]">{p.phone}</td>
            <td className="px-4 py-3"><div>RT {p.rt || "—"} / RW {p.rw || "—"}</div>
              <div className="text-xs text-[#4B5A52]">{p.kelurahan || "—"}</div></td>
            <td className="px-4 py-3 text-right font-bold">{nf(p.setoran_today)}</td>
            <td className="px-4 py-3 text-right font-bold">{nf(p.setoran_month)}</td>
            <td className="px-4 py-3 text-right font-bold">{nf(p.setoran_total)}</td>
            <td className="px-4 py-3"><div className="flex items-center gap-2">
              <Toggle testid={`petugas-active-${p.id}`} checked={p.active} onChange={() => setToggle(p)} />
              <Badge kind={p.active ? "aktif" : "nonaktif"}>{p.active ? "Aktif" : "Nonaktif"}</Badge></div></td>
            <td className="px-4 py-3"><div className="flex justify-end gap-1">
              <Btn variant="ghost" size="sm" data-testid={`petugas-pin-${p.id}`} onClick={() => { setPinFor(p); setPin(""); }}><KeyRound size={14} /></Btn>
              <Btn variant="soft" size="sm" data-testid={`petugas-edit-${p.id}`}
                onClick={() => setEdit({ mode: "edit", id: p.id, name: p.name, phone: p.phone, rt: p.rt || "", rw: p.rw || "", kelurahan: p.kelurahan || "" })}>
                <Pencil size={14} /> Ubah</Btn></div></td>
          </tr>
        ))}
      </Table>

      {edit && (
        <Modal open onClose={() => setEdit(null)} testid="petugas-form-modal"
          title={edit.mode === "create" ? "Tambah petugas" : "Ubah petugas"}
          desc={edit.mode === "create" ? "Petugas masuk lewat aplikasi dengan mode “Masuk petugas”." : ""}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nama"><input data-testid="petugas-form-name" className={inputCls} value={edit.name} onChange={set("name")} /></Field>
            <Field label="No HP"><input data-testid="petugas-form-phone" className={inputCls} value={edit.phone} onChange={set("phone")} /></Field>
            {edit.mode === "create" && (
              <Field label="PIN awal"><input data-testid="petugas-form-pin" className={inputCls} type="password" inputMode="numeric"
                value={edit.pin} onChange={set("pin")} placeholder="min. 4 digit" /></Field>
            )}
            <Field label="Kelurahan/Nagari"><input className={inputCls} value={edit.kelurahan} onChange={set("kelurahan")} /></Field>
            <Field label="RT"><input data-testid="petugas-form-rt" className={inputCls} value={edit.rt} onChange={set("rt")} /></Field>
            <Field label="RW"><input data-testid="petugas-form-rw" className={inputCls} value={edit.rw} onChange={set("rw")} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setEdit(null)}>Batal</Btn>
            <Btn data-testid="petugas-form-submit" loading={busy} onClick={save}>Simpan</Btn>
          </div>
        </Modal>
      )}

      {pinFor && (
        <Modal open onClose={() => setPinFor(null)} title={`Reset PIN — ${pinFor.name}`} testid="petugas-pin-modal">
          <Field label="PIN baru"><input data-testid="petugas-new-pin" className={inputCls} type="password" inputMode="numeric"
            value={pin} onChange={(e) => setPin(e.target.value)} placeholder="min. 4 digit" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setPinFor(null)}>Batal</Btn>
            <Btn data-testid="petugas-pin-submit" loading={busy} onClick={doPin}>Ganti PIN</Btn>
          </div>
        </Modal>
      )}

      <Confirm open={!!toggle} onClose={() => setToggle(null)} danger={toggle?.active}
        title={toggle?.active ? "Nonaktifkan petugas?" : "Aktifkan petugas?"}
        desc={toggle?.active ? `${toggle?.name} tidak akan bisa masuk dan mencatat setoran.` : `${toggle?.name} bisa masuk dan mencatat setoran lagi.`}
        confirmLabel={toggle?.active ? "Nonaktifkan" : "Aktifkan"} onConfirm={doToggle} />
    </>
  );
}
