import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf, Package, Trash2, MessageCircle, ArrowLeft } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { C, Logo, PhoneShell } from "@/components/ui-kit";
import { toast } from "sonner";

function Field({ label, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{label}</span>
      <input
        {...props}
        style={{
          height: 52, borderRadius: 14, border: `1px solid ${C.line}`,
          background: "#fff", padding: "0 14px", fontSize: 16, color: C.ink,
          fontFamily: "inherit", outline: "none",
        }}
      />
    </label>
  );
}

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [mode, setMode] = useState("login");      // login | register | petugas
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [rt, setRt] = useState("03");
  const [rw, setRw] = useState("05");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!phone || !pin) return toast.error("Isi nomor HP dan PIN");
    setLoading(true);
    try {
      if (mode === "register") {
        if (!name) { setLoading(false); return toast.error("Isi nama lengkap"); }
        const { data } = await api.post("/auth/register", { name, phone, pin, rt, rw });
        login(data.token, data.user);
        toast.success("Akun berhasil dibuat");
        nav("/beranda");
      } else {
        const asPetugas = mode === "petugas";
        const { data } = await api.post("/auth/login", { phone, pin, as_petugas: asPetugas });
        login(data.token, data.user);
        nav(asPetugas ? "/petugas" : "/beranda");
      }
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setLoading(false);
    }
  };

  const isPetugas = mode === "petugas";

  return (
    <PhoneShell>
      <div className="pi-scroll" style={{
        flex: 1, overflowY: "auto", display: "flex", flexDirection: "column",
        gap: 22, padding: "32px 24px 28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo />
          <div className="font-display" style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.5px" }}>
            PilahIn
          </div>
        </div>

        {mode === "login" && (
          <div className="pi-fade" style={{
            background: C.greenSoft, borderRadius: 28, height: 236, padding: "24px 20px 18px",
            display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 18,
          }}>
            <Bin color={C.green} label="Organik" h={136} icon={<Leaf size={30} strokeWidth={1.9} color="#fff" />} top={C.greenDark} />
            <Bin color={C.blue} label="Anorganik" h={112} icon={<Package size={30} strokeWidth={1.9} color="#fff" />} top="#163C6A" />
            <Bin color="#5B6560" label="Residu" h={84} icon={<Trash2 size={28} strokeWidth={1.9} color="#fff" />} top="#3F4743" />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="font-display" style={{ margin: 0, fontWeight: 800, fontSize: 32, lineHeight: 1.08, letterSpacing: "-0.8px" }}>
            {mode === "register" ? "Buat akun warga" : isPetugas ? "Masuk petugas" : <>Sampah dipilah,<br />poin bertambah.</>}
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: C.muted }}>
            {isPetugas
              ? "Masuk untuk menimbang & mencatat setoran warga."
              : "Pilah dari rumah, dijemput sesuai jadwal, diolah jadi pupuk organik — dan setiap kilonya jadi poin untukmu."}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <>
              <Field label="Nama lengkap" value={name} data-testid="reg-name-input"
                onChange={(e) => setName(e.target.value)} placeholder="Bu Ratna" />
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><Field label="RT" value={rt} data-testid="reg-rt-input" onChange={(e) => setRt(e.target.value)} /></div>
                <div style={{ flex: 1 }}><Field label="RW" value={rw} data-testid="reg-rw-input" onChange={(e) => setRw(e.target.value)} /></div>
              </div>
            </>
          )}
          <Field label="Nomor HP" value={phone} data-testid="login-phone-input" inputMode="numeric"
            onChange={(e) => setPhone(e.target.value)} placeholder="0812xxxxxxx" />
          <Field label="PIN" type="password" value={pin} data-testid="login-pin-input" inputMode="numeric"
            onChange={(e) => setPin(e.target.value)} placeholder="min. 4 digit" />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button data-testid="login-submit-button" onClick={submit} disabled={loading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              height: 56, borderRadius: 16, background: isPetugas ? C.dark : C.greenStrong,
              color: "#fff", border: "none", fontWeight: 700, fontSize: 16, cursor: "pointer",
              opacity: loading ? 0.7 : 1, transition: "transform 0.15s ease, opacity 0.2s ease",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {!isPetugas && mode === "login" && <MessageCircle size={22} strokeWidth={1.9} />}
            {loading ? "Memproses..." : mode === "register" ? "Daftar & masuk" : isPetugas ? "Masuk sebagai petugas" : "Masuk dengan WhatsApp"}
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {mode === "login" && (
              <>
                <button data-testid="to-register-button" onClick={() => setMode("register")}
                  style={linkBtn}>Daftar warga baru</button>
                <button data-testid="to-petugas-button" onClick={() => { setMode("petugas"); }}
                  style={linkBtn}>Masuk sebagai petugas</button>
              </>
            )}
            {mode !== "login" && (
              <button data-testid="back-to-login-button" onClick={() => setMode("login")}
                style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 6 }}>
                <ArrowLeft size={16} /> Kembali masuk warga
              </button>
            )}
          </div>

          {mode === "login" && (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: C.muted }}>
              Coba cepat — Warga: <b>081200000002</b> / PIN <b>123456</b>. Petugas: <b>081200000001</b> / PIN <b>123456</b>.
            </p>
          )}
        </div>
      </div>
    </PhoneShell>
  );
}

const linkBtn = {
  background: "none", border: "none", padding: "10px 0", minHeight: 44,
  fontSize: 14, fontWeight: 600, color: C.green, cursor: "pointer",
};

function Bin({ color, top, label, h, icon }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ width: 84, height: 10, borderRadius: 6, background: top }} />
      <div style={{
        width: 76, height: h, borderRadius: "6px 6px 18px 18px", background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
    </div>
  );
}
