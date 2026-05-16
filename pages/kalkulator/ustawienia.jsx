import React from "react";
import Navbar from "@/components/Navbar";
import Leftside from "@/components/Leftside";
import UstawieniaKalkulatora from "@/components/kalkulator/UstawieniaKalkulatora";
import withAuth from "@/utils/withAuth";

const UstawieniaKalkulatoraPage = () => {
  return (
    <div className="admin-global-page-layout">
      <Navbar />
      <div className="admin-layout-content">
        <Leftside />
        <main className="admin-main-area">
          <UstawieniaKalkulatora />
        </main>
      </div>
    </div>
  );
};

export default withAuth(UstawieniaKalkulatoraPage, ["Administrator"]);
