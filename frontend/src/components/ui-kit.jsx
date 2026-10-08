import { Leaf } from "lucide-react";

export const C = {
  bg: "#F3F5EF",
  ink: "#17251E",
  muted: "#4B5A52",
  green: "#1F5C3F",
  greenStrong: "#146C43",
  greenDark: "#143D2A",
  greenSoft: "#E3EFE6",
  green2: "#2C7350",
  blue: "#1E4F8A",
  amber: "#9A4A0B",
  amber2: "#B45309",
  line: "#DCE2D8",
  dark: "#17251E",
};

export function Logo({ size = 22, box = 40, radius = 12 }) {
  return (
    <div
      style={{
        width: box, height: box, borderRadius: radius, background: C.green,
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <Leaf size={size} strokeWidth={1.9} />
    </div>
  );
}

// Mobile 390px app shell, centered on larger screens with device styling.
export function PhoneShell({ children, dark = false }) {
  return (
    <div
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "0" }}
      className="sm:py-8"
    >
      <div
        className="pi-shell"
        style={{
          width: "100%",
          maxWidth: 420,
          height: "100vh",
          background: dark ? C.dark : C.bg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 24px 60px rgba(23,37,30,0.18)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
