import React, { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Leftside from "./Leftside";

const getRoleDisplayName = (role) => {
  const roleMap = {
    Administrator: "Administrator",
    Handlowiec: "Dział Handlowy",
    Biuro_Obslugi: "Biuro Obsługi Klienta",
    Dzial_Realizacji: "Dział Realizacji",
    Dyrektor: "Dyrektor",
    Dzial_Przetargow: "Dział Przetargów",
    Dzial_CC: "Dział CC",
    Dzial_HR: "Dział HR",
    Dzial_Marketing: "Dział Marketingu",
  };

  return (
    roleMap[role] ||
    role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

const Navbar = () => {
  const { user, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return null;

  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <button
            type="button"
            className="burger"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Menu"
          >
            <Menu size={24} />
          </button>
          <div className="navbar-logo">
            <Link href="/kalkulator">Kalkulator v2</Link>
          </div>
        </div>

        <p className="navbar-user">
          {user ? getRoleDisplayName(user.role) : "Nie zalogowano"}
        </p>

        <div className="navbar-actions">
          {user && (
            <button type="button" className="logout-btn" onClick={logout}>
              Wyloguj
            </button>
          )}
        </div>
      </nav>

      <Leftside isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
};

export default Navbar;
