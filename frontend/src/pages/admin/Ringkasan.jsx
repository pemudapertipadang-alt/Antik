import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Scale, Coins, Ticket, ArrowRight, CalendarDays, Trophy, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { Badge, Card, PageHeader, StatCard, fmtDate, kg, nf } from "./shared";

export default function Ringkasan() {
  const [d, setD] = useState(null);

  useEffect(() => {
    api.get("/admin/summary").then((r) => setD(r.data)).catch((e) => toast.error(apiErr(e)));
  }, []);

  if (!d) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#1F5C3F]" /></div>;
  const m = d.month;
  const monthName = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Ringkasan" desc={`Gambaran bank sampah bulan ${monthName}.`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="stat-warga" label="Warga terdaftar" value={nf(d.warga_total)} icon={Users}
          sub={`${nf(d.warga_active)} aktif · +${nf(d.new_warga_month)} bulan ini · ${nf(d.petugas_total)} petugas`} />
        <StatCard testid="stat-sampah" label="Sampah terkumpul" value={kg(m.total_kg)} icon={Scale} tone="blue"
          sub={`${nf(m.setoran)} setoran · ${nf(m.ecobrick)} ecobrick bulan ini`} />
        <StatCard testid="stat-poin" label="Poin beredar" value={nf(d.points_outstanding)} icon={Coins} tone="amber"
          sub={`${nf(m.points_issued)} poin diberikan bulan ini`} />
        <Link to="/admin/penukaran" className="block">
          <StatCard testid="stat-penukaran" label="Penukaran perlu diproses" value={nf(d.redemptions_pending)} icon={Ticket} tone="dark"
            sub={`${nf(d.redemptions_month)} penukaran bulan ini →`} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-extrabold">Setoran 14 hari terakhir</h2>
              <p className="text-xs text-[#4B5A52]">Berat organik & anorganik (kg) per hari</p>
            </div>
            <div className="flex gap-4 text-right">
              <div><div className="text-[11px] font-bold uppercase text-[#4B5A52]">Organik</div>
                <div className="font-display text-lg font-extrabold text-[#1F5C3F]">{kg(m.organik)}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-[#4B5A52]">Anorganik</div>
                <div className="font-display text-lg font-extrabold text-[#1E4F8A]">{kg(m.anorganik)}</div></div>
            </div>
          </div>
          <div className="h-64" data-testid="summary-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF0EA" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#4B5A52" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: "#4B5A52" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#F3F5EF" }} contentStyle={{ borderRadius: 12, border: "1px solid #DCE2D8", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="organik" name="Organik" stackId="a" fill="#1F5C3F" radius={[0, 0, 4, 4]} />
                <Bar dataKey="anorganik" name="Anorganik" stackId="a" fill="#1E4F8A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Trophy size={18} className="text-[#B45309]" />
            <h2 className="font-display text-lg font-extrabold">Warga teratas</h2>
          </div>
          <ol className="flex flex-col divide-y divide-[#EEF0EA]">
            {d.top_warga.length === 0 && <li className="py-6 text-center text-sm text-[#4B5A52]">Belum ada warga.</li>}
            {d.top_warga.map((u, i) => (
              <li key={u.id} className="flex items-center gap-3 py-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${i === 0 ? "bg-[#FBEEDC] text-[#9A4A0B]" : "bg-[#F3F5EF] text-[#4B5A52]"}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{u.name}</div>
                  <div className="text-xs text-[#4B5A52]">{u.member_code} · RT {u.rt}/RW {u.rw}</div>
                </div>
                <span className="text-sm font-extrabold text-[#9A4A0B]">{nf(u.points)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold">Setoran terbaru</h2>
            <Link to="/admin/setoran" className="flex items-center gap-1 text-xs font-bold">Lihat semua <ArrowRight size={14} /></Link>
          </div>
          <div className="flex flex-col divide-y divide-[#EEF0EA]">
            {d.recent_setoran.length === 0 && <p className="py-6 text-center text-sm text-[#4B5A52]">Belum ada setoran.</p>}
            {d.recent_setoran.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{t.warga_name}</div>
                  <div className="text-xs text-[#4B5A52]">{t.summary} · oleh {t.petugas_name} · {fmtDate(t.created_at, true)}</div>
                </div>
                <span className="text-sm font-extrabold text-[#1F5C3F]">+{nf(t.total_points)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold">Jadwal jemput terdekat</h2>
            <Link to="/admin/jadwal" className="flex items-center gap-1 text-xs font-bold">Kelola <ArrowRight size={14} /></Link>
          </div>
          <div className="flex flex-col divide-y divide-[#EEF0EA]">
            {d.upcoming.length === 0 && <p className="py-6 text-center text-sm text-[#4B5A52]">Belum ada jadwal mendatang.</p>}
            {d.upcoming.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F5EF] text-[#1F5C3F]"><CalendarDays size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{s.label}</div>
                  <div className="text-xs text-[#4B5A52]">{s.time} · RT {s.rt}/RW {s.rw} · {s.petugas}</div>
                </div>
                <Badge kind={s.type} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
