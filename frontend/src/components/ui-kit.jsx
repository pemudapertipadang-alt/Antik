// 1 poin = Rp1 — helper to show the rupiah equivalent of points
export const POINT_RUPIAH = 1;
export const rp = (points) => "Rp" + new Intl.NumberFormat("id-ID").format(Math.round((points || 0) * POINT_RUPIAH));

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

// ANTIK mark: a circular-economy recycling loop (two arcs + arrowheads)
// wrapping a savings coin with a slot — "menabung sampah jadi nilai".
export function AntikMark({ size = 24, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* circular economy loop */}
      <path d="M10 20A15 15 0 0 1 34 11.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M38 28A15 15 0 0 1 14 36.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
      {/* arrowheads */}
      <path d="M30 8.5l4.5 3-3 4.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 39.5l-4.5-3 3-4.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* savings coin */}
      <circle cx="24" cy="24" r="7.3" fill={color} />
      {/* coin slot (tabungan) */}
      <rect x="20.3" y="22.8" width="7.4" height="2.4" rx="1.2" fill={C.green} />
    </svg>
  );
}

export function Logo({ box = 40, radius = 12, size = 26 }) {
  return (
    <div
      style={{
        width: box, height: box, borderRadius: radius, background: C.green,
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <AntikMark size={size} color="#fff" />
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
