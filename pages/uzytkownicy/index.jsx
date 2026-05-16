import React from "react";
import Navbar from "@/components/Navbar";
import Leftside from "@/components/Leftside";
import UzytkownicyPanel from "@/components/uzytkownicy/UzytkownicyPanel";
import withAuth from "@/utils/withAuth";

function UzytkownicyPage() {
  return (
    <div className="admin-global-page-layout">
      <Navbar />
      <div className="admin-layout-content">
        <Leftside />
        <main className="admin-main-area">
          <UzytkownicyPanel />
        </main>
      </div>
    </div>
  );
}

export default withAuth(UzytkownicyPage, ["Administrator"]);
