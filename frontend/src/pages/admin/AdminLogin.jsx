import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, BarChart3, Users, Gift } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AntikMark } from "@/components/ui-kit";
import { Btn, Field, inputCls } from "./shared";

export default function AdminLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!phone || !pin) return toast.error("Isi nomor HP dan PIN");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { phone, pin, as_admin: true });
      login(data.token, data.user);
      toast.success(`Selamat datang, ${data.user.name}`);
      nav("/admin", { replace: true });
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-[#F3F5EF] lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#143D2A] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1F5C3F]"><AntikMark size={28} /></span>
          <div>
            <div className="font-display text-xl font-extrabold">ANTIK</div>
            <div className="text-xs text-[#CFE3D6]">Panel Pengelola</div>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            Kelola bank sampah warga dari satu meja.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[#CFE3D6]">
            Pantau setoran, atur jadwal jemput, proses penukaran poin, dan ekspor laporan bulanan untuk RW.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[[BarChart3, "Ringkasan"], [Users, "Warga & Petugas"], [Gift, "Penukaran"]].map(([I, t]) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <I size={20} className="text-[#9FD3B4]" />
                <div className="mt-3 text-xs font-bold">{t}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-[#9FB8A8]">Arisan Tabungan Organik & An-Organik · Sumatera Barat</div>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full border-[40px] border-white/5" />
      </aside>

      <main className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="admin-login-form">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1F5C3F]"><AntikMark size={28} /></span>
            <div className="font-display text-xl font-extrabold">ANTIK · Pengelola</div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E3EFE6] px-3 py-1 text-xs font-bold text-[#1F5C3F]">
            <ShieldCheck size={14} /> Khusus pengelola
          </span>
          <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight">Masuk panel</h1>
          <p className="mt-2 text-sm text-[#4B5A52]">Gunakan nomor HP dan PIN akun pengelola.</p>

          <div className="mt-8 flex flex-col gap-4">
            <Field label="Nomor HP">
              <input data-testid="admin-phone-input" className={`${inputCls} h-12`} inputMode="numeric"
                placeholder="0812xxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="PIN">
              <input data-testid="admin-pin-input" className={`${inputCls} h-12`} type="password" inputMode="numeric"
                placeholder="••••••" value={pin} onChange={(e) => setPin(e.target.value)} />
            </Field>
            <Btn type="submit" size="lg" loading={loading} data-testid="admin-login-submit" className="mt-2 w-full">
              Masuk sebagai pengelola
            </Btn>
          </div>
          <p className="mt-6 rounded-xl bg-white p-3 text-xs text-[#4B5A52]">
            Akun demo: <b>081200000000</b> / PIN <b>123456</b>
          </p>
          <a href="/" className="mt-4 inline-block text-xs font-bold">← Kembali ke aplikasi warga</a>
        </form>
      </main>
    </div>
  );
}
