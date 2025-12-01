import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import ExcelGrid from "@/app/components/ExcelGrid";

export default function FlightEntriesGridPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50">
      <ExecutiveHeader 
        title="Flight Log Entries"
        subtitle="Complete Flight Operations Database • Excel-Style Editing"
      />
      
      <ExecutiveNav />

      <div className="p-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Registro Completo de Vuelos</h2>
          <p className="text-sm text-gray-600">
            Edite directamente en la tabla. Las fórmulas se calculan automáticamente. Use clic derecho para insertar/eliminar filas y columnas.
          </p>
        </div>
        
        <ExcelGrid 
          gridKey="flight_entries"
          initialData={[
            ["Fecha","Hobbs Ini","Hobbs Fin","Δ Hobbs","Tach Ini","Tach Fin","Δ Tach","Block","Cliente","Ruta","Costo Avión","Costo Instructor","Obs"],
          ]}
          initialNamedExpressions={[
            { name: "rate", expression: "185000" },
            { name: "instrRate", expression: "30000" },
          ]}
        />
      </div>
    </div>
  );
}
