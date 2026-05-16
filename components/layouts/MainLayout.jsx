import React from "react";
import Navbar from "../Navbar";
import Leftside from "../Leftside";

export default function MainLayout({ children }) {
  return (
    <div className="main-layout">
      <Navbar />
      <div className="content">
        <Leftside />
        <main>{children}</main>
      </div>
    </div>
  );
}
