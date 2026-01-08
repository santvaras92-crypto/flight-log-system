import ExcelJS from 'exceljs';
import { prisma } from './prisma';
import fs from 'fs';
import path from 'path';

interface BackupData {
  users: any[];
  flights: any[];
  deposits: any[];
  depositsDetailsByCode?: Record<string, { fecha: string; descripcion: string; monto: number }[]>;
  csvPilotNames?: Record<string, string>;
  fuelLogs: any[];
  transactions: any[];
  submissions: any[];
  aircraft: any[];
  components: any[];
}

/**
 * Generate a complete Excel backup with all historical data
 * Returns Buffer of the Excel file
 */
export async function generateCompleteExcelBackup(): Promise<Buffer> {
  console.log('[Excel Backup] Starting complete backup generation...');
  
  // Fetch all data from database
  const data = await fetchAllData();
  
  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CC-AQI Flight Log System';
  workbook.created = new Date();
  
  // Generate all sheets
  await createSummarySheet(workbook, data);
  await createFlightsSheet(workbook, data);
  await createDepositsSheet(workbook, data);
  await createFuelSheet(workbook, data);
  await createPilotsSheet(workbook, data);
  await createAircraftSheet(workbook, data);
  await createTransactionsSheet(workbook, data);
  await createPendingSheet(workbook, data);
  
  console.log('[Excel Backup] All sheets created, generating buffer...');
  
  // Generate buffer
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const bufferSize = buffer.byteLength;
  console.log(`[Excel Backup] Complete! Buffer size: ${(bufferSize / 1024 / 1024).toFixed(2)} MB`);
  
  return buffer;
}

/**
 * Fetch all data from database and CSVs
 */
async function fetchAllData(): Promise<BackupData> {
  console.log('[Excel Backup] Fetching data from database...');
  
  const [users, flights, deposits, fuelLogs, transactions, submissions, aircraft, components] = await Promise.all([
    prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: {
        Flight: { select: { id: true } },
        Deposit: { select: { id: true } },
        FuelLog: { select: { id: true } }
      }
    }),
    prisma.flight.findMany({
      orderBy: { fecha: 'asc' },
      include: {
        User: { select: { nombre: true, codigo: true } },
        Aircraft: { select: { matricula: true, modelo: true } }
      }
    }),
    prisma.deposit.findMany({
      orderBy: { fecha: 'asc' },
      include: {
        User: { select: { nombre: true, codigo: true } }
      }
    }),
    prisma.fuelLog.findMany({
      orderBy: { fecha: 'asc' },
      include: {
        User: { select: { nombre: true, codigo: true } }
      }
    }),
    prisma.transaction.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        User: { select: { nombre: true, codigo: true } },
        Flight: { select: { id: true, fecha: true } }
      }
    }),
    prisma.flightSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        User: { select: { nombre: true, codigo: true } },
        ImageLog: true,
        Aircraft: { select: { matricula: true, modelo: true } }
      }
    }),
    prisma.aircraft.findMany({
      orderBy: { matricula: 'asc' },
      include: {
        Component: true,
        Flight: { select: { id: true, fecha: true, hobbs_fin: true, tach_fin: true } },
        FlightSubmission: { select: { id: true, createdAt: true, estado: true } }
      }
    }),
    prisma.component.findMany({
      orderBy: { id: 'asc' },
      include: {
        Aircraft: { select: { matricula: true, modelo: true } }
      }
    })
  ]);
  
  // Read CSV deposits
  const csvDeposits = await readDepositCSV();
  const allDeposits = [...deposits, ...csvDeposits];
  
  // Build depositsDetailsByCode (same logic as dashboard)
  const depositsDetailsByCode: Record<string, { fecha: string; descripcion: string; monto: number }[]> = {};
  const csvPilotNames: Record<string, string> = {};
  
  // Read pilot names from CSV
  try {
    const pilotsPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
    if (fs.existsSync(pilotsPath)) {
      const content = fs.readFileSync(pilotsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(';');
        const code = (parts[0] || '').trim().toUpperCase();
        const name = (parts[1] || '').trim();
        if (code && name) csvPilotNames[code] = name;
      }
    }
  } catch (err) {
    console.error('[Excel Backup] Error reading pilot names CSV:', err);
  }
  
  // Build depositsDetailsByCode from CSV
  try {
    const depositsPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
    if (fs.existsSync(depositsPath)) {
      const content = fs.readFileSync(depositsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(';');
        const fecha = (parts[0] || '').trim();
        const descripcion = (parts[1] || '').trim();
        const montoStr = (parts[2] || '').trim();
        const code = (parts[3] || '').trim().toUpperCase();
        if (!code) continue;
        const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
        const monto = parseFloat(cleaned) || 0;
        if (!depositsDetailsByCode[code]) depositsDetailsByCode[code] = [];
        depositsDetailsByCode[code].push({ fecha, descripcion, monto });
      }
    }
  } catch (err) {
    console.error('[Excel Backup] Error building depositsDetailsByCode from CSV:', err);
  }
  
  // Add database deposits to depositsDetailsByCode
  deposits.forEach(dep => {
    const code = dep.User?.codigo?.toUpperCase();
    if (code) {
      if (!depositsDetailsByCode[code]) depositsDetailsByCode[code] = [];
      const monto = typeof dep.monto === 'number' ? dep.monto : parseFloat(dep.monto.toString());
      depositsDetailsByCode[code].push({ 
        fecha: dep.fecha.toISOString().split('T')[0], 
        descripcion: dep.detalle || 'Depósito (BD)', 
        monto 
      });
    }
  });
  
  // Read CSV fuel
  const csvFuel = await readFuelCSV();
  const allFuel = [...fuelLogs, ...csvFuel];
  
  console.log(`[Excel Backup] Data fetched: ${flights.length} flights, ${allDeposits.length} deposits, ${allFuel.length} fuel logs`);
  
  return {
    users,
    flights,
    deposits: allDeposits,
    depositsDetailsByCode,
    csvPilotNames,
    fuelLogs: allFuel,
    transactions,
    submissions,
    aircraft,
    components
  };
}

/**
 * Read deposits from CSV
 */
async function readDepositCSV(): Promise<any[]> {
  try {
    const csvPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
    if (!fs.existsSync(csvPath)) return [];
    
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const deposits: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length < 4) continue;
      
      const fecha = (parts[0] || '').trim();
      const descripcion = (parts[1] || '').trim();
      const montoStr = (parts[2] || '').trim();
      const codigo = (parts[3] || '').trim().toUpperCase();
      
      const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
      const monto = parseFloat(cleaned) || 0;
      
      deposits.push({
        id: null,
        fecha: new Date(fecha.split('-').reverse().join('-')),
        monto,
        detalle: descripcion,
        estado: 'APROBADO',
        user: { codigo, nombre: codigo },
        comprobante: null,
        source: 'CSV'
      });
    }
    
    return deposits;
  } catch (e) {
    console.error('[Excel Backup] Error reading deposit CSV:', e);
    return [];
  }
}

/**
 * Read fuel from CSV
 */
async function readFuelCSV(): Promise<any[]> {
  try {
    const csvPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
    if (!fs.existsSync(csvPath)) return [];
    
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const fuelLogs: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length < 4) continue;
      
      const fecha = (parts[0] || '').trim();          // Fecha
      const codigo = (parts[1] || '').trim().toUpperCase();  // Cuenta (código)
      const litrosStr = (parts[2] || '').trim();      // Litros cargados
      const montoStr = (parts[3] || '').trim();       // Monto
      // parts[4] is "Precio por litro" which we don't use
      
      const litros = parseFloat(litrosStr.replace(',', '.')) || 0;
      const monto = parseFloat(montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      
      // Parse DD-MM-YY to proper Date
      const dateParts = fecha.split('-');
      let year = parseInt(dateParts[2]);
      if (year < 100) year += 2000; // Convert 25 to 2025
      const parsedDate = new Date(year, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));
      
      fuelLogs.push({
        id: `csv-${i}`,
        fecha: parsedDate,
        litros,
        monto,
        detalle: 'Combustible (CSV)',
        estado: 'APROBADO',
        User: { codigo, nombre: codigo },  // Capital U to match DB structure (will be mapped later)
        comprobante: null,
        source: 'CSV'
      });
    }
    
    return fuelLogs;
  } catch (e) {
    console.error('[Excel Backup] Error reading fuel CSV:', e);
    return [];
  }
}

/**
 * Create Summary Sheet - Dashboard-style overview with emojis
 */
async function createSummarySheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('📋 Resumen');
  
  // Title
  sheet.getCell('A1').value = '✈️ FLIGHT LOG CC-AQI - OVERVIEW DASHBOARD';
  sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF1F4E78' } };
  sheet.mergeCells('A1:D1');
  
  sheet.getCell('A2').value = `📅 Generado: ${new Date().toLocaleString('es-CL', { 
    dateStyle: 'full', 
    timeStyle: 'short' 
  })}`;
  sheet.getCell('A2').font = { size: 11, color: { argb: 'FF64748B' } };
  sheet.mergeCells('A2:D2');
  
  const firstFlight = data.flights[0];
  const lastFlight = data.flights[data.flights.length - 1];
  
  sheet.getCell('A3').value = `⏰ Período: Desde ${firstFlight ? new Date(firstFlight.fecha).toLocaleDateString('es-CL') : 'N/A'} hasta ${new Date().toLocaleDateString('es-CL')}`;
  sheet.getCell('A3').font = { size: 11, color: { argb: 'FF64748B' } };
  sheet.mergeCells('A3:D3');
  
  let row = 5;
  
  // ==================== OPERATIONAL METRICS ====================
  sheet.getCell(`A${row}`).value = '📊 MÉTRICAS OPERACIONALES';
  sheet.getCell(`A${row}`).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  sheet.mergeCells(`A${row}:D${row}`);
  row++;
  
  const totalFlights = data.flights.length;
  const totalHobbs = data.flights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
  const totalTach = data.flights.reduce((sum, f) => sum + Number(f.diff_tach || 0), 0);
  const avgFlightDuration = totalFlights > 0 ? totalHobbs / totalFlights : 0;
  
  const metrics = [
    ['✈️ Total Vuelos', totalFlights.toLocaleString('es-CL'), '🕐 Horas HOBBS Totales', `${totalHobbs.toFixed(1)} hrs`],
    ['⏱️ Horas TACH Totales', `${totalTach.toFixed(1)} hrs`, '📈 Promedio Duración Vuelo', `${avgFlightDuration.toFixed(1)} hrs`],
    ['📅 Primer Vuelo', firstFlight ? new Date(firstFlight.fecha).toLocaleDateString('es-CL') : 'N/A', '📅 Último Vuelo', lastFlight ? new Date(lastFlight.fecha).toLocaleDateString('es-CL') : 'N/A']
  ];
  
  metrics.forEach(([label1, value1, label2, value2]) => {
    sheet.getCell(`A${row}`).value = label1;
    sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`B${row}`).value = value1;
    sheet.getCell(`B${row}`).font = { size: 11, color: { argb: 'FF1E40AF' }, bold: true };
    
    sheet.getCell(`C${row}`).value = label2;
    sheet.getCell(`C${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`D${row}`).value = value2;
    sheet.getCell(`D${row}`).font = { size: 11, color: { argb: 'FF1E40AF' }, bold: true };
    row++;
  });
  
  row++; // Spacing
  
  // ==================== FUEL METRICS ====================
  sheet.getCell(`A${row}`).value = '⛽ COMBUSTIBLE';
  sheet.getCell(`A${row}`).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
  sheet.mergeCells(`A${row}:D${row}`);
  row++;
  
  const totalLiters = data.fuelLogs.reduce((sum, f) => sum + Number(f.litros || 0), 0);
  const totalFuelCost = data.fuelLogs.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const avgFuelRate = totalHobbs > 0 ? totalLiters / totalHobbs : 0;
  const avgFuelRateGal = avgFuelRate / 3.78541;
  const avgPricePerLiter = totalLiters > 0 ? totalFuelCost / totalLiters : 0;
  
  const fuelMetrics = [
    ['🛢️ Total Litros Consumidos', `${totalLiters.toLocaleString('es-CL')} L`, '🇺🇸 Total Galones', `${(totalLiters / 3.78541).toFixed(0)} GAL`],
    ['💰 Gasto Total Combustible', `$${totalFuelCost.toLocaleString('es-CL')}`, '💵 Precio Promedio/Litro', `$${Math.round(avgPricePerLiter).toLocaleString('es-CL')}`],
    ['📊 Tasa Consumo (L/H)', `${avgFuelRate.toFixed(2)} L/H`, '📊 Tasa Consumo (GAL/H)', `${avgFuelRateGal.toFixed(2)} GAL/H`]
  ];
  
  fuelMetrics.forEach(([label1, value1, label2, value2]) => {
    sheet.getCell(`A${row}`).value = label1;
    sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`B${row}`).value = value1;
    sheet.getCell(`B${row}`).font = { size: 11, color: { argb: 'FFEA580C' }, bold: true };
    
    sheet.getCell(`C${row}`).value = label2;
    sheet.getCell(`C${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`D${row}`).value = value2;
    sheet.getCell(`D${row}`).font = { size: 11, color: { argb: 'FFEA580C' }, bold: true };
    row++;
  });
  
  row++; // Spacing
  
  // ==================== FINANCIAL OVERVIEW ====================
  sheet.getCell(`A${row}`).value = '💰 BALANCE FINANCIERO';
  sheet.getCell(`A${row}`).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  sheet.mergeCells(`A${row}:D${row}`);
  row++;
  
  const totalRevenue = data.flights.reduce((sum, f) => sum + Number(f.costo || 0), 0);
  const totalDeposits = data.deposits.reduce((sum, d) => sum + Number(d.monto || 0), 0);
  const balance = totalDeposits - totalRevenue - totalFuelCost;
  const avgRevenuePerFlight = totalFlights > 0 ? totalRevenue / totalFlights : 0;
  
  const financialMetrics = [
    ['✈️ Ingresos por Vuelos', `$${totalRevenue.toLocaleString('es-CL')}`, '💳 Depósitos Recibidos', `$${totalDeposits.toLocaleString('es-CL')}`],
    ['⛽ Cargos Combustible', `$${totalFuelCost.toLocaleString('es-CL')}`, '📊 Ingreso Promedio/Vuelo', `$${Math.round(avgRevenuePerFlight).toLocaleString('es-CL')}`],
    ['💵 Balance Pendiente', `$${balance.toLocaleString('es-CL')}`, '📈 Margen Operativo', `${totalRevenue > 0 ? ((totalRevenue - totalFuelCost) / totalRevenue * 100).toFixed(1) : 0}%`]
  ];
  
  financialMetrics.forEach(([label1, value1, label2, value2]) => {
    sheet.getCell(`A${row}`).value = label1;
    sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
    const isBalance = label1.includes('Balance');
    sheet.getCell(`B${row}`).value = value1;
    sheet.getCell(`B${row}`).font = { 
      size: 11, 
      color: { argb: isBalance && balance < 0 ? 'FFDC2626' : 'FF059669' }, 
      bold: true 
    };
    
    sheet.getCell(`C${row}`).value = label2;
    sheet.getCell(`C${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`D${row}`).value = value2;
    sheet.getCell(`D${row}`).font = { size: 11, color: { argb: 'FF059669' }, bold: true };
    row++;
  });
  
  row++; // Spacing
  
  // ==================== PILOTS SUMMARY ====================
  sheet.getCell(`A${row}`).value = '👥 PILOTOS';
  sheet.getCell(`A${row}`).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  sheet.mergeCells(`A${row}:D${row}`);
  row++;
  
  const totalPilots = data.users.filter(u => u.rol === 'PILOTO').length;
  const activePilots = data.users.filter(u => u.Flight.length > 0).length;
  const totalAdmins = data.users.filter(u => u.rol === 'ADMIN').length;
  const pilotsWithPositiveBalance = data.users.filter(u => {
    const deposits = data.deposits.filter(d => d.User?.codigo === u.codigo).reduce((s, d) => s + Number(d.monto || 0), 0);
    const flights = data.flights.filter(f => f.pilotoId === u.id).reduce((s, f) => s + Number(f.costo || 0), 0);
    const fuel = data.fuelLogs.filter(f => f.User?.codigo === u.codigo).reduce((s, f) => s + Number(f.monto || 0), 0);
    return (deposits - flights - fuel) > 0;
  }).length;
  
  const pilotMetrics = [
    ['👤 Total Pilotos Registrados', totalPilots.toLocaleString('es-CL'), '✈️ Pilotos con Vuelos', activePilots.toLocaleString('es-CL')],
    ['💰 Pilotos con Saldo Positivo', pilotsWithPositiveBalance.toLocaleString('es-CL'), '🔧 Administradores', totalAdmins.toLocaleString('es-CL')]
  ];
  
  pilotMetrics.forEach(([label1, value1, label2, value2]) => {
    sheet.getCell(`A${row}`).value = label1;
    sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`B${row}`).value = value1;
    sheet.getCell(`B${row}`).font = { size: 11, color: { argb: 'FF7C3AED' }, bold: true };
    
    sheet.getCell(`C${row}`).value = label2;
    sheet.getCell(`C${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`D${row}`).value = value2;
    sheet.getCell(`D${row}`).font = { size: 11, color: { argb: 'FF7C3AED' }, bold: true };
    row++;
  });
  
  row++; // Spacing
  
  // ==================== AIRCRAFT INFO ====================
  sheet.getCell(`A${row}`).value = '🛩️ AERONAVES';
  sheet.getCell(`A${row}`).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
  sheet.mergeCells(`A${row}:D${row}`);
  row++;
  
  const totalAircraft = data.aircraft.length;
  
  data.aircraft.forEach(aircraft => {
    const aircraftFlights = data.flights.filter(f => f.aircraftId === aircraft.matricula);
    const aircraftHours = aircraftFlights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
    
    sheet.getCell(`A${row}`).value = `✈️ ${aircraft.matricula}`;
    sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`B${row}`).value = `${aircraftFlights.length} vuelos`;
    sheet.getCell(`B${row}`).font = { size: 11 };
    
    sheet.getCell(`C${row}`).value = `⏱️ ${aircraftHours.toFixed(1)} hrs`;
    sheet.getCell(`C${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`D${row}`).value = aircraft.modelo || '';
    sheet.getCell(`D${row}`).font = { size: 11, italic: true };
    row++;
  });
  
  row++; // Spacing
  
  // ==================== DATA SUMMARY ====================
  sheet.getCell(`A${row}`).value = '📦 RESUMEN DE DATOS';
  sheet.getCell(`A${row}`).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF64748B' } };
  sheet.mergeCells(`A${row}:D${row}`);
  row++;
  
  const dataSummary = [
    ['✈️ Vuelos Registrados', data.flights.length.toLocaleString('es-CL'), '💰 Depósitos Registrados', data.deposits.length.toLocaleString('es-CL')],
    ['⛽ Registros Combustible', data.fuelLogs.length.toLocaleString('es-CL'), '📝 Transacciones Totales', data.transactions.length.toLocaleString('es-CL')],
    ['👥 Usuarios en Sistema', data.users.length.toLocaleString('es-CL'), '🛩️ Aeronaves Activas', totalAircraft.toLocaleString('es-CL')]
  ];
  
  dataSummary.forEach(([label1, value1, label2, value2]) => {
    sheet.getCell(`A${row}`).value = label1;
    sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`B${row}`).value = value1;
    sheet.getCell(`B${row}`).font = { size: 11, bold: true };
    
    sheet.getCell(`C${row}`).value = label2;
    sheet.getCell(`C${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`D${row}`).value = value2;
    sheet.getCell(`D${row}`).font = { size: 11, bold: true };
    row++;
  });
  
  // Column widths
  sheet.getColumn('A').width = 32;
  sheet.getColumn('B').width = 22;
  sheet.getColumn('C').width = 32;
  sheet.getColumn('D').width = 22;
}

/**
 * Create Flights Sheet - Exact match with Dashboard table columns
 * Columns: Fecha, Tac. 1, Tac. 2, Dif. Taco, Hobbs I, Hobbs F, Horas, Piloto, Copiloto, 
 *          ID, Tarifa, Inst. Rate, Total, AIRFRAME, ENGINE, PROPELLER, AD Sal, AD Dest, Detalle, Año, Mes
 */
async function createFlightsSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('✈️ Vuelos');
  
  // Headers - Exact match with dashboard table
  const headers = [
    'Fecha',       // Date
    'Tac. 1',      // tach_inicio
    'Tac. 2',      // tach_fin
    'Dif. Taco',   // diff_tach
    'Hobbs I',     // hobbs_inicio
    'Hobbs F',     // hobbs_fin
    'Horas',       // diff_hobbs
    'Piloto',      // Pilot name
    'Copiloto',    // copiloto
    'ID',          // cliente (pilot code)
    'Tarifa',      // tarifa (airplane rate)
    'Inst. Rate',  // instructor_rate
    'Total',       // costo
    'AIRFRAME',    // airframe_hours
    'ENGINE',      // engine_hours
    'PROPELLER',   // propeller_hours
    'AD Sal',      // aerodromoSalida
    'AD Dest',     // aerodromoDestino
    'Detalle',     // detalle
    'Año',         // year
    'Mes'          // month
  ];
  
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  // Data rows - sorted by date descending (most recent first, like dashboard)
  const sortedFlights = [...data.flights].sort((a, b) => 
    new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
  
  sortedFlights.forEach(flight => {
    const fecha = new Date(flight.fecha);
    const año = fecha.getFullYear();
    const mes = fecha.toLocaleString('es-CL', { month: 'short' });
    
    sheet.addRow([
      fecha,                                          // Fecha
      Number(flight.tach_inicio || 0),               // Tac. 1
      Number(flight.tach_fin || 0),                  // Tac. 2
      Number(flight.diff_tach || 0),                 // Dif. Taco
      flight.hobbs_inicio != null ? Number(flight.hobbs_inicio) : null,  // Hobbs I
      flight.hobbs_fin != null ? Number(flight.hobbs_fin) : null,        // Hobbs F
      flight.diff_hobbs != null ? Number(flight.diff_hobbs) : null,      // Horas
      flight.User?.nombre || flight.piloto_raw || 'N/A',                 // Piloto
      flight.copiloto || '',                         // Copiloto
      flight.cliente || '',                          // ID (código cliente)
      flight.tarifa ? Number(flight.tarifa) : null,  // Tarifa
      flight.instructor_rate ? Number(flight.instructor_rate) : null,    // Inst. Rate
      flight.costo != null ? Number(flight.costo) : null,                // Total
      flight.airframe_hours != null ? Number(flight.airframe_hours) : null,   // AIRFRAME
      flight.engine_hours != null ? Number(flight.engine_hours) : null,       // ENGINE
      flight.propeller_hours != null ? Number(flight.propeller_hours) : null, // PROPELLER
      flight.aerodromoSalida || '',                  // AD Sal
      flight.aerodromoDestino || '',                 // AD Dest
      flight.detalle || '',                          // Detalle
      año,                                           // Año
      mes                                            // Mes
    ]);
  });
  
  // Format columns to match dashboard style
  formatFlightsColumnsDashboard(sheet);
  
  // Add totals row - calculate directly
  const lastRow = sheet.rowCount + 1;
  const totalDiffTach = data.flights.reduce((sum, f) => sum + Number(f.diff_tach || 0), 0);
  const totalHoras = data.flights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
  const totalCosto = data.flights.reduce((sum, f) => sum + Number(f.costo || 0), 0);
  
  sheet.getCell(`A${lastRow}`).value = 'TOTALES:';
  sheet.getCell(`A${lastRow}`).font = { bold: true };
  sheet.getCell(`D${lastRow}`).value = totalDiffTach;  // Dif. Taco
  sheet.getCell(`G${lastRow}`).value = totalHoras;     // Horas
  sheet.getCell(`M${lastRow}`).value = totalCosto;     // Total
  
  styleCell(sheet.getCell(`A${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`D${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`G${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`M${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  
  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
}

/**
 * Create Deposits Sheet - Exact match with Dashboard table
 * Columns: Date, Pilot, Description, Amount
 */
async function createDepositsSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('💰 Depósitos');
  
  // Headers - Exact match with dashboard
  const headers = ['Date', 'Pilot', 'Description', 'Amount'];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  // Build deposits array from depositsDetailsByCode (same logic as dashboard)
  const allDeposits: { code: string; pilotName: string; fecha: string; descripcion: string; monto: number }[] = [];
  
  if (data.depositsDetailsByCode) {
    Object.entries(data.depositsDetailsByCode).forEach(([code, records]) => {
      const pilotName = data.csvPilotNames?.[code] || code;
      records.forEach(r => {
        allDeposits.push({ 
          code, 
          pilotName, 
          fecha: r.fecha,          // Already in yyyy-mm-dd format from dashboard
          descripcion: r.descripcion, 
          monto: r.monto 
        });
      });
    });
  }
  
  // Sort by date descending (most recent first, like dashboard)
  allDeposits.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  
  allDeposits.forEach(deposit => {
    sheet.addRow([
      deposit.fecha,                                      // Date (yyyy-mm-dd format like dashboard)
      `${deposit.pilotName} (${deposit.code})`,          // Pilot with code in parentheses
      deposit.descripcion || '',                          // Description
      Number(deposit.monto || 0)                          // Amount
    ]);
  });
  
  formatDepositsColumnsDashboard(sheet);
  
  // Calculate total directly
  const totalDeposits = allDeposits.reduce((sum, d) => sum + Number(d.monto || 0), 0);
  const lastRow = sheet.rowCount + 1;
  sheet.getCell(`A${lastRow}`).value = 'TOTAL:';
  sheet.getCell(`D${lastRow}`).value = totalDeposits;  // Amount column
  styleCell(sheet.getCell(`A${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`D${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

/**
 * Create Fuel Sheet - Exact match with Dashboard table
 * Columns: Fecha, Piloto, Código, Litros, Monto, Fuente, Detalle
 */
async function createFuelSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('⛽ Combustible');
  
  // Headers - Exact match with dashboard
  const headers = ['Fecha', 'Piloto', 'Código', 'Litros', 'Monto', 'Fuente', 'Detalle'];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  // Sort by date descending (most recent first, like dashboard pagination)
  const sortedFuel = [...data.fuelLogs].sort((a, b) => 
    new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
  
  sortedFuel.forEach(fuel => {
    const source = fuel.source === 'CSV' ? 'Histórico' : 'App';
    // Format date as dd-mm-yyyy (dashboard format)
    const dateObj = new Date(fuel.fecha);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const fecha = `${day}-${month}-${year}`;
    
    const litrosFormatted = fuel.litros > 0 ? `${Number(fuel.litros).toFixed(1)} L` : '-';
    
    // Get pilot info - use csvPilotNames for CSV records
    const pilotCode = fuel.User?.codigo || fuel.user?.codigo || '-';
    let pilotName = fuel.User?.nombre || fuel.user?.nombre || 'N/A';
    
    // If this is a CSV record and we have the pilot name mapping, use it
    if (fuel.source === 'CSV' && data.csvPilotNames && data.csvPilotNames[pilotCode.toUpperCase()]) {
      pilotName = data.csvPilotNames[pilotCode.toUpperCase()];
    }
    
    sheet.addRow([
      fecha,                                             // Fecha (formatted as string)
      pilotName,                                         // Piloto
      pilotCode,                                         // Código
      litrosFormatted,                                   // Litros (con ' L' al final)
      Number(fuel.monto || 0),                          // Monto
      source,                                            // Fuente (Histórico/App)
      fuel.detalle || '-'                                // Detalle
    ]);
  });
  
  formatFuelColumnsDashboard(sheet);
  
  // Calculate totals directly
  const totalLitros = data.fuelLogs.reduce((sum, f) => sum + Number(f.litros || 0), 0);
  const totalMonto = data.fuelLogs.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  
  const lastRow = sheet.rowCount + 1;
  sheet.getCell(`A${lastRow}`).value = 'TOTALES:';
  sheet.getCell(`D${lastRow}`).value = `${totalLitros.toFixed(1)} L`;   // Litros
  sheet.getCell(`E${lastRow}`).value = totalMonto;    // Monto
  styleCell(sheet.getCell(`A${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`D${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`E${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

/**
 * Create Pilots Sheet
 */
async function createPilotsSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('👥 Pilotos');
  
  const headers = [
    'ID', 'Código', 'Nombre', 'Email', 'Rol', 'Vuelos', 'Horas HOBBS',
    'Gastado', 'Depósitos', 'Combustible', 'Balance', 'Tarifa/Hora',
    'Teléfono', 'Licencia', 'Fecha Nacimiento'
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  data.users.forEach(user => {
    const userFlights = data.flights.filter(f => f.pilotoId === user.id);
    const userDeposits = data.deposits.filter(d => d.User?.codigo === user.codigo);
    const userFuel = data.fuelLogs.filter(f => f.User?.codigo === user.codigo);
    
    const totalHours = userFlights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
    const totalSpent = userFlights.reduce((sum, f) => sum + Number(f.costo || 0), 0);
    const totalDeposits = userDeposits.reduce((sum, d) => sum + Number(d.monto || 0), 0);
    const totalFuel = userFuel.reduce((sum, f) => sum + Number(f.monto || 0), 0);
    const balance = totalDeposits - totalSpent - totalFuel;
    
    sheet.addRow([
      user.id,
      user.codigo || '',
      user.nombre,
      user.email,
      user.rol,
      userFlights.length,
      totalHours,
      totalSpent,
      totalDeposits,
      totalFuel,
      balance,
      Number(user.tarifa_hora || 0),
      user.telefono || '',
      user.licencia || '',
      user.fechaNacimiento ? new Date(user.fechaNacimiento) : null
    ]);
  });
  
  formatPilotsColumns(sheet);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

/**
 * Create Aircraft Sheet
 */
async function createAircraftSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('🛩️ Aeronaves');
  
  sheet.getCell('A1').value = 'AERONAVE';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  
  const headers = ['Matrícula', 'Modelo', 'Hobbs Actual', 'Tach Actual', 'Primer Vuelo', 'Último Vuelo', 'Total Vuelos'];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 2, headers.length);
  
  data.aircraft.forEach(ac => {
    const acFlights = data.flights.filter(f => f.aircraftId === ac.matricula);
    const firstFlight = acFlights[0];
    const lastFlight = acFlights[acFlights.length - 1];
    
    sheet.addRow([
      ac.matricula,
      ac.modelo || '',
      Number(ac.hobbs_actual || 0),
      Number(ac.tach_actual || 0),
      firstFlight ? new Date(firstFlight.fecha) : null,
      lastFlight ? new Date(lastFlight.fecha) : null,
      acFlights.length
    ]);
  });
  
  // Components section
  sheet.addRow([]);
  sheet.getCell(`A${sheet.rowCount + 1}`).value = 'COMPONENTES Y MANTENIMIENTO';
  sheet.getCell(`A${sheet.rowCount}`).font = { bold: true, size: 14 };
  
  const compHeaders = ['Matrícula', 'Componente', 'Horas TACH', 'TBO (Límite)', 'Horas Restantes', 'Estado'];
  sheet.addRow(compHeaders);
  styleHeaderRow(sheet, sheet.rowCount, compHeaders.length);
  
  data.components.forEach(comp => {
    const horasRestantes = Number(comp.tbo || 0) - Number(comp.horas_actuales || 0);
    const estado = horasRestantes < 50 ? '⚠ Próximo' : '✓ OK';
    
    sheet.addRow([
      comp.aircraft?.matricula || '',
      comp.tipo,
      Number(comp.horas_actuales || 0),
      Number(comp.tbo || 0),
      horasRestantes,
      estado
    ]);
  });
  
  formatAircraftColumns(sheet);
}

/**
 * Create Transactions Sheet
 */
async function createTransactionsSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('📝 Transacciones');
  
  const headers = ['ID', 'Fecha', 'Tipo', 'Piloto', 'Código', 'Monto', 'Flight ID', 'Descripción'];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  data.transactions.forEach(tx => {
    sheet.addRow([
      tx.id,
      tx.createdAt ? new Date(tx.createdAt) : null,
      tx.tipo,
      tx.User?.nombre || 'N/A',
      tx.User?.codigo || 'N/A',
      Number(tx.monto || 0),
      tx.flightId || '',
      tx.tipo === 'FLIGHT' ? `Vuelo ${tx.flight?.id || ''}` :
      tx.tipo === 'DEPOSIT' ? 'Depósito de cuenta' :
      tx.tipo === 'FUEL' ? 'Combustible' : ''
    ]);
  });
  
  formatTransactionsColumns(sheet);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

/**
 * Create Pending Approvals Sheet
 */
async function createPendingSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('⏳ Pendientes');
  
  sheet.getCell('A1').value = 'FLIGHT SUBMISSIONS PENDIENTES';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  
  const headers = ['ID', 'Fecha Creación', 'Piloto', 'Código', 'Hobbs Fin', 'Tach Fin', 'Estado', 'Error', 'Detalle'];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 2, headers.length);
  
  data.submissions
    .filter(s => s.estado !== 'COMPLETADO')
    .forEach(sub => {
      sheet.addRow([
        sub.id,
        sub.createdAt ? new Date(sub.createdAt) : null,
        sub.User?.nombre || 'N/A',
        sub.User?.codigo || 'N/A',
        Number(sub.hobbsFinal || 0),
        Number(sub.tachFinal || 0),
        sub.estado,
        sub.errorMessage || '',
        sub.detalle || ''
      ]);
    });
  
  // Pending deposits
  sheet.addRow([]);
  sheet.getCell(`A${sheet.rowCount + 1}`).value = 'DEPÓSITOS PENDIENTES';
  sheet.getCell(`A${sheet.rowCount}`).font = { bold: true, size: 14 };
  
  const depHeaders = ['ID', 'Fecha', 'Piloto', 'Código', 'Monto', 'Detalle'];
  sheet.addRow(depHeaders);
  styleHeaderRow(sheet, sheet.rowCount, depHeaders.length);
  
  data.deposits
    .filter(d => d.estado === 'PENDIENTE')
    .forEach(dep => {
      sheet.addRow([
        dep.id,
        new Date(dep.fecha),
        dep.User?.nombre || 'N/A',
        dep.User?.codigo || 'N/A',
        Number(dep.monto || 0),
        dep.detalle || ''
      ]);
    });
  
  // Pending fuel
  sheet.addRow([]);
  sheet.getCell(`A${sheet.rowCount + 1}`).value = 'COMBUSTIBLE PENDIENTE';
  sheet.getCell(`A${sheet.rowCount}`).font = { bold: true, size: 14 };
  
  const fuelHeaders = ['ID', 'Fecha', 'Piloto', 'Código', 'Litros', 'Monto', 'Detalle'];
  sheet.addRow(fuelHeaders);
  styleHeaderRow(sheet, sheet.rowCount, fuelHeaders.length);
  
  data.fuelLogs
    .filter(f => f.estado === 'PENDIENTE')
    .forEach(fuel => {
      sheet.addRow([
        fuel.id,
        new Date(fuel.fecha),
        fuel.User?.nombre || 'N/A',
        fuel.User?.codigo || 'N/A',
        Number(fuel.litros || 0),
        Number(fuel.monto || 0),
        fuel.detalle || ''
      ]);
    });
  
  formatPendingColumns(sheet);
}

// ============= FORMATTING HELPERS =============

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number, columnCount: number) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' }
  };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 20;
}

function styleCell(cell: ExcelJS.Cell, options: { bold?: boolean; bgColor?: string }) {
  if (options.bold) cell.font = { bold: true };
  if (options.bgColor) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${options.bgColor}` }
    };
  }
}

/**
 * Format columns for Dashboard-style Flights sheet
 * Columns: Fecha, Tac. 1, Tac. 2, Dif. Taco, Hobbs I, Hobbs F, Horas, Piloto, Copiloto, 
 *          ID, Tarifa, Inst. Rate, Total, AIRFRAME, ENGINE, PROPELLER, AD Sal, AD Dest, Detalle, Año, Mes
 */
function formatFlightsColumnsDashboard(sheet: ExcelJS.Worksheet) {
  // Column A: Fecha
  sheet.getColumn(1).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(1).width = 12;
  
  // Columns B-D: Tac. 1, Tac. 2, Dif. Taco (numeric with 1 decimal)
  sheet.getColumn(2).numFmt = '#,##0.0';
  sheet.getColumn(2).width = 10;
  sheet.getColumn(3).numFmt = '#,##0.0';
  sheet.getColumn(3).width = 10;
  sheet.getColumn(4).numFmt = '#,##0.0';
  sheet.getColumn(4).width = 10;
  
  // Columns E-G: Hobbs I, Hobbs F, Horas (numeric with 1 decimal)
  sheet.getColumn(5).numFmt = '#,##0.0';
  sheet.getColumn(5).width = 10;
  sheet.getColumn(6).numFmt = '#,##0.0';
  sheet.getColumn(6).width = 10;
  sheet.getColumn(7).numFmt = '#,##0.0';
  sheet.getColumn(7).width = 10;
  
  // Column H: Piloto
  sheet.getColumn(8).width = 20;
  
  // Column I: Copiloto
  sheet.getColumn(9).width = 15;
  
  // Column J: ID (código cliente)
  sheet.getColumn(10).width = 8;
  
  // Columns K-M: Tarifa, Inst. Rate, Total (currency)
  sheet.getColumn(11).numFmt = '$#,##0';
  sheet.getColumn(11).width = 12;
  sheet.getColumn(12).numFmt = '$#,##0';
  sheet.getColumn(12).width = 12;
  sheet.getColumn(13).numFmt = '$#,##0';
  sheet.getColumn(13).width = 12;
  
  // Columns N-P: AIRFRAME, ENGINE, PROPELLER (numeric with 1 decimal)
  sheet.getColumn(14).numFmt = '#,##0.0';
  sheet.getColumn(14).width = 10;
  sheet.getColumn(15).numFmt = '#,##0.0';
  sheet.getColumn(15).width = 10;
  sheet.getColumn(16).numFmt = '#,##0.0';
  sheet.getColumn(16).width = 10;
  
  // Columns Q-R: AD Sal, AD Dest
  sheet.getColumn(17).width = 10;
  sheet.getColumn(18).width = 10;
  
  // Column S: Detalle
  sheet.getColumn(19).width = 25;
  
  // Columns T-U: Año, Mes
  sheet.getColumn(20).width = 8;
  sheet.getColumn(21).width = 8;
}

function formatFlightsColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(2).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(2).width = 12;
  sheet.getColumn(8).numFmt = '#,##0.0';
  sheet.getColumn(9).numFmt = '#,##0.0';
  sheet.getColumn(10).numFmt = '#,##0.0';
  sheet.getColumn(11).numFmt = '#,##0.0';
  sheet.getColumn(12).numFmt = '$#,##0';
  sheet.getColumn(13).numFmt = '$#,##0';
  sheet.getColumn(16).numFmt = '$#,##0';
  sheet.getColumn(21).numFmt = 'dd/mm/yyyy hh:mm';
  
  [3, 4, 5, 6, 7].forEach(col => sheet.getColumn(col).width = 15);
  [14, 15, 17, 18, 19].forEach(col => sheet.getColumn(col).width = 15);
}

function formatDepositsColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(2).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(5).numFmt = '$#,##0';
  [2, 3, 4, 6, 7, 8, 9].forEach(col => sheet.getColumn(col).width = 15);
}

/**
 * Format columns for Dashboard-style Deposits sheet
 * Columns: Date, Pilot, Description, Amount
 */
function formatDepositsColumnsDashboard(sheet: ExcelJS.Worksheet) {
  // Column A: Date (text format from dashboard)
  sheet.getColumn(1).width = 14;
  sheet.getColumn(1).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column B: Pilot
  sheet.getColumn(2).width = 35;
  sheet.getColumn(2).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column C: Description
  sheet.getColumn(3).width = 40;
  sheet.getColumn(3).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column D: Amount (currency format without decimals, Chilean format with dot separator)
  sheet.getColumn(4).numFmt = '"$"#.##0';
  sheet.getColumn(4).width = 16;
  sheet.getColumn(4).alignment = { horizontal: 'right', vertical: 'middle' };
  
  // Style data rows (skip header)
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    
    // Skip total row
    if (row.getCell(1).value === 'TOTAL:') continue;
    
    row.height = 20;
    
    // Date column - text-slate-700
    row.getCell(1).font = { size: 11, color: { argb: 'FF334155' } };
    
    // Pilot column - font-semibold text-slate-900
    row.getCell(2).font = { size: 11, bold: true, color: { argb: 'FF0F172A' } };
    
    // Description column - text-slate-600
    row.getCell(3).font = { size: 11, color: { argb: 'FF475569' } };
    
    // Amount column - font-bold text-green-700
    row.getCell(4).font = { size: 11, bold: true, color: { argb: 'FF15803D' } };
    
    // Add hover effect simulation with subtle border
    row.border = {
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  }
}

function formatFuelColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(2).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(5).numFmt = '#,##0.0';
  sheet.getColumn(6).numFmt = '$#,##0';
  sheet.getColumn(7).numFmt = '$#,##0';
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(col => sheet.getColumn(col).width = 15);
}

/**
 * Format columns for Dashboard-style Fuel sheet
 * Columns: Fecha, Piloto, Código, Litros, Monto, Fuente, Detalle
 */
function formatFuelColumnsDashboard(sheet: ExcelJS.Worksheet) {
  // Column A: Fecha (text format from dashboard)
  sheet.getColumn(1).width = 13;
  sheet.getColumn(1).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column B: Piloto
  sheet.getColumn(2).width = 28;
  sheet.getColumn(2).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column C: Código
  sheet.getColumn(3).width = 11;
  sheet.getColumn(3).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column D: Litros (text format like dashboard)
  sheet.getColumn(4).width = 12;
  sheet.getColumn(4).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column E: Monto (currency format without decimals, Chilean format with dot separator)
  sheet.getColumn(5).numFmt = '"$"#.##0';
  sheet.getColumn(5).width = 14;
  sheet.getColumn(5).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Column F: Fuente
  sheet.getColumn(6).width = 13;
  sheet.getColumn(6).alignment = { horizontal: 'center', vertical: 'middle' };
  
  // Column G: Detalle
  sheet.getColumn(7).width = 35;
  sheet.getColumn(7).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // Style data rows (skip header and totals row)
  for (let i = 2; i < sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    
    // Skip total row
    if (row.getCell(1).value === 'TOTALES:') continue;
    
    row.height = 20;
    
    // Date column - text-slate-700 (size 11)
    row.getCell(1).font = { size: 11, color: { argb: 'FF334155' } };
    
    // Piloto column - font-semibold text-slate-900 (size 11)
    row.getCell(2).font = { size: 11, bold: true, color: { argb: 'FF0F172A' } };
    
    // Código column - font-mono text-indigo-600 (size 11)
    row.getCell(3).font = { size: 11, name: 'Consolas', color: { argb: 'FF4F46E5' } };
    
    // Litros column - text-slate-600 font-mono (size 11)
    row.getCell(4).font = { size: 11, name: 'Consolas', color: { argb: 'FF475569' } };
    
    // Monto column - font-bold text-green-600 (size 11)
    row.getCell(5).font = { size: 11, bold: true, color: { argb: 'FF16A34A' } };
    
    // Check if this is a CSV (Histórico) row and apply background color
    const sourceCell = row.getCell(6);
    if (sourceCell.value === 'Histórico') {
      // Light gray background for CSV rows (bg-slate-50/50)
      [1, 2, 3, 4, 5, 6, 7].forEach(col => {
        row.getCell(col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      });
      // Badge style for Histórico (bg-slate-200 text-slate-700)
      sourceCell.font = { size: 10, bold: true, color: { argb: 'FF334155' } };
      sourceCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
    } else {
      // Badge style for App (bg-blue-100 text-blue-700)
      sourceCell.font = { size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
      sourceCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDBEAFE' }
      };
    }
    
    // Detalle column - text-slate-600
    row.getCell(7).font = { size: 11, color: { argb: 'FF475569' } };
    
    // Row border (divide-y divide-slate-100)
    row.border = {
      bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } }
    };
  }
}

function formatPilotsColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(7).numFmt = '#,##0.0';
  sheet.getColumn(8).numFmt = '$#,##0';
  sheet.getColumn(9).numFmt = '$#,##0';
  sheet.getColumn(10).numFmt = '$#,##0';
  sheet.getColumn(11).numFmt = '$#,##0';
  sheet.getColumn(12).numFmt = '$#,##0';
  sheet.getColumn(15).numFmt = 'dd/mm/yyyy';
  [1, 2, 3, 4, 5, 13, 14, 15].forEach(col => sheet.getColumn(col).width = 15);
  [6, 7, 8, 9, 10, 11, 12].forEach(col => sheet.getColumn(col).width = 12);
}

function formatAircraftColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(3).numFmt = '#,##0.0';
  sheet.getColumn(4).numFmt = '#,##0.0';
  sheet.getColumn(5).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(6).numFmt = 'dd/mm/yyyy';
  [1, 2, 3, 4, 5, 6, 7].forEach(col => sheet.getColumn(col).width = 15);
}

function formatTransactionsColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(2).numFmt = 'dd/mm/yyyy hh:mm';
  sheet.getColumn(6).numFmt = '$#,##0';
  [1, 2, 3, 4, 5, 6, 7, 8].forEach(col => sheet.getColumn(col).width = 15);
}

function formatPendingColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(2).numFmt = 'dd/mm/yyyy hh:mm';
  sheet.getColumn(5).numFmt = '#,##0.0';
  sheet.getColumn(6).numFmt = '#,##0.0';
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(col => sheet.getColumn(col).width = 15);
}
