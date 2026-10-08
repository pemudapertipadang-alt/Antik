import { NavLink } from "react-router-dom";
import { Home, Leaf, Truck, Ticket } from "lucide-react";
import { C } from "./ui-kit";

const items = [
  { to: "/beranda", label: "Beranda", icon: Home, testid: "nav-beranda" },
  { to: "/misi", label: "Misi", icon: Leaf, testid: "nav-misi" },
  { to: "/jemput", label: "Jemput", icon: Truck, testid: "nav-jemput" },
  { to: "/tukar", label: "Tukar", icon: Ticket, testid: "nav-tukar" },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Navigasi utama"
      style={{
        display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))",
        background: "#fff", borderTop: `1px solid ${C.line}`, padding: "6px 8px 12px",
        flexShrink: 0,
      }}
    >
      {items.map(({ to, label, icon: Icon, testid }) => (
        <NavLink key={to} to={to} data-testid={testid}
          style={({ isActive }) => ({
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 3, minHeight: 52, textDecoration: "none",
            color: isActive ? C.green : C.muted, fontSize: 12,
            fontWeight: isActive ? 700 : 600,
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 56, height: 30, borderRadius: 999,
                background: isActive ? C.greenSoft : "transparent",
                transition: "background-color 0.2s ease",
              }}>
                <Icon size={22} strokeWidth={1.9} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
