import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, HardHat, Gift, CalendarDays, Scale, Ticket, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AntikMark } from "@/components/ui-kit";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const NAV = [
  { to: "/admin", end: true, label: "Ringkasan", icon: LayoutDashboard, id: "ringkasan" },
  { to: "/admin/warga", label: "Warga", icon: Users, id: "warga" },
  { to: "/admin/petugas", label: "Petugas", icon: HardHat, id: "petugas" },
  { to: "/admin/katalog", label: "Katalog Hadiah", icon: Gift, id: "katalog" },
  { to: "/admin/jadwal", label: "Jadwal Jemput", icon: CalendarDays, id: "jadwal" },
  { to: "/admin/setoran", label: "Laporan Setoran", icon: Scale, id: "setoran" },
  { to: "/admin/penukaran", label: "Penukaran Poin", icon: Ticket, id: "penukaran" },
];

function SideNav({ onNavigate }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col bg-[#143D2A] text-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1F5C3F]"><AntikMark size={26} /></span>
        <div>
          <div className="font-display text-lg font-extrabold leading-none">ANTIK</div>
          <div className="mt-1 text-[11px] font-semibold text-[#9FB8A8]">Panel Pengelola</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate} data-testid={`admin-nav-${n.id}`}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? "bg-white text-[#143D2A]" : "text-[#CFE3D6] hover:bg-white/10 hover:text-white"}`}>
            <n.icon size={18} strokeWidth={2} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-2xl bg-white/5 p-4">
        <div className="text-sm font-bold">{user?.name}</div>
        <div className="text-xs text-[#9FB8A8]">{user?.phone}</div>
        <button data-testid="admin-logout-button" onClick={() => { logout(); nav("/admin", { replace: true }); }}
          className="mt-3 flex items-center gap-2 text-xs font-bold text-[#F3C9A8] hover:text-white">
          <LogOut size={14} /> Keluar
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#F3F5EF] text-[#17251E]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><SideNav /></aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#DCE2D8] bg-[#F3F5EF]/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1F5C3F]"><AntikMark size={22} /></span>
          <span className="font-display font-extrabold">ANTIK · Pengelola</span>
        </div>
        <button data-testid="admin-mobile-menu" onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#DCE2D8] bg-white">
          <Menu size={20} />
        </button>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-none p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigasi panel pengelola</SheetDescription>
          <SideNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
