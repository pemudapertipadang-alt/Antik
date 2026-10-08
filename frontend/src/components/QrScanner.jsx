import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, CameraOff } from "lucide-react";
import { C } from "@/components/ui-kit";

export default function QrScanner({ onResult, onClose }) {
  const regionId = useRef("qr-reader-" + Math.random().toString(36).slice(2)).current;
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText) => {
          if (handledRef.current) return;
          handledRef.current = true;
          const val = (decodedText || "").trim().toUpperCase();
          onResult(val);
        },
        () => {}
      )
      .catch(() => {
        setError("Tidak bisa membuka kamera. Pastikan izin kamera diberikan, atau masukkan kode anggota secara manual.");
      });

    return () => {
      const s = scannerRef.current;
      if (!s) return;
      try {
        if (s.isScanning) {
          s.stop().then(() => s.clear()).catch(() => {});
        } else {
          s.clear();
        }
      } catch {
        /* ignore */
      }
    };
  }, [regionId, onResult]);

  return (
    <div
      data-testid="qr-scanner-overlay"
      style={{
        position: "absolute", inset: 0, zIndex: 60, background: "rgba(10,16,13,0.96)",
        display: "flex", flexDirection: "column", color: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
        <div className="font-display" style={{ fontWeight: 800, fontSize: 18 }}>Pindai QR Warga</div>
        <button data-testid="qr-scanner-close" onClick={onClose}
          style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid #3A4A42", background: "transparent",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", gap: 16 }}>
        {!error ? (
          <>
            <div id={regionId} style={{ width: "100%", maxWidth: 300, borderRadius: 20, overflow: "hidden", background: "#000" }} />
            <p style={{ margin: 0, textAlign: "center", fontSize: 13, color: "#B9C7BF", lineHeight: 1.5 }}>
              Arahkan kamera ke QR anggota di layar aplikasi warga. Kode akan terbaca otomatis.
            </p>
          </>
        ) : (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <CameraOff size={40} color="#B9C7BF" />
            <p data-testid="qr-scanner-error" style={{ margin: 0, fontSize: 14, color: "#DCE2D8", lineHeight: 1.6, maxWidth: 280 }}>{error}</p>
            <button data-testid="qr-scanner-manual" onClick={onClose}
              style={{ height: 48, padding: "0 20px", borderRadius: 14, border: "none", background: C.green,
                color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Masukkan manual
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
