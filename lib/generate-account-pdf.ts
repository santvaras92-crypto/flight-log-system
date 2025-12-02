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
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Load logo
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64('/LOGO_BLANCO.png');
  } catch (e) {
    console.error('Could not load logo:', e);
  }
  
  // Modern color palette inspired by shadcn/ui
  const colors = {
    slate950: [2, 6, 23] as [number, number, number],        // #020617 - Header background
    slate900: [15, 23, 42] as [number, number, number],      // #0F172A - Dark elements
    slate800: [30, 41, 59] as [number, number, number],      // #1E293B - Secondary dark
    white: [255, 255, 255] as [number, number, number],
    zinc50: [250, 250, 250] as [number, number, number],     // #FAFAFA - Light background
    zinc100: [244, 244, 245] as [number, number, number],    // #F4F4F5 - Card background
    zinc200: [228, 228, 231] as [number, number, number],    // #E4E4E7 - Border
    zinc700: [63, 63, 70] as [number, number, number],       // #3F3F46 - Primary text
    zinc500: [113, 113, 122] as [number, number, number],    // #71717A - Secondary text
    blue500: [59, 130, 246] as [number, number, number],     // #3B82F6 - Primary blue
    blue600: [37, 99, 235] as [number, number, number],      // #2563EB - Blue accent
    emerald600: [5, 150, 105] as [number, number, number],   // #059669 - Success green
    rose600: [225, 29, 72] as [number, number, number],      // #E11D48 - Danger red
    amber600: [217, 119, 6] as [number, number, number],     // #D97706 - Warning amber
  };
  
  // Helper functions
  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;
  const formatDate = (date: string | Date) => {
    if (typeof date === 'string' && date.includes('-') && date.length <= 12) {
      return date;
    }
    const d = new Date(date);
    return d.toLocaleDateString('es-CL');
  };

  // === BLUE HEADER - CC-AQI FLIGHT OPERATIONS ===
  // Blue background matching screenshot (rgb(67, 97, 238))
  const headerBlue = [67, 97, 238] as [number, number, number];
  doc.setFillColor(...headerBlue);
  doc.rect(0, 0, pageWidth, 28, 'F');
  
  // Add logo (white version)
  if (logoBase64) {
    try {
      const logoWidth = 30;
      const logoHeight = 3.9;
      doc.addImage(logoBase64, 'PNG', 15, 12, logoWidth, logoHeight);
    } catch (e) {
      console.error('Could not add logo to PDF:', e);
    }
  }
  
  // CC-AQI title - white text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('CC-AQI', 52, 16);
  
  // FLIGHT OPERATIONS subtitle
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  // Manual letter spacing by splitting characters
  const subtitle = 'F L I G H T   O P E R A T I O N S';
  doc.text(subtitle, 52, 21);
  
  // Date on the right (white text)
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, pageWidth - 15, 14, { align: 'right' });
  
  // Date range if provided
  if (data.dateRange?.start || data.dateRange?.end) {
    const rangeText = `Período: ${data.dateRange.start || 'Inicio'} - ${data.dateRange.end || 'Actual'}`;
    doc.text(rangeText, pageWidth - 15, 20, { align: 'right' });
  }

  // === ESTADO DE CUENTA TITLE ===
  doc.setTextColor(...colors.zinc700);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Estado de Cuenta', 15, 42);

  // === CLIENT INFO SECTION ===
  // Client name - prominent
  doc.setTextColor(...colors.zinc700);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 15, 54);
  doc.text(data.clientName, 37, 54);
  
  // Client code - smaller, gray
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.zinc500);
  doc.text(`Código: ${data.clientCode}`, 15, 62);

  // === KEY METRICS CARDS - DASHBOARD STYLE ===
  const cardY = 70;
  const cardHeight = 32;
  const cardWidth = (pageWidth - 40) / 4;
  const cardGap = 3;

  const summaryItems = [
    { label: 'Total Flights', value: data.totalFlights.toString(), color: colors.blue600, borderColor: colors.blue600 },
    { label: 'Total Hours', value: `${data.totalHours.toFixed(1)}`, color: colors.emerald600, borderColor: colors.emerald600 },
    { label: 'Total Spent', value: formatCurrency(data.totalSpent), color: colors.amber600, borderColor: colors.amber600 },
    { label: 'Balance', value: formatCurrency(data.balance), color: data.balance >= 0 ? colors.emerald600 : colors.rose600, borderColor: data.balance >= 0 ? colors.emerald600 : colors.rose600 },
  ];

  summaryItems.forEach((item, i) => {
    const x = 15 + i * (cardWidth + cardGap);
    
    // Card background - white with colored border (matching dashboard)
    doc.setDrawColor(...item.borderColor);
    doc.setFillColor(...colors.white);
    doc.setLineWidth(1.5);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 3, 3, 'FD');
    
    // Label - small gray text
    doc.setTextColor(...colors.zinc500);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, x + 6, cardY + 8);
    
    // Value - large colored text
    doc.setTextColor(...item.color);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, x + 6, cardY + 22);
  });

  // === FINANCIAL SUMMARY - CLEAN TABLE ===
  let currentY = cardY + cardHeight + 15;
  
  // Section title with subtle underline
  doc.setTextColor(...colors.zinc700);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN FINANCIERO', 15, currentY);
  
  doc.setDrawColor(...colors.zinc200);
  doc.setLineWidth(0.3);
  doc.line(15, currentY + 2, 80, currentY + 2);
  currentY += 8;
  
  // Financial details table - professional styling
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
      fontSize: 9,
      cellPadding: 3,
      lineColor: colors.zinc200,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { 
        fontStyle: 'normal', 
        textColor: colors.zinc500,
        cellWidth: 60,
      },
      1: { 
        fontStyle: 'bold', 
        halign: 'right', 
        textColor: colors.zinc700,
        cellWidth: 40,
      },
    },
    tableWidth: 100,
    didParseCell: function(data) {
      // Add border to last row (balance)
      if (data.row.index === 3) {
        data.cell.styles.lineWidth = { bottom: 0.5 };
        data.cell.styles.fontStyle = 'bold';
      }
      // Color code amounts
      if (data.column.index === 1) {
        if (data.row.index === 0) {
          data.cell.styles.textColor = colors.amber600; // Deposits - yellow
        } else if (data.row.index === 1 || data.row.index === 2) {
          data.cell.styles.textColor = colors.rose600; // Fuel/Spent - red
        } else if (data.row.index === 3) {
          // Balance row - check the actual value from financialData
          const balanceValue = financialData[3][1];
          const isNegative = balanceValue.includes('-');
          data.cell.styles.textColor = isNegative ? colors.rose600 : colors.emerald600;
        }
      }
    },
  });

  // === DEPOSITS TABLE - PROFESSIONAL DESIGN ===
  currentY = (doc as any).lastAutoTable?.finalY + 15 || currentY + 50;
  
  if (data.deposits.length > 0) {
    // Section title
    doc.setTextColor(...colors.zinc700);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`DEPÓSITOS (${data.deposits.length})`, 15, currentY);
    
    doc.setDrawColor(...colors.zinc200);
    doc.setLineWidth(0.3);
    doc.line(15, currentY + 2, 80, currentY + 2);
    currentY += 5;

    const depositRows = data.deposits.map(d => [
      formatDate(d.fecha),
      d.descripcion || '-',
      formatCurrency(d.monto),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Fecha', 'Descripción', 'Monto']],
      body: depositRows,
      theme: 'grid',
      margin: { left: 15, right: 15 },
      headStyles: {
        fillColor: colors.amber600,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.zinc700,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: colors.zinc50,
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: colors.emerald600 },
      },
      styles: {
        lineColor: colors.zinc200,
        lineWidth: 0.1,
      },
    });
    
    currentY = (doc as any).lastAutoTable?.finalY + 10 || currentY + 50;
  }

  // === FUEL CREDITS TABLE - PROFESSIONAL DESIGN ===
  if (data.fuelCredits.length > 0) {
    // Check if we need a new page
    if (currentY > pageHeight - 80) {
      doc.addPage();
      currentY = 20;
    }

    // Section title
    doc.setTextColor(...colors.zinc700);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`CRÉDITOS DE COMBUSTIBLE (${data.fuelCredits.length})`, 15, currentY);
    
    doc.setDrawColor(...colors.zinc200);
    doc.setLineWidth(0.3);
    doc.line(15, currentY + 2, 110, currentY + 2);
    currentY += 5;

    const fuelRows = data.fuelCredits.map(f => [
      formatDate(f.fecha),
      f.descripcion || '-',
      formatCurrency(f.monto),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Fecha', 'Litros', 'Monto']],
      body: fuelRows,
      theme: 'grid',
      margin: { left: 15, right: 15 },
      headStyles: {
        fillColor: colors.rose600,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.zinc700,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: colors.zinc50,
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: colors.rose600 },
      },
      styles: {
        lineColor: colors.zinc200,
        lineWidth: 0.1,
      },
    });
    
    currentY = (doc as any).lastAutoTable?.finalY + 10 || currentY + 50;
  }

  // === FLIGHTS TABLE - PROFESSIONAL DESIGN ===
  // Check if we need a new page
  if (currentY > pageHeight - 80) {
    doc.addPage();
    currentY = 20;
  }
  
  // Section title
  doc.setTextColor(...colors.zinc700);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`DETALLE DE VUELOS (${data.flights.length})`, 15, currentY);
  
  doc.setDrawColor(...colors.zinc200);
  doc.setLineWidth(0.3);
  doc.line(15, currentY + 2, 85, currentY + 2);
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
        avion = Number(f.costo);
        instructor = 0;
      } else if (f.costo) {
        avion = Number(f.costo);
      }

      return [
        formatDate(f.fecha),
        horas ? `${horas.toFixed(1)}` : '-',
        avion ? formatCurrency(avion) : '-',
        instructor ? formatCurrency(instructor) : '-',
        f.costo ? formatCurrency(f.costo) : '-',
        (f.detalle || '-').substring(0, 35),
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Fecha', 'Horas', 'Avión', 'Instructor/SP', 'Total', 'Detalle']],
      body: flightRows,
      theme: 'grid',
      margin: { left: 15, right: 15 },
      headStyles: {
        fillColor: colors.blue600,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: colors.zinc700,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: colors.zinc50,
      },
      columnStyles: {
        0: { cellWidth: 24, halign: 'left' },
        1: { cellWidth: 16, halign: 'right' },
        2: { cellWidth: 26, halign: 'right', fontStyle: 'normal', textColor: colors.blue600 },
        3: { cellWidth: 28, halign: 'right', fontStyle: 'normal', textColor: colors.blue600 },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: colors.blue600 },
        5: { cellWidth: 'auto', halign: 'left' },
      },
      styles: {
        lineColor: colors.zinc200,
        lineWidth: 0.1,
      },
    });
  }

  // === PROFESSIONAL FOOTER WITH BANK DETAILS ===
  const totalPages = doc.internal.pages.length - 1;
  doc.setPage(totalPages);
  
  const lastY = (doc as any).lastAutoTable?.finalY || currentY + 50;
  let footerY = Math.max(lastY + 20, pageHeight - 50);
  
  // If footer would overflow, add new page
  if (footerY > pageHeight - 15) {
    doc.addPage();
    footerY = 20;
  }
  
  // Separator line - elegant and thin
  doc.setDrawColor(...colors.zinc200);
  doc.setLineWidth(0.5);
  doc.line(15, footerY - 5, pageWidth - 15, footerY - 5);
  
  // Bank details section - clean box
  doc.setDrawColor(...colors.zinc200);
  doc.setFillColor(...colors.zinc50);
  doc.setLineWidth(0.3);
  doc.roundedRect(15, footerY, pageWidth - 30, 35, 2, 2, 'FD');
  
  // Title for bank section
  doc.setTextColor(...colors.zinc700);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMACIÓN PARA TRANSFERENCIAS', 20, footerY + 7);
  
  // Bank details - clean layout
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.zinc500);
  
  const bankInfo = [
    'Titular: SANTIAGO NICOLAS VARAS SAAVEDRA',
    'RUT: 18.166.515-7',
    'Banco Santander - Cuenta Corriente N° 0-000-75-79256-5',
    'Email: santvaras92@gmail.com',
  ];
  
  let infoY = footerY + 14;
  bankInfo.forEach((line) => {
    doc.text(line, 20, infoY);
    infoY += 5;
  });
  
  // Footer with page numbers on all pages - professional style
  const pagesCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pagesCount; i++) {
    doc.setPage(i);
    
    // Footer background bar
    doc.setFillColor(...colors.slate950);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    
    // Footer text
    doc.setTextColor(...colors.white);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('CC-AQI Flight Operations', 15, pageHeight - 4);
    doc.text(`Página ${i} de ${pagesCount}`, pageWidth - 15, pageHeight - 4, { align: 'right' });
  }

  // Save the PDF with professional filename
  const fileName = `Estado_Cuenta_${data.clientCode}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// Helper function to convert hex to RGB (kept for compatibility)
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 0, b: 0 };
}
