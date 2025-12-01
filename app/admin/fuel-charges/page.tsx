"use client";
import { useState, useEffect } from "react";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import ExcelGrid from "@/app/components/ExcelGrid";

export default function FuelChargesPage() {
  const [charges, setCharges] = useState<any[]>([]);
  const [pilots, setPilots] = useState<any[]>([]);

  useEffect(() => {
    fetchCharges();
    fetchPilots();
  }, []);

  async function fetchCharges() {
    const res = await fetch("/api/fuel-charges");
    const json = await res.json();
    setCharges(json.fuelCharges ?? []);
  }

  async function fetchPilots() {
    const res = await fetch("/api/pilots/list");
    const json = await res.json();
    setPilots(json.pilots ?? []);
  }

  const totalSpent = charges.reduce((sum, c) => sum + c.totalAmount, 0);
  const totalLiters = charges.reduce((sum, c) => sum + c.liters, 0);

  // Prepare data for Excel grid
  const gridData = [
    ["ID", "Fecha", "Cliente", "Código", "Litros", "Precio/Litro", "Total", "Ubicación", "Referencia"],
    ...charges.map(c => {
      const pilot = pilots.find(p => p.id === c.userId);
      return [
        c.id,
        new Date(c.date).toLocaleDateString(),
        pilot?.nombre || "-",
        pilot?.codigo || "-",
        c.liters,
        c.pricePerLiter,
        c.totalAmount,
        c.location || "",
        c.reference || ""
      ];
    })
  ];

  return (
    <div className="min-h-screen">
      <ExecutiveHeader 
        title="Gestión de Combustible"
        subtitle="Fuel Operations • Cost Tracking • Excel-Style Editing"
      />
      
      <ExecutiveNav />

      <div className="mt-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Litros Totales</div>
                <div className="text-3xl font-bold text-navy-950">{totalLiters.toFixed(1)}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg text-3xl">
                ⛽
              </div>
            </div>
            <div className="mt-4 h-1 bg-gradient-to-r from-orange-500 to-orange-300 rounded-full"></div>
          </div>
          
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Gastado</div>
                <div className="text-3xl font-bold text-navy-950">${totalSpent.toLocaleString('es-CL')}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg text-3xl">
                💸
              </div>
            </div>
            <div className="mt-4 h-1 bg-gradient-to-r from-red-500 to-red-300 rounded-full"></div>
          </div>
          
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Transacciones</div>
                <div className="text-3xl font-bold text-navy-950">{charges.length}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg text-3xl">
                📋
              </div>
            </div>
            <div className="mt-4 h-1 bg-gradient-to-r from-blue-500 to-blue-300 rounded-full"></div>
          </div>
        </div>

        {/* Excel Grid */}
        <ExcelGrid 
          gridKey="fuel_charges"
          initialData={gridData}
        />
      </div>
    </div>
  );
}
