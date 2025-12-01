"use client";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import ExcelGrid from "@/app/components/ExcelGrid";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen">
      <ExecutiveHeader 
        title="Maintenance Tracking"
        subtitle="Aircraft components, hours tracking and TBO limits • Excel-Style Editing"
      />
      
      <ExecutiveNav />

      <div className="mt-8">
        <ExcelGrid 
          gridKey="maintenance"
          initialData={[
            ["Matrícula", "Componente", "Horas Acumuladas", "Límite TBO", "Horas Restantes TBO", "% Usado", "Tipo Inspección", "Intervalo (hrs)", "Última Inspección (Tach)", "Horas desde última", "Próxima Inspección (hrs)", "Estado"],
            ["CC-AQI", "AIRFRAME", "2722.8", "30000", "=D2-C2", "=(C2/D2)*100", "100hrs", "100", "492.8", "=C2-I2", "=H2-(C2-I2)", "=IF(F2>90,\"CRÍTICO\",IF(F2>75,\"ADVERTENCIA\",\"OK\"))"],
            ["CC-AQI", "ENGINE", "569.6", "2000", "=D3-C3", "=(C3/D3)*100", "Cambio Aceite", "50", "540.1", "=C3-I3", "=H3-(C3-I3)", "=IF(F3>90,\"CRÍTICO\",IF(F3>75,\"ADVERTENCIA\",\"OK\"))"],
            ["CC-AQI", "PROPELLER", "1899.0", "2000", "=D4-C4", "=(C4/D4)*100", "100hrs", "100", "492.8", "=C4-I4", "=H4-(C4-I4)", "=IF(F4>90,\"CRÍTICO\",IF(F4>75,\"ADVERTENCIA\",\"OK\"))"]
          ]}
        />
      </div>
    </div>
  );
}
