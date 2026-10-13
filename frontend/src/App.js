import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Beranda from "@/pages/Beranda";
import Misi from "@/pages/Misi";
import Jemput from "@/pages/Jemput";
import TukarPoin from "@/pages/TukarPoin";
import Petugas from "@/pages/Petugas";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminLayout from "@/pages/admin/AdminLayout";
import Ringkasan from "@/pages/admin/Ringkasan";
import AdminWarga from "@/pages/admin/Warga";
import AdminPetugas from "@/pages/admin/Petugas";
import Katalog from "@/pages/admin/Katalog";
import Jadwal from "@/pages/admin/Jadwal";
import Setoran from "@/pages/admin/Setoran";
import Penukaran from "@/pages/admin/Penukaran";
import Tarif from "@/pages/admin/Tarif";

const homeFor = (role) => (role === "admin" ? "/admin" : role === "petugas" ? "/petugas" : "/beranda");

function Splash() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F3F5EF", color: "#1F5C3F", fontWeight: 800, fontSize: 18 }}>ANTIK…</div>
  );
}

function Protected({ children, role }) {
  const { user, ready } = useAuth();
  if (!ready || user === null) return <Splash />;
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return children;
}

function AdminGate() {
  const { user, ready } = useAuth();
  if (!ready || user === null) return <Splash />;
  if (!user || user.role !== "admin") return <AdminLogin />;
  return <AdminLayout />;
}

function Landing() {
  const { user, ready } = useAuth();
  if (!ready || user === null) return <Splash />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return <Login />;
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/beranda" element={<Protected role="warga"><Beranda /></Protected>} />
          <Route path="/misi" element={<Protected role="warga"><Misi /></Protected>} />
          <Route path="/jemput" element={<Protected role="warga"><Jemput /></Protected>} />
          <Route path="/tukar" element={<Protected role="warga"><TukarPoin /></Protected>} />
          <Route path="/petugas" element={<Protected role="petugas"><Petugas /></Protected>} />
          <Route path="/admin" element={<AdminGate />}>
            <Route index element={<Ringkasan />} />
            <Route path="warga" element={<AdminWarga />} />
            <Route path="petugas" element={<AdminPetugas />} />
            <Route path="katalog" element={<Katalog />} />
            <Route path="jadwal" element={<Jadwal />} />
            <Route path="setoran" element={<Setoran />} />
            <Route path="penukaran" element={<Penukaran />} />
            <Route path="tarif" element={<Tarif />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
