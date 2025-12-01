import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Flight {
  id: number;
  fecha: string | Date;
  diff_hobbs: number;
  costo: number;
  detalle?: string;
  piloto_raw?: string;
  tach_inicio?: number;
  tach_fin?: number;
  tarifa?: number;
  instructor_rate?: number;
}

interface Deposit {
  fecha: string;
  descripcion: string;
  monto: number;
}

interface FuelCredit {
  fecha: string;
  descripcion: string;
  monto: number;
}

interface AccountData {
  clientCode: string;
  clientName: string;
  flights: Flight[];
  deposits: Deposit[];
  fuelCredits: FuelCredit[];
  totalFlights: number;
  totalHours: number;
  totalSpent: number;
  totalDeposits: number;
  totalFuel: number;
  balance: number;
  dateRange?: { start?: string; end?: string };
}

// Helper function to load image as base64
async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

export async function generateAccountStatementPDF(data: AccountData): Promise<void> {
  console.log('🔵 Generating PDF with dashboard theme - v2.0');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Load logo
  let logoBase64: string | null = null;
  try {
    console.log('📸 Loading logo from /LOGO_BLANCO.png');
    logoBase64 = await loadImageAsBase64('/LOGO_BLANCO.png');
    console.log('✅ Logo loaded successfully');
  } catch (e) {
    console.error('❌ Could not load logo:', e);
  }
  
  // Dashboard hybrid theme colors
  const slateBlue = '#1E293B'; // slate-800
  const accentBlue = '#2563EB'; // blue-600
  const lightBg = '#F8FAFC'; // slate-50
  const textPrimary = '#0F172A'; // slate-900
  const textSecondary = '#64748B'; // slate-500
  console.log('🎨 Using dashboard colors:', { slateBlue, accentBlue, lightBg });
  
  // Helper function to format currency
  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;
  const formatDate = (date: string | Date) => {
    if (typeof date === 'string' && date.includes('-') && date.length <= 12) {
      // Already formatted like "14-Dec-17"
      return date;
    }
    const d = new Date(date);
    return d.toLocaleDateString('es-CL');
  };

  // === HEADER ===
  // Gradient header bar (slate-800 to blue-900)
  console.log('🎨 Setting header color to slate-800');
  doc.setFillColor(30, 41, 59); // #1E293B slate-800
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Add logo if loaded
  if (logoBase64) {
    try {
      console.log('🖼️ Adding logo to PDF at position (15, 8)');
      doc.addImage(logoBase64, 'PNG', 15, 8, 30, 30);
      console.log('✅ Logo added successfully');
    } catch (e) {
      console.error('❌ Could not add logo to PDF:', e);
    }
  } else {
    console.warn('⚠️ Logo not loaded, skipping');
  }
  
  // Title (offset to account for logo)
  const titleX = logoBase64 ? 50 : 20;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADO DE CUENTA', titleX, 22);
  
  // Subtitle
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('CC-AQI • Flight Operations', titleX, 32);
  
  // Date
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, pageWidth - 20, 22, { align: 'right' });
  
  // Date range if provided
  if (data.dateRange?.start || data.dateRange?.end) {
    const rangeText = `Período: ${data.dateRange.start || 'Inicio'} - ${data.dateRange.end || 'Actual'}`;
    doc.text(rangeText, pageWidth - 20, 32, { align: 'right' });
  }

  // === CLIENT INFO BOX ===
  doc.setFillColor(248, 250, 252); // #F8FAFC slate-50
  doc.roundedRect(15, 52, pageWidth - 30, 28, 3, 3, 'F');
  
  doc.setTextColor(15, 23, 42); // #0F172A slate-900
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 22, 64);
  doc.text(data.clientName, 52, 64);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // #64748B slate-500
  doc.text(`Código: ${data.clientCode}`, 22, 73);

  // === SUMMARY CARDS ===
  const cardY = 88;
  const cardHeight = 30;
  const cardWidth = (pageWidth - 40) / 4;
  const cardGap = 5;

  const summaryItems = [
    { label: 'Total Vuelos', value: data.totalFlights.toString(), color: '#2563EB' }, // blue-600
    { label: 'Horas Voladas', value: `${data.totalHours.toFixed(1)} hrs`, color: '#059669' }, // emerald-600
    { label: 'Total Gastado', value: formatCurrency(data.totalSpent), color: '#D97706' }, // amber-600
    { label: 'Balance', value: formatCurrency(data.balance), color: data.balance >= 0 ? '#059669' : '#DC2626' }, // emerald-600 / red-600
  ];

  summaryItems.forEach((item, i) => {
    const x = 15 + i * (cardWidth + cardGap);
    
    // Card background
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'F');
    
    // Top color bar
    const rgb = hexToRgb(item.color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(x, cardY, cardWidth, 3, 'F');
    
    // Label
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, x + cardWidth / 2, cardY + 12, { align: 'center' });
    
    // Value
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, x + cardWidth / 2, cardY + 23, { align: 'center' });
  });

  // === FINANCIAL SUMMARY ===
  let currentY = cardY + cardHeight + 15;
  
  doc.setTextColor(15, 23, 42); // #0F172A slate-900
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen Financiero', 15, currentY);
  currentY += 8;
  
  // Financial details table
  const financialData = [
    ['Total Depósitos', formatCurrency(data.totalDeposits)],
    ['Crédito Combustible', formatCurrency(data.totalFuel)],
    ['Total Consumido', formatCurrency(data.totalSpent)],
    ['Balance Actual', formatCurrency(data.balance)],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [],
    body: financialData,
    theme: 'plain',
    margin: { left: 15, right: 15 },
    styles: {
      fontSize: 10,
      cellPadding: 4,
    },
    columnStyles: {
      0: { fontStyle: 'normal', textColor: [100, 116, 139] },
      1: { fontStyle: 'bold', halign: 'right', textColor: [30, 41, 59] },
    },
    tableWidth: 100,
  });

  // === DEPOSITS TABLE ===
  currentY = (doc as any).lastAutoTable?.finalY + 15 || currentY + 50;
  
  if (data.deposits.length > 0) {
    doc.setTextColor(15, 23, 42); // #0F172A slate-900
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Depósitos (${data.deposits.length})`, 15, currentY);
    currentY += 5;

    const depositRows = data.deposits.map(d => [
      d.fecha,
      d.descripcion || '-',
      formatCurrency(d.monto),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Fecha', 'Descripción', 'Monto']],
      body: depositRows,
      theme: 'striped',
      margin: { left: 15, right: 15 },
      headStyles: {
        fillColor: [5, 150, 105], // #059669 emerald-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // #F8FAFC slate-50
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35, halign: 'right' },
      },
    });
    
    currentY = (doc as any).lastAutoTable?.finalY + 10 || currentY + 50;
  }

  // === FUEL CREDITS TABLE ===
  if (data.fuelCredits.length > 0) {
    // Check if we need a new page
    if (currentY > pageHeight - 80) {
      doc.addPage();
      currentY = 20;
    }

    doc.setTextColor(15, 23, 42); // #0F172A slate-900
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Créditos de Combustible (${data.fuelCredits.length})`, 15, currentY);
    currentY += 5;

    const fuelRows = data.fuelCredits.map(f => [
      f.fecha,
      f.descripcion || '-',
      formatCurrency(f.monto),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Fecha', 'Litros', 'Monto']],
      body: fuelRows,
      theme: 'striped',
      margin: { left: 15, right: 15 },
      headStyles: {
        fillColor: [217, 119, 6], // #D97706 amber-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
      },
      alternateRowStyles: {
        fillColor: [254, 252, 232], // amber-50
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35, halign: 'right' },
      },
    });
    
    currentY = (doc as any).lastAutoTable?.finalY + 10 || currentY + 50;
  }

  // === FLIGHTS TABLE ===
  // Check if we need a new page
  if (currentY > pageHeight - 80) {
    doc.addPage();
    currentY = 20;
  }
  
  doc.setTextColor(15, 23, 42); // #0F172A slate-900
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Detalle de Vuelos (${data.flights.length})`, 15, currentY);
  currentY += 5;

  if (data.flights.length > 0) {
    const flightRows = data.flights.map(f => {
      const horas = Number(f.diff_hobbs || 0);
      const nov25 = new Date('2025-11-25');
      const flightDate = new Date(f.fecha);
      let avion = 0;
      let instructor = 0;
      if ((f.tarifa != null) || (f.instructor_rate != null)) {
        const rate = Number(f.tarifa || 0);
        const ir = Number(f.instructor_rate || 0);
        avion = horas * rate;
        instructor = horas * ir;
      } else if (flightDate < nov25 && f.costo) {
        // Vuelos antiguos: todo el costo se considera Avión
        avion = Number(f.costo);
        instructor = 0;
      } else if (f.costo) {
        // Fallback si no hay tarifas guardadas
        avion = Number(f.costo);
      }

      return [
        formatDate(f.fecha),
        horas ? `${horas.toFixed(1)} hrs` : '-',
        avion ? formatCurrency(avion) : '-',
        instructor ? formatCurrency(instructor) : '-',
        f.costo ? formatCurrency(f.costo) : '-',
        (f.detalle || '-').substring(0, 40),
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Fecha', 'Horas', 'Avión', 'Instructor/SP', 'Costo', 'Detalle']],
      body: flightRows,
      theme: 'striped',
      margin: { left: 15, right: 15 },
      headStyles: {
        fillColor: [37, 99, 235], // #2563EB blue-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // #F8FAFC slate-50
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 'auto' },
      },
    });
  }

  // === FOOTER WITH BANK DETAILS ===
  // Get the last page
  const totalPages = doc.internal.pages.length - 1;
  doc.setPage(totalPages);
  
  const lastY = (doc as any).lastAutoTable?.finalY || currentY + 50;
  let footerY = Math.max(lastY + 20, pageHeight - 40);
  
  // If footer would overflow, add new page
  if (footerY > pageHeight - 10) {
    doc.addPage();
    footerY = pageHeight - 40;
  }
  
  // Separator line
  doc.setDrawColor(203, 213, 225);
  doc.line(15, footerY - 5, pageWidth - 15, footerY - 5);
  
  // Bank details section
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, footerY, pageWidth - 30, 30, 2, 2, 'F');
  
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS PARA TRANSFERENCIA:', 20, footerY + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const bankInfo = [
    'SANTIAGO NICOLAS VARAS SAAVEDRA • RUT: 18.166.515-7',
    'Cuenta Corriente Nº 0-000-75-79256-5 • Banco Santander',
    'Email: SANTVARAS92@GMAIL.COM',
  ];
  
  bankInfo.forEach((line, i) => {
    doc.text(line, 20, footerY + 15 + (i * 5));
  });
  
  // Footer text on all pages
  const pagesCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pagesCount; i++) {
    doc.setPage(i);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text(`CC-AQI Flight Operations • Página ${i} de ${pagesCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  // Save the PDF
  const fileName = `Estado_Cuenta_${data.clientCode}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// Helper function to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 0, b: 0 };
}
