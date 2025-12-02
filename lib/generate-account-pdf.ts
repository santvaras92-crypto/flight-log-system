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
  
  // Aviation Corporate Color Palette
  const colors = {
    // Aviation Blues - Azules aeronáuticos profesionales
    aviationBlue900: [12, 34, 63] as [number, number, number],      // #0C223F - Más oscuro, headers principales
    aviationBlue800: [20, 52, 89] as [number, number, number],      // #143459 - Backgrounds premium
    aviationBlue700: [28, 71, 120] as [number, number, number],     // #1C4778 - Elementos destacados
    aviationBlue600: [37, 89, 152] as [number, number, number],     // #255998 - Primary interactive
    aviationBlue500: [67, 97, 238] as [number, number, number],     // #4361EE - Accent principal (header actual)
    
    // Neutrals - Grises corporativos
    gray900: [17, 24, 39] as [number, number, number],              // #111827 - Texto principal
    gray800: [31, 41, 55] as [number, number, number],              // #1F2937 - Texto secundario
    gray700: [55, 65, 81] as [number, number, number],              // #374151 - Texto suave
    gray600: [75, 85, 99] as [number, number, number],              // #4B5563 - Texto muted
    gray500: [107, 114, 128] as [number, number, number],           // #6B7280 - Labels
    gray400: [156, 163, 175] as [number, number, number],           // #9CA3AF - Borders suaves
    gray300: [209, 213, 219] as [number, number, number],           // #D1D5DB - Borders light
    gray200: [229, 231, 235] as [number, number, number],           // #E5E7EB - Backgrounds light
    gray100: [243, 244, 246] as [number, number, number],           // #F3F4F6 - Backgrounds muy light
    gray50: [249, 250, 251] as [number, number, number],            // #F9FAFB - Casi blanco
    
    // Accent Colors - Colores de estado
    success: [16, 185, 129] as [number, number, number],            // #10B981 - Verde success
    warning: [245, 158, 11] as [number, number, number],            // #F59E0B - Amarillo warning
    danger: [239, 68, 68] as [number, number, number],              // #EF4444 - Rojo danger
    info: [6, 182, 212] as [number, number, number],                // #06B6D4 - Cyan info
    
    // Base
    white: [255, 255, 255] as [number, number, number],
  };
  
  // Helper functions
  const formatCurrency = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
  const formatDate = (date: string | Date) => {
    if (typeof date === 'string' && date.includes('-') && date.length <= 12) {
      return date;
    }
    const d = new Date(date);
    return d.toLocaleDateString('en-US');
  };

  // === EXECUTIVE AVIATION HEADER ===
  // Navy blue background
  doc.setFillColor(...colors.aviationBlue900);
  doc.rect(0, 0, pageWidth, 38, 'F');
  
  // Subtle darker bottom accent (simulated gradient)
  doc.setFillColor(...colors.aviationBlue800);
  doc.rect(0, 34, pageWidth, 4, 'F');
  
  // Logo - premium positioning
  if (logoBase64) {
    try {
      const logoWidth = 32;
      const logoHeight = 4.2;
      doc.addImage(logoBase64, 'PNG', 18, 14.5, logoWidth, logoHeight);
    } catch (e) {
      console.error('Could not add logo to PDF:', e);
    }
  }
  
  // CC-AQI title - executive typography
  doc.setTextColor(...colors.white);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('CC-AQI', 56, 18);
  
  // FLIGHT OPERATIONS subtitle - elegant spacing
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const subtitle = 'F L I G H T   O P E R A T I O N S';
  doc.text(subtitle, 56, 24);
  
  // PILOT ACCOUNT STATEMENT - centered below
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PILOT ACCOUNT STATEMENT', pageWidth / 2, 32, { align: 'center' });
  
  // Metadata panel - clean and professional
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, pageWidth - 18, 16, { align: 'right' });
  
  if (data.dateRange?.start || data.dateRange?.end) {
    const rangeText = `Period: ${data.dateRange.start || 'Start'} - ${data.dateRange.end || 'Current'}`;
    doc.text(rangeText, pageWidth - 18, 22, { align: 'right' });
  }

  // === CLIENT INFO CARD - EXECUTIVE STYLE ===
  const clientCardY = 48;
  
  // Clean card with border
  doc.setDrawColor(...colors.gray300);
  doc.setFillColor(...colors.white);
  doc.setLineWidth(0.4);
  doc.roundedRect(18, clientCardY, pageWidth - 36, 18, 3, 3, 'FD');
  
  // Client info - centered layout
  doc.setTextColor(...colors.gray500);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Pilot:', 24, clientCardY + 8);
  
  doc.setTextColor(...colors.gray900);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(data.clientName, 24, clientCardY + 14);

  // === EXECUTIVE METRICS CARDS - PREMIUM DASHBOARD STYLE ===
  const cardY = 75;
  const cardHeight = 28;
  const cardWidth = (pageWidth - 42) / 4;
  const cardGap = 4;

  const summaryItems = [
    { label: 'Total Flights', value: data.totalFlights.toString(), color: colors.aviationBlue600, bgColor: colors.gray50 },
    { label: 'Total Hours', value: `${data.totalHours.toFixed(1)}h`, color: colors.info, bgColor: colors.gray50 },
    { label: 'Total Spent', value: formatCurrency(data.totalSpent), color: colors.warning, bgColor: colors.gray50 },
    { label: 'Balance', value: formatCurrency(data.balance), color: data.balance >= 0 ? colors.success : colors.danger, bgColor: colors.gray50 },
  ];

  summaryItems.forEach((item, i) => {
    const x = 18 + i * (cardWidth + cardGap);
    
    // Card background - light gray with border
    doc.setDrawColor(...colors.gray300);
    doc.setFillColor(...item.bgColor);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 4, 4, 'FD');
    
    // Top accent bar - colored
    doc.setFillColor(...item.color);
    doc.roundedRect(x, cardY, cardWidth, 3, 4, 4, 'F');
    
    // Label - uppercase, small, gray
    doc.setTextColor(...colors.gray500);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    const labelUpper = item.label.toUpperCase();
    doc.text(labelUpper, x + 5, cardY + 11);
    
    // Value - large, bold, colored
    doc.setTextColor(...item.color);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, x + 5, cardY + 21);
  });

  // === FINANCIAL SUMMARY - EXECUTIVE CARD ===
  let currentY = cardY + cardHeight + 18;
  
  // Section title - aviation style
  doc.setFillColor(...colors.aviationBlue900);
  doc.roundedRect(18, currentY, pageWidth - 36, 8, 2, 2, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('FINANCIAL SUMMARY', 24, currentY + 5.5);
  currentY += 13;
  
  // Financial details table - clean professional styling
  const financialData = [
    ['Total Deposits', formatCurrency(data.totalDeposits)],
    ['Fuel Credit', formatCurrency(data.totalFuel)],
    ['Total Spent', formatCurrency(data.totalSpent)],
    ['Current Balance', formatCurrency(data.balance)],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [],
    body: financialData,
    theme: 'plain',
    margin: { left: 18, right: 18 },
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: colors.gray300,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { 
        fontStyle: 'normal', 
        textColor: colors.gray600,
        cellWidth: 70,
      },
      1: { 
        fontStyle: 'bold', 
        halign: 'right', 
        textColor: colors.gray900,
        cellWidth: 50,
      },
    },
    tableWidth: 120,
    didParseCell: function(data) {
      // Highlight last row (balance)
      if (data.row.index === 3) {
        data.cell.styles.lineWidth = { top: 0.4, bottom: 0.4 };
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 10;
      }
      // Color code amounts with aviation palette
      if (data.column.index === 1) {
        if (data.row.index === 0) {
          data.cell.styles.textColor = colors.success; // Deposits - green
        } else if (data.row.index === 1 || data.row.index === 2) {
          data.cell.styles.textColor = colors.warning; // Fuel/Spent - warning
        } else if (data.row.index === 3) {
          const balanceValue = financialData[3][1];
          const isNegative = balanceValue.includes('-');
          data.cell.styles.textColor = isNegative ? colors.danger : colors.success;
        }
      }
    },
  });

  // === DEPOSITS TABLE - EXECUTIVE DESIGN ===
  currentY = (doc as any).lastAutoTable?.finalY + 18 || currentY + 50;
  
  if (data.deposits.length > 0) {
    // Section header - success green
    doc.setFillColor(...colors.success);
    doc.roundedRect(18, currentY, pageWidth - 36, 8, 2, 2, 'F');
    
    doc.setTextColor(...colors.white);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`DEPOSITS (${data.deposits.length})`, 24, currentY + 5.5);
    currentY += 12;

    const depositRows = data.deposits.map(d => [
      formatDate(d.fecha),
      d.descripcion || '-',
      formatCurrency(d.monto),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Description', 'Amount']],
      body: depositRows,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: {
        fillColor: colors.aviationBlue700,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.gray800,
        cellPadding: 4,
      },
      alternateRowStyles: {
        fillColor: colors.gray100,
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left', textColor: colors.gray600 },
        2: { cellWidth: 35, halign: 'right', fontStyle: 'bold', textColor: colors.success },
      },
      styles: {
        lineColor: colors.gray300,
        lineWidth: 0.2,
      },
    });
    
    currentY = (doc as any).lastAutoTable?.finalY + 12 || currentY + 50;
  }

  // === FUEL CREDITS TABLE - EXECUTIVE DESIGN ===
  if (data.fuelCredits.length > 0) {
    // Check if we need a new page
    if (currentY > pageHeight - 85) {
      doc.addPage();
      currentY = 24;
    }

    // Section header - warning orange
    doc.setFillColor(...colors.warning);
    doc.roundedRect(18, currentY, pageWidth - 36, 8, 2, 2, 'F');
    
    doc.setTextColor(...colors.white);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`FUEL CREDITS (${data.fuelCredits.length})`, 24, currentY + 5.5);
    currentY += 12;

    const fuelRows = data.fuelCredits.map(f => [
      formatDate(f.fecha),
      f.descripcion || '-',
      formatCurrency(f.monto),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Liters', 'Amount']],
      body: fuelRows,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: {
        fillColor: colors.aviationBlue700,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 5,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.gray800,
        cellPadding: 4,
      },
      alternateRowStyles: {
        fillColor: colors.gray100,
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left', textColor: colors.gray600 },
        2: { cellWidth: 35, halign: 'right', fontStyle: 'bold', textColor: colors.warning },
      },
      styles: {
        lineColor: colors.gray300,
        lineWidth: 0.2,
      },
    });
    
    currentY = (doc as any).lastAutoTable?.finalY + 12 || currentY + 50;
  }

  // === FLIGHTS TABLE - EXECUTIVE DESIGN ===
  // Check if we need a new page
  if (currentY > pageHeight - 85) {
    doc.addPage();
    currentY = 24;
  }
  
  // Section header - aviation blue primary
  doc.setFillColor(...colors.aviationBlue600);
  doc.roundedRect(18, currentY, pageWidth - 36, 8, 2, 2, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`FLIGHT DETAILS (${data.flights.length})`, 24, currentY + 5.5);
  currentY += 12;

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
      head: [['Date', 'Hours', 'Aircraft', 'Instructor/SP', 'Total', 'Details']],
      body: flightRows,
      theme: 'striped',
      margin: { left: 18, right: 18 },
      headStyles: {
        fillColor: colors.aviationBlue700,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 5,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: colors.gray800,
        cellPadding: 3.5,
      },
      alternateRowStyles: {
        fillColor: colors.gray100,
      },
      columnStyles: {
        0: { cellWidth: 24, halign: 'left' },
        1: { cellWidth: 16, halign: 'right', textColor: colors.info },
        2: { cellWidth: 26, halign: 'right', fontStyle: 'normal', textColor: colors.aviationBlue600 },
        3: { cellWidth: 28, halign: 'right', fontStyle: 'normal', textColor: colors.aviationBlue600 },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: colors.gray900 },
        5: { cellWidth: 'auto', halign: 'left', textColor: colors.gray600 },
      },
      styles: {
        lineColor: colors.gray300,
        lineWidth: 0.2,
      },
    });
  }

  // === EXECUTIVE FOOTER WITH BANK DETAILS ===
  const totalPages = doc.internal.pages.length - 1;
  doc.setPage(totalPages);
  
  const lastY = (doc as any).lastAutoTable?.finalY || currentY + 50;
  let footerY = Math.max(lastY + 22, pageHeight - 52);
  
  // If footer would overflow, add new page
  if (footerY > pageHeight - 18) {
    doc.addPage();
    footerY = 24;
  }
  
  // Separator line - elegant aviation blue
  doc.setDrawColor(...colors.aviationBlue600);
  doc.setLineWidth(0.6);
  doc.line(18, footerY - 6, pageWidth - 18, footerY - 6);
  
  // Bank details card - premium style
  doc.setDrawColor(...colors.gray300);
  doc.setFillColor(...colors.gray50);
  doc.setLineWidth(0.4);
  doc.roundedRect(18, footerY, pageWidth - 36, 36, 3, 3, 'FD');
  
  // Title for bank section with accent
  doc.setFillColor(...colors.aviationBlue700);
  doc.roundedRect(18, footerY, pageWidth - 36, 7, 3, 3, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('WIRE TRANSFER INFORMATION', 24, footerY + 4.5);
  
  // Bank details - clean professional layout
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.gray700);
  
  const bankInfo = [
    'Account Holder: SANTIAGO NICOLAS VARAS SAAVEDRA',
    'Tax ID (RUT): 18.166.515-7',
    'Banco Santander - Checking Account #: 0-000-75-79256-5',
    'Email: santvaras92@gmail.com',
  ];
  
  let infoY = footerY + 13;
  bankInfo.forEach((line) => {
    doc.text(line, 24, infoY);
    infoY += 5;
  });
  
  // Footer bar on all pages - aviation blue premium
  const pagesCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pagesCount; i++) {
    doc.setPage(i);
    
    // Footer background - aviation blue dark
    doc.setFillColor(...colors.aviationBlue800);
    doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
    
    // Footer text - white, elegant
    doc.setTextColor(...colors.white);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('CC-AQI Flight Operations', 18, pageHeight - 4);
    doc.text(`Page ${i} of ${pagesCount}`, pageWidth - 18, pageHeight - 4, { align: 'right' });
  }

  // Save the PDF with professional filename
  const fileName = `Account_Statement_${data.clientCode}_${new Date().toISOString().split('T')[0]}.pdf`;
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
