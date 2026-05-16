import React from "react";
import MainLayout from "@/components/layouts/MainLayout";
import SunFeeKalkulator from "@/components/SunFeeKalkulator";
import withAuth from "@/utils/withAuth";

function KalkulatorPage() {
  return (
    <MainLayout>
      <SunFeeKalkulator />
    </MainLayout>
  );
}

export default withAuth(KalkulatorPage, ["Handlowiec", "Administrator"]);
