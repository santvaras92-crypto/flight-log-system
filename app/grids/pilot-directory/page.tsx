import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import ExcelGrid from "@/app/components/ExcelGrid";

export default function PilotDirectoryGridPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50">
      <ExecutiveHeader 
        title="Pilot Directory"
        subtitle="Complete Pilot Database • Excel-Style Editing"
      />
      
      <ExecutiveNav />

      <div className="p-8">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Directorio Completo de Pilotos</h2>
          <p className="text-sm text-gray-600">
            Gestione información de pilotos directamente en la tabla. Las modificaciones se guardan automáticamente.
          </p>
        </div>
        
        <ExcelGrid 
          gridKey="pilot_directory"
          initialData={[
            ["Código","Nombre","Email","Teléfono","Estado","Observaciones"],
          ]}
          initialNamedExpressions={[]}
        />
      </div>
    </div>
  );
}
