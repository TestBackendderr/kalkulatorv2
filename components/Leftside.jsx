import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";

const Leftside = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const router = useRouter();

  const menuItems = useMemo(() => {
    const base = [
      { name: "Kalkulator", path: "/kalkulator", icon: "🧮" },
      { name: "Kalkulacje", path: "/kalkulator/wyceny", icon: "📋" },
    ];

    if (user?.role === "Administrator") {
      return [
        ...base,
        { name: "Użytkownicy", path: "/uzytkownicy", icon: "👤" },
        { name: "Ustawienia kalkulatora", path: "/kalkulator/ustawienia", icon: "⚙️" },
      ];
    }

    return base;
  }, [user?.role]);

  return (
    <aside className={`leftside ${isOpen ? "open" : ""}`}>
      <nav className="menu">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`menu-item${router.pathname === item.path ? " menu-item--active" : ""}`}
            onClick={onClose}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-text">{item.name}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Leftside;
