import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const nf = (n) => new Intl.NumberFormat("id-ID").format(n ?? 0);
export const kg = (n) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n ?? 0)} kg`;

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function fmtDate(iso, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const base = `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  if (!withTime) return base;
  return `${base}, ${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export async function downloadCsv(path, params, filename) {
  try {
    const res = await api.get(path, { params, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("File CSV diunduh");
  } catch (e) {
    toast.error(apiErr(e));
  }
}

export function PageHeader({ title, desc, children }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#17251E] md:text-4xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-[#4B5A52]">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-[#DCE2D8] bg-white ${className}`} {...rest}>{children}</div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = "green", testid }) {
  const tones = {
    green: "bg-[#E3EFE6] text-[#1F5C3F]",
    blue: "bg-[#E4ECF6] text-[#1E4F8A]",
    amber: "bg-[#FBEEDC] text-[#9A4A0B]",
    dark: "bg-[#17251E] text-white",
  };
  return (
    <Card className="flex flex-col gap-3 p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#4B5A52]">{label}</span>
        {Icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="font-display text-3xl font-extrabold tracking-tight text-[#17251E]">{value}</div>
      {sub && <div className="text-xs font-medium text-[#4B5A52]">{sub}</div>}
    </Card>
  );
}

export function Btn({ variant = "primary", size = "md", className = "", loading, children, ...rest }) {
  const v = {
    primary: "bg-[#1F5C3F] text-white hover:bg-[#143D2A] border border-transparent",
    outline: "bg-white text-[#17251E] border border-[#DCE2D8] hover:border-[#1F5C3F] hover:text-[#1F5C3F]",
    ghost: "bg-transparent text-[#17251E] border border-transparent hover:bg-[#E3EFE6]",
    danger: "bg-[#B42318] text-white hover:bg-[#912018] border border-transparent",
    soft: "bg-[#E3EFE6] text-[#1F5C3F] hover:bg-[#d3e6d8] border border-transparent",
  }[variant];
  const s = { sm: "h-9 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-sm" }[size];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v} ${s} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function ExportBtn({ onClick, testid = "export-csv-button" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Btn variant="outline" data-testid={testid} loading={busy}
      onClick={async () => { setBusy(true); await onClick(); setBusy(false); }}>
      {!busy && <Download size={16} />} Ekspor CSV
    </Btn>
  );
}

export const inputCls =
  "h-10 w-full rounded-xl border border-[#DCE2D8] bg-white px-3 text-sm text-[#17251E] outline-none transition-colors placeholder:text-[#8A968F] focus:border-[#1F5C3F] focus:ring-2 focus:ring-[#1F5C3F]/15";

export function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-[#4B5A52]">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-[#4B5A52]">{hint}</span>}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder, testid }) {
  return (
    <div className="relative w-full md:w-72">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A968F]" />
      <input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} className={`${inputCls} pl-9`} />
    </div>
  );
}

export function Select({ value, onChange, options, testid, className = "" }) {
  return (
    <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} cursor-pointer pr-8 ${className}`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const BADGE = {
  menunggu: "bg-[#FBEEDC] text-[#9A4A0B]",
  diproses: "bg-[#E4ECF6] text-[#1E4F8A]",
  selesai: "bg-[#E3EFE6] text-[#1F5C3F]",
  ditolak: "bg-[#FDE8E7] text-[#B42318]",
  aktif: "bg-[#E3EFE6] text-[#1F5C3F]",
  nonaktif: "bg-[#EEF0EC] text-[#5B6560]",
  organik: "bg-[#E3EFE6] text-[#1F5C3F]",
  anorganik: "bg-[#E4ECF6] text-[#1E4F8A]",
  ecobrick: "bg-[#FBEEDC] text-[#B45309]",
  residu: "bg-[#EEF0EC] text-[#5B6560]",
};
export function Badge({ kind, children, testid }) {
  return (
    <span data-testid={testid}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${BADGE[kind] || BADGE.nonaktif}`}>
      {children ?? kind}
    </span>
  );
}

export function Table({ head, children, empty, loading, colSpan }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[#DCE2D8] bg-[#F7F8F4]">
            <tr>
              {head.map((h, i) => (
                <th key={i} className={`whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#4B5A52] ${h.right ? "text-right" : ""}`}>
                  {h.label ?? h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF0EA]">
            {loading ? (
              <tr><td colSpan={colSpan || head.length} className="px-4 py-12 text-center text-[#4B5A52]">
                <Loader2 className="mx-auto animate-spin" size={22} /></td></tr>
            ) : empty ? (
              <tr><td colSpan={colSpan || head.length} className="px-4 py-12 text-center text-sm text-[#4B5A52]">{empty}</td></tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return <div className="text-xs text-[#4B5A52]">{nf(total)} data</div>;
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-[#4B5A52]">
      <span>{nf((page - 1) * limit + 1)}–{nf(Math.min(page * limit, total))} dari {nf(total)}</span>
      <div className="flex items-center gap-1">
        <Btn variant="outline" size="sm" data-testid="pager-prev" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} /></Btn>
        <span className="px-2 font-bold text-[#17251E]">{page} / {pages}</span>
        <Btn variant="outline" size="sm" data-testid="pager-next" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={14} /></Btn>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, desc, children, wide, testid }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid={testid}
        className={`max-h-[90vh] overflow-y-auto rounded-2xl border-[#DCE2D8] bg-white p-6 ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl font-extrabold text-[#17251E]">{title}</DialogTitle>
          {desc ? <DialogDescription className="text-sm text-[#4B5A52]">{desc}</DialogDescription>
            : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function Confirm({ open, onClose, title, desc, confirmLabel = "Ya, lanjutkan", danger, onConfirm, testid = "confirm-dialog" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title} desc={desc} testid={testid}>
      <div className="flex justify-end gap-2 pt-2">
        <Btn variant="outline" onClick={onClose} data-testid="confirm-cancel">Batal</Btn>
        <Btn variant={danger ? "danger" : "primary"} loading={busy} data-testid="confirm-ok"
          onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
          {confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

export function Toggle({ checked, onChange, testid, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} data-testid={testid} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-[#1F5C3F]" : "bg-[#C9D0C5]"}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}
