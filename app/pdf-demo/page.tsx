'use client'

import React from 'react'
import { generateAccountStatementPDF } from '@/lib/generate-account-pdf'

export default function PdfDemoPage() {
  const handleGenerate = async () => {
    const mock = {
      clientCode: 'DEMO123',
      clientName: 'John Doe',
      flights: [
        { id: 1, fecha: new Date().toISOString().slice(0, 10), diff_hobbs: 1.2, costo: 85000, detalle: 'Training circuit', piloto_raw: 'John Doe' },
        { id: 2, fecha: new Date().toISOString().slice(0, 10), diff_hobbs: 0.8, costo: 56000, detalle: 'Navigation practice', piloto_raw: 'John Doe' },
      ],
      deposits: [
        { fecha: new Date().toISOString().slice(0, 10), descripcion: 'Top-up', monto: 200000 },
      ],
      fuelCredits: [
        { fecha: new Date().toISOString().slice(0, 10), descripcion: 'Fuel credit', monto: 30000 },
      ],
      totalFlights: 2,
      totalHours: 2.0,
      totalSpent: 141000,
      totalDeposits: 200000,
      totalFuel: 30000,
      balance: 200000 - 141000 - 30000,
      dateRange: { start: new Date().toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) },
    }

    await generateAccountStatementPDF(mock)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-2xl font-semibold">PDF Demo</h1>
        <p className="text-sm text-gray-600">Genera un PDF de ejemplo con el nuevo header y footer.</p>
        <button
          onClick={handleGenerate}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Generar PDF de ejemplo
        </button>
      </div>
    </div>
  )
}
