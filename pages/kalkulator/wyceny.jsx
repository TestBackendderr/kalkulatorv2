import React from "react";
import Navbar from "@/components/Navbar";
import Leftside from "@/components/Leftside";
import ListaWycenKalkulator from "@/components/kalkulator/ListaWycenKalkulator";
import withAuth from "@/utils/withAuth";

const WycenyKalkulatoraPage = () => {
  return (
    <div className="admin-global-page-layout">
      <Navbar />
      <div className="admin-layout-content">
        <Leftside />
        <main className="admin-main-area">
          <ListaWycenKalkulator />
        </main>
      </div>
    </div>
  );
};

export default withAuth(WycenyKalkulatoraPage, ["Administrator", "Handlowiec"]);
