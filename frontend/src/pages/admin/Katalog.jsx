import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Leaf, Smartphone, Home, HeartHandshake, Package, MapPin } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { rp } from "@/components/ui-kit";
import { Badge, Btn, Card, Confirm, Field, Modal, PageHeader, Toggle, inputCls, nf } from "./shared";

const ICON = { Kebun: Leaf, Pulsa: Smartphone, "Rumah Tangga": Home, Donasi: HeartHandshake };
const EMPTY = { name: "", sub: "", points: "", category: "Kebun", how: "", stock: "", active: true };

export default function Katalog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState("Semua");

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/admin/catalog"); setItems(data.items); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cats = useMemo(() => ["Semua", ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const shown = items.filter((i) => cat === "Semua" || i.category === cat);

  const payload = (x) => ({ name: x.name, sub: x.sub, points: parseInt(x.points, 10) || 0, category: x.category,
    how: x.how, stock: parseInt(x.stock, 10) || 0, active: x.active });

  const save = async () => {
    setBusy(true);
    try {
      if (edit.id) await api.put(`/admin/catalog/${edit.id}`, payload(edit));
      else await api.post("/admin/catalog", payload(edit));
      toast.success(edit.id ? "Item diperbarui" : "Item ditambahkan");
      setEdit(null); load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const quickToggle = async (it) => {
    try {
      await api.put(`/admin/catalog/${it.id}`, payload({ ...it, active: !it.active }));
      toast.success(!it.active ? "Item ditampilkan ke warga" : "Item disembunyikan dari warga");
      load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const doDelete = async () => {
    try { await api.delete(`/admin/catalog/${del.id}`); toast.success("Item dihapus"); setDel(null); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <PageHeader title="Katalog Hadiah" desc="Hadiah yang bisa ditukar warga dengan poin. Item nonaktif tidak tampil di aplikasi.">
        <Btn data-testid="catalog-add-button" onClick={() => setEdit({ ...EMPTY })}><Plus size={16} /> Tambah item</Btn>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <button key={c} data-testid={`catalog-cat-${c}`} onClick={() => setCat(c)}
            className={`h-9 rounded-full border px-4 text-xs font-bold ${cat === c ? "border-[#1F5C3F] bg-[#1F5C3F] text-white" : "border-[#DCE2D8] bg-white text-[#17251E]"}`}>{c}</button>
        ))}
      </div>

      {loading ? <p className="text-sm text-[#4B5A52]">Memuat…</p> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.length === 0 && <p className="text-sm text-[#4B5A52]">Belum ada item.</p>}
          {shown.map((it) => {
            const I = ICON[it.category] || Package;
            return (
              <Card key={it.id} data-testid={`catalog-item-${it.id}`} className={`flex flex-col gap-4 p-5 ${it.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E3EFE6] text-[#1F5C3F]"><I size={22} /></span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#4B5A52]">{it.active ? "Tampil" : "Disembunyikan"}</span>
                    <Toggle testid={`catalog-active-${it.id}`} checked={it.active} onChange={() => quickToggle(it)} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="font-display text-lg font-extrabold leading-tight">{it.name}</div>
                  <div className="mt-1 text-xs text-[#4B5A52]">{it.sub}</div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-[#4B5A52]"><MapPin size={12} /> {it.how || "—"}</div>
                </div>
                <div className="flex items-center justify-between border-t border-[#EEF0EA] pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge kind="ecobrick">{nf(it.points)} poin · {rp(it.points)}</Badge>
                    <span className={`font-bold ${it.stock <= 5 ? "text-[#B42318]" : "text-[#4B5A52]"}`}>Stok {nf(it.stock)}</span>
                    <span className="text-[#4B5A52]">· {nf(it.redeemed)}× ditukar</span>
                  </div>
                  <div className="flex gap-1">
                    <Btn variant="ghost" size="sm" data-testid={`catalog-delete-${it.id}`} onClick={() => setDel(it)}><Trash2 size={14} className="text-[#B42318]" /></Btn>
                    <Btn variant="soft" size="sm" data-testid={`catalog-edit-${it.id}`} onClick={() => setEdit({ ...it })}><Pencil size={14} /></Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? "Ubah item" : "Tambah item"} testid="catalog-form-modal">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Nama hadiah"><input data-testid="catalog-form-name" className={inputCls} value={edit.name} onChange={set("name")} /></Field></div>
            <div className="sm:col-span-2"><Field label="Keterangan singkat"><input data-testid="catalog-form-sub" className={inputCls} value={edit.sub} onChange={set("sub")} /></Field></div>
            <Field label="Kategori">
              <input data-testid="catalog-form-category" list="catalog-cats" className={inputCls} value={edit.category} onChange={set("category")} />
              <datalist id="catalog-cats">{["Kebun", "Pulsa", "Rumah Tangga", "Donasi"].map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label={`Harga (poin) · senilai ${rp(parseInt(edit.points, 10) || 0)}`}><input data-testid="catalog-form-points" type="number" min="1" className={inputCls} value={edit.points} onChange={set("points")} /></Field>
            <Field label="Stok"><input data-testid="catalog-form-stock" type="number" min="0" className={inputCls} value={edit.stock} onChange={set("stock")} /></Field>
            <Field label="Tampil ke warga"><div className="flex h-10 items-center"><Toggle testid="catalog-form-active" checked={edit.active} onChange={(v) => setEdit((x) => ({ ...x, active: v }))} /></div></Field>
            <div className="sm:col-span-2"><Field label="Cara pengambilan"><input data-testid="catalog-form-how" className={inputCls} placeholder="mis. Ambil di Balai RW" value={edit.how} onChange={set("how")} /></Field></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setEdit(null)}>Batal</Btn>
            <Btn data-testid="catalog-form-submit" loading={busy} onClick={save}>Simpan</Btn>
          </div>
        </Modal>
      )}

      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Hapus item katalog?"
        desc={`“${del?.name}” akan dihapus permanen. Riwayat penukaran lama tetap tersimpan. Jika hanya ingin menyembunyikan, matikan tombol “Tampil”.`}
        confirmLabel="Hapus" onConfirm={doDelete} />
    </>
  );
}
