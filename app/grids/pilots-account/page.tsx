"use client";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import ExcelGrid from "@/app/components/ExcelGrid";

export default function PilotsAccountPage() {
  return (
    <div className="min-h-screen">
      <ExecutiveHeader 
        title="Pilots Account"
        subtitle="Pilot accounts with balance, tariffs and transaction history • Excel-Style Editing"
      />
      
      <ExecutiveNav />

      <div className="mt-8">
        <ExcelGrid 
          gridKey="pilots_account"
          initialData={[
            ["Código", "Nombre", "Email", "Saldo Cuenta", "Tarifa/Hora", "Total Vuelos", "Total Horas", "Total Gastado", "Último Vuelo"],
            ["", "", "", "0", "=rate", "", "", "", ""]
          ]}
          initialNamedExpressions={[
            { name: "rate", expression: "185000" }
          ]}
        />
      </div>
    </div>
  );
}
