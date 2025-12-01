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
            ["Matrícula", "Componente", "Horas Acumuladas", "Límite TBO", "Horas Restantes TBO", "% Usado", "Tipo Inspección", "Última Inspección (Tach)", "Intervalo", "Próxima Inspección", "Hrs a Próxima", "Estado"],
            ["CC-AQI", "AIRFRAME", "2722.8", "30000", "=D2-C2", "=(C2/D2)*100", "100 Hrs", "492.8", "100", "=H2+I2", "=J2-C2", "=IF(F2>90,\"CRÍTICO\",IF(F2>75,\"ADVERTENCIA\",\"OK\"))"],
            ["CC-AQI", "ENGINE", "569.6", "2000", "=D3-C3", "=(C3/D3)*100", "Cambio Aceite", "540.1", "50", "=H3+I3", "=J3-C3", "=IF(F3>90,\"CRÍTICO\",IF(F3>75,\"ADVERTENCIA\",\"OK\"))"],
            ["CC-AQI", "PROPELLER", "1899.0", "2000", "=D4-C4", "=(C4/D4)*100", "100 Hrs", "492.8", "100", "=H4+I4", "=J4-C4", "=IF(F4>90,\"CRÍTICO\",IF(F4>75,\"ADVERTENCIA\",\"OK\"))"]
          ]}
        />
      </div>
    </div>
  );
}
