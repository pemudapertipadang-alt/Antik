import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Beranda from "@/pages/Beranda";
import Misi from "@/pages/Misi";
import Jemput from "@/pages/Jemput";
import TukarPoin from "@/pages/TukarPoin";
import Petugas from "@/pages/Petugas";

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
    return <Navigate to={user.role === "petugas" ? "/petugas" : "/beranda"} replace />;
  }
  return children;
}

function Landing() {
  const { user, ready } = useAuth();
  if (!ready || user === null) return <Splash />;
  if (user) return <Navigate to={user.role === "petugas" ? "/petugas" : "/beranda"} replace />;
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
