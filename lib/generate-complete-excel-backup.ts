import ExcelJS from 'exceljs';
import { prisma } from './prisma';
import fs from 'fs';
import path from 'path';

interface BackupData {
  users: any[];
  flights: any[];
  deposits: any[];
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
  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`[Excel Backup] Complete! Buffer size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  
  return buffer as Buffer;
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
        piloto: { select: { nombre: true, codigo: true } },
        aircraft: { select: { matricula: true, modelo: true } }
      }
    }),
    prisma.deposit.findMany({
      orderBy: { fecha: 'asc' },
      include: {
        user: { select: { nombre: true, codigo: true } }
      }
    }),
    prisma.fuelLog.findMany({
      orderBy: { fecha: 'asc' },
      include: {
        user: { select: { nombre: true, codigo: true } }
      }
    }),
    prisma.transaction.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { nombre: true, codigo: true } },
        flight: { select: { id: true, fecha: true } }
      }
    }),
    prisma.flightSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        piloto: { select: { nombre: true, codigo: true } },
        ImageLog: true
      }
    }),
    prisma.aircraft.findMany({
      include: {
        Component: true
      }
    }),
    prisma.component.findMany({
      include: {
        aircraft: { select: { matricula: true, modelo: true } }
      }
    })
  ]);
  
  // Read CSV deposits
  const csvDeposits = await readDepositCSV();
  const allDeposits = [...deposits, ...csvDeposits];
  
  // Read CSV fuel
  const csvFuel = await readFuelCSV();
  const allFuel = [...fuelLogs, ...csvFuel];
  
  console.log(`[Excel Backup] Data fetched: ${flights.length} flights, ${allDeposits.length} deposits, ${allFuel.length} fuel logs`);
  
  return {
    users,
    flights,
    deposits: allDeposits,
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
      
      const fecha = (parts[0] || '').trim();
      const litrosStr = (parts[1] || '').trim();
      const montoStr = (parts[2] || '').trim();
      const codigo = (parts[3] || '').trim().toUpperCase();
      
      const litros = parseFloat(litrosStr.replace(',', '.')) || 0;
      const monto = parseFloat(montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      
      fuelLogs.push({
        id: null,
        fecha: new Date(fecha.split('-').reverse().join('-')),
        litros,
        monto,
        detalle: 'Combustible (CSV)',
        estado: 'APROBADO',
        user: { codigo, nombre: codigo },
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
 * Create Summary Sheet (Resumen Ejecutivo)
 */
async function createSummarySheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('📋 Resumen', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
  });
  
  // Header
  sheet.getCell('A1').value = 'FLIGHT LOG CC-AQI - REPORTE COMPLETO';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E78' } };
  sheet.getCell('A2').value = `Generado: ${new Date().toLocaleString('es-CL')}`;
  sheet.getCell('A3').value = `Período: Desde primer vuelo hasta ${new Date().toLocaleDateString('es-CL')}`;
  
  // Calculate metrics
  const totalFlights = data.flights.length;
  const totalHobbs = data.flights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
  const totalTach = data.flights.reduce((sum, f) => sum + Number(f.diff_tach || 0), 0);
  const totalRevenue = data.flights.reduce((sum, f) => sum + Number(f.costo || 0), 0);
  const totalDeposits = data.deposits.reduce((sum, d) => sum + Number(d.monto || 0), 0);
  const totalFuel = data.fuelLogs.reduce((sum, f) => sum + Number(f.monto || 0), 0);
  const totalLiters = data.fuelLogs.reduce((sum, f) => sum + Number(f.litros || 0), 0);
  const activePilots = data.users.filter(u => u.Flight.length > 0).length;
  const balance = totalDeposits - totalRevenue - totalFuel;
  
  const firstFlight = data.flights[0];
  const lastFlight = data.flights[data.flights.length - 1];
  
  // Statistics table
  let row = 5;
  const stats = [
    ['ESTADÍSTICAS GENERALES', ''],
    ['Total Vuelos:', totalFlights.toLocaleString('es-CL')],
    ['Horas HOBBS Totales:', `${totalHobbs.toFixed(1)} hrs`],
    ['Horas TACH Totales:', `${totalTach.toFixed(1)} hrs`],
    ['Ingresos Totales:', `$${totalRevenue.toLocaleString('es-CL')}`],
    ['', ''],
    ['OPERACIONES', ''],
    ['Primer Vuelo:', firstFlight ? new Date(firstFlight.fecha).toLocaleDateString('es-CL') : 'N/A'],
    ['Último Vuelo:', lastFlight ? new Date(lastFlight.fecha).toLocaleDateString('es-CL') : 'N/A'],
    ['', ''],
    ['PILOTOS', ''],
    ['Total Pilotos:', data.users.filter(u => u.rol === 'PILOTO').length],
    ['Pilotos con Vuelos:', activePilots],
    ['', ''],
    ['COMBUSTIBLE', ''],
    ['Total Litros:', `${totalLiters.toLocaleString('es-CL')} L`],
    ['Gasto Total:', `$${totalFuel.toLocaleString('es-CL')}`],
    ['Tasa Consumo:', totalHobbs > 0 ? `${(totalLiters / totalHobbs).toFixed(1)} L/hr` : 'N/A'],
    ['', ''],
    ['BALANCE FINANCIERO', ''],
    ['Ingresos por Vuelos:', `$${totalRevenue.toLocaleString('es-CL')}`],
    ['Depósitos Recibidos:', `$${totalDeposits.toLocaleString('es-CL')}`],
    ['Cargos Combustible:', `$${totalFuel.toLocaleString('es-CL')}`],
    ['Balance Pendiente:', `$${balance.toLocaleString('es-CL')}`]
  ];
  
  stats.forEach(([label, value]) => {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`B${row}`).value = value;
    
    if (label.toUpperCase() === label && label !== '') {
      sheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF1F4E78' } };
    }
    
    row++;
  });
  
  sheet.getColumn('A').width = 30;
  sheet.getColumn('B').width = 25;
}

/**
 * Create Flights Sheet
 */
async function createFlightsSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('✈️ Vuelos');
  
  // Headers
  const headers = [
    'ID', 'Fecha', 'Piloto', 'Código Piloto', 'Cliente', 'Código Cliente',
    'Matrícula', 'Hobbs Fin', 'Tach Fin', 'Δ Hobbs', 'Δ Tach',
    'Costo', 'Tarifa/Hora', 'Copiloto', 'Instructor', 'Rate Instructor',
    'Aeródromo Salida', 'Aeródromo Destino', 'Detalle', 'Aprobado', 'Fecha Creación'
  ];
  
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  // Data rows
  data.flights.forEach(flight => {
    sheet.addRow([
      flight.id,
      new Date(flight.fecha),
      flight.piloto?.nombre || 'N/A',
      flight.piloto?.codigo || 'N/A',
      flight.clienteNombre || 'N/A',
      flight.clienteCodigo || 'N/A',
      flight.aircraftId,
      Number(flight.hobbs_fin || 0),
      Number(flight.tach_fin || 0),
      Number(flight.diff_hobbs || 0),
      Number(flight.diff_tach || 0),
      Number(flight.costo || 0),
      Number(flight.tarifa || 0),
      flight.copiloto || '',
      flight.instructor || '',
      Number(flight.instructor_rate || 0),
      flight.aerodromoSalida || '',
      flight.aerodromoDestino || '',
      flight.detalle || '',
      flight.aprobado ? 'SÍ' : 'NO',
      flight.createdAt ? new Date(flight.createdAt) : null
    ]);
  });
  
  // Format columns
  formatFlightsColumns(sheet);
  
  // Add totals row
  const lastRow = sheet.rowCount + 1;
  sheet.getCell(`A${lastRow}`).value = 'TOTALES:';
  sheet.getCell(`A${lastRow}`).font = { bold: true };
  sheet.getCell(`J${lastRow}`).value = { formula: `SUM(J2:J${lastRow - 1})` };
  sheet.getCell(`K${lastRow}`).value = { formula: `SUM(K2:K${lastRow - 1})` };
  sheet.getCell(`L${lastRow}`).value = { formula: `SUM(L2:L${lastRow - 1})` };
  
  styleCell(sheet.getCell(`A${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`J${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`K${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`L${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  
  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
}

/**
 * Create Deposits Sheet
 */
async function createDepositsSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('💰 Depósitos');
  
  const headers = ['ID', 'Fecha', 'Piloto', 'Código', 'Monto', 'Detalle', 'Estado', 'Comprobante', 'Fuente'];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  data.deposits
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .forEach(deposit => {
      sheet.addRow([
        deposit.id || 'CSV',
        new Date(deposit.fecha),
        deposit.user?.nombre || 'N/A',
        deposit.user?.codigo || 'N/A',
        Number(deposit.monto || 0),
        deposit.detalle || '',
        deposit.estado || 'APROBADO',
        deposit.comprobante || '',
        deposit.source || 'DB'
      ]);
    });
  
  formatDepositsColumns(sheet);
  
  const lastRow = sheet.rowCount + 1;
  sheet.getCell(`A${lastRow}`).value = 'TOTAL:';
  sheet.getCell(`E${lastRow}`).value = { formula: `SUM(E2:E${lastRow - 1})` };
  styleCell(sheet.getCell(`A${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`E${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

/**
 * Create Fuel Sheet
 */
async function createFuelSheet(workbook: ExcelJS.Workbook, data: BackupData) {
  const sheet = workbook.addWorksheet('⛽ Combustible');
  
  const headers = ['ID', 'Fecha', 'Piloto', 'Código', 'Litros', 'Monto', '$/Litro', 'Detalle', 'Estado', 'Comprobante', 'Fuente'];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);
  
  data.fuelLogs
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .forEach(fuel => {
      const pricePerLiter = fuel.litros > 0 ? fuel.monto / fuel.litros : 0;
      sheet.addRow([
        fuel.id || 'CSV',
        new Date(fuel.fecha),
        fuel.user?.nombre || 'N/A',
        fuel.user?.codigo || 'N/A',
        Number(fuel.litros || 0),
        Number(fuel.monto || 0),
        pricePerLiter,
        fuel.detalle || '',
        fuel.estado || 'APROBADO',
        fuel.comprobante || '',
        fuel.source || 'DB'
      ]);
    });
  
  formatFuelColumns(sheet);
  
  const lastRow = sheet.rowCount + 1;
  sheet.getCell(`A${lastRow}`).value = 'TOTALES:';
  sheet.getCell(`E${lastRow}`).value = { formula: `SUM(E2:E${lastRow - 1})` };
  sheet.getCell(`F${lastRow}`).value = { formula: `SUM(F2:F${lastRow - 1})` };
  sheet.getCell(`G${lastRow}`).value = { formula: `AVERAGE(G2:G${lastRow - 1})` };
  styleCell(sheet.getCell(`A${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`E${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`F${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  styleCell(sheet.getCell(`G${lastRow}`), { bold: true, bgColor: 'C6EFCE' });
  
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
    const userDeposits = data.deposits.filter(d => d.user?.codigo === user.codigo);
    const userFuel = data.fuelLogs.filter(f => f.user?.codigo === user.codigo);
    
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
      tx.user?.nombre || 'N/A',
      tx.user?.codigo || 'N/A',
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
        sub.piloto?.nombre || 'N/A',
        sub.piloto?.codigo || 'N/A',
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
        dep.user?.nombre || 'N/A',
        dep.user?.codigo || 'N/A',
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
        fuel.user?.nombre || 'N/A',
        fuel.user?.codigo || 'N/A',
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

function formatFuelColumns(sheet: ExcelJS.Worksheet) {
  sheet.getColumn(2).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(5).numFmt = '#,##0.0';
  sheet.getColumn(6).numFmt = '$#,##0';
  sheet.getColumn(7).numFmt = '$#,##0';
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(col => sheet.getColumn(col).width = 15);
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
