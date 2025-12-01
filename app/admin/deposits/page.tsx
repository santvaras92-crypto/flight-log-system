"use client";
import { useState, useEffect } from "react";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import ExcelGrid from "@/app/components/ExcelGrid";

export default function DepositsPage() {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [pilots, setPilots] = useState<any[]>([]);

  useEffect(() => {
    fetchDeposits();
    fetchPilots();
  }, []);

  async function fetchDeposits() {
    const res = await fetch("/api/deposits");
    const json = await res.json();
    setDeposits(json.deposits ?? []);
  }

  async function fetchPilots() {
    const res = await fetch("/api/pilots/list");
    const json = await res.json();
    setPilots(json.pilots ?? []);
  }

  const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);

  // Prepare data for Excel grid
  const gridData = [
    ["ID", "Fecha", "Cliente", "Código", "Monto", "Descripción", "Referencia"],
    ...deposits.map(d => {
      const pilot = pilots.find(p => p.id === d.userId);
      return [
        d.id,
        new Date(d.date).toLocaleDateString(),
        pilot?.nombre || "-",
        pilot?.codigo || "-",
        d.amount,
        d.description || "",
        d.reference || ""
      ];
    })
  ];

  return (
    <div className="min-h-screen">
      <ExecutiveHeader 
        title="Gestión de Depósitos"
        subtitle="Financial Operations • Client Deposits • Excel-Style Editing"
      />
      
      <ExecutiveNav />

      <div className="p-8">
      <div className="mt-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Depositado</div>
                <div className="text-3xl font-bold text-navy-950">${totalDeposits.toLocaleString('es-CL')}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg text-3xl">
                💰
              </div>
            </div>
            <div className="mt-4 h-1 bg-gradient-to-r from-green-500 to-green-300 rounded-full"></div>
          </div>
          
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Transacciones</div>
                <div className="text-3xl font-bold text-navy-950">{deposits.length}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg text-3xl">
                📊
              </div>
            </div>
            <div className="mt-4 h-1 bg-gradient-to-r from-blue-500 to-blue-300 rounded-full"></div>
          </div>
          
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Clientes Activos</div>
                <div className="text-3xl font-bold text-navy-950">{new Set(deposits.map(d => d.userId)).size}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg text-3xl">
                👥
              </div>
            </div>
            <div className="mt-4 h-1 bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"></div>
          </div>
        </div>

        {/* Excel Grid */}
        <ExcelGrid 
          gridKey="deposits"
          initialData={gridData}
        />
      </div>
    </div>
  );
}
