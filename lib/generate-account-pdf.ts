// rebuild 1736371200
// Railway rebuild fix - Jan 8, 2026
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
  copiloto?: string;
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

// Helper function to load font as base64
async function loadFontAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function generateAccountStatementPDF(data: AccountData): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Load custom fonts (Avenir Next)
  try {
    const [avenirBold, avenirRegular] = await Promise.all([
      loadFontAsBase64('/fonts/Avenir_Next_Bold.ttf'),
      loadFontAsBase64('/fonts/Avenir_Next_Regular.ttf'),
    ]);
    
    doc.addFileToVFS('AvenirNext-Bold.ttf', avenirBold);
    doc.addFileToVFS('AvenirNext-Regular.ttf', avenirRegular);
    doc.addFont('AvenirNext-Bold.ttf', 'AvenirNext', 'bold');
    doc.addFont('AvenirNext-Regular.ttf', 'AvenirNext', 'normal');
  } catch (e) {
    console.error('Could not load Avenir fonts, falling back to Helvetica:', e);
  }
  
  // Load logo
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64('/LOGO_TAGLINE.png');
  } catch (e) {
    console.error('Could not load logo:', e);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AEROSTRATUS COLOR PALETTE - Extracted from logo
  // ═══════════════════════════════════════════════════════════════════════════
  const colors = {
    // Brand colors from logo
    navy: [30, 58, 110] as [number, number, number],              // #1e3a6e - AeroStratus blue
    silver: [140, 147, 154] as [number, number, number],          // #8c939a - "Stratus" gray
    grayDark: [90, 96, 104] as [number, number, number],          // #5a6068 - Tagline gray
    
    // Neutrals
    white: [255, 255, 255] as [number, number, number],           // #ffffff
    offWhite: [244, 245, 246] as [number, number, number],        // #f4f5f6 - Card backgrounds
    lightGray: [230, 232, 234] as [number, number, number],       // #e6e8ea - Borders
    
    // Typography
    textPrimary: [45, 52, 54] as [number, number, number],        // #2d3436 - Main text
    textSecondary: [140, 147, 154] as [number, number, number],   // #8c939a - Secondary text
    
    // Semantic
    credit: [26, 95, 42] as [number, number, number],             // #1a5f2a - Green for credits
    debit: [139, 26, 26] as [number, number, number],             // #8b1a1a - Red for debits
  };
  
  // Helper functions
  const formatCurrency = (value: number) => {
    const formatted = Math.abs(Math.round(value)).toLocaleString('es-CL');
    return value < 0 ? `-$${formatted}` : `$${formatted}`;
  };
  
  const formatDate = (date: string | Date) => {
    if (typeof date === 'string' && date.includes('-') && date.length <= 12) {
      return date;
    }
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const month = months[d.getMonth()];
    const year = d.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER - Clean white background with logo on right
  // ═══════════════════════════════════════════════════════════════════════════
  let y = 14;
  
  // Title - Left aligned with letter spacing
  doc.setTextColor(...colors.navy);
  doc.setFontSize(18);
  doc.setFont('AvenirNext', 'bold');
  doc.text('P I L O T   A C C O U N T', 14, y);
  
  doc.setFontSize(18);
  doc.text('S T A T E M E N T', 14, y + 8);
  
  // CC-AQI subtitle
  doc.setTextColor(...colors.silver);
  doc.setFontSize(11);
  doc.setFont('AvenirNext', 'normal');
  doc.text('CC-AQI', 14, y + 16);
  
  // Period
  doc.setTextColor(...colors.grayDark);
  doc.setFontSize(9);
  const periodText = data.dateRange?.start && data.dateRange?.end 
    ? `Período: ${data.dateRange.start} → ${data.dateRange.end}`
    : `Generado: ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  doc.text(periodText, 14, y + 24);
  
  // Logo - Right aligned (50mm x 11mm compact)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', pageWidth - 64, y - 2, 50, 11);
    } catch (e) {
      console.error('Could not add logo to PDF:', e);
    }
  }
  
  // Separator line
  y = 44;
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  // ═══════════════════════════════════════════════════════════════════════════
  // PILOT IDENTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  y = 52;
  
  doc.setFillColor(...colors.offWhite);
  doc.setDrawColor(...colors.lightGray);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageWidth - 28, 16, 2, 2, 'FD');
  
  // Code
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'bold');
  doc.text('CÓDIGO', 20, y + 5);
  
  doc.setTextColor(...colors.navy);
  doc.setFontSize(12);
  doc.setFont('AvenirNext', 'bold');
  doc.text(data.clientCode, 20, y + 12);
  
  // Name
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'bold');
  doc.text('NOMBRE', 55, y + 5);
  
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(12);
  doc.setFont('AvenirNext', 'bold');
  doc.text(data.clientName, 55, y + 12);
  
  // Balance
  const balanceColor = data.balance >= 0 ? colors.credit : colors.debit;
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'bold');
  doc.text('BALANCE', pageWidth - 50, y + 5);
  
  doc.setTextColor(...balanceColor);
  doc.setFontSize(12);
  doc.setFont('AvenirNext', 'bold');
  doc.text(formatCurrency(data.balance), pageWidth - 20, y + 12, { align: 'right' });

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS - 4 Cards
  // ═══════════════════════════════════════════════════════════════════════════
  y = 76;
  const cardWidth = (pageWidth - 38) / 4;
  const cardHeight = 24;
  const cardGap = 3;
  
  const metrics = [
    { label: 'VUELOS', value: data.totalFlights.toString() },
    { label: 'HORAS', value: data.totalHours.toFixed(1) },
    { label: 'CARGOS', value: formatCurrency(data.totalSpent), isDebit: true },
    { label: 'DEPÓSITOS', value: formatCurrency(data.totalDeposits + data.totalFuel), isCredit: true },
  ];
  
  metrics.forEach((metric, i) => {
    const x = 14 + i * (cardWidth + cardGap);
    
    // Card background
    doc.setFillColor(...colors.offWhite);
    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
    
    // Label
    doc.setTextColor(...colors.silver);
    doc.setFontSize(7);
    doc.setFont('AvenirNext', 'bold');
    doc.text(metric.label, x + cardWidth / 2, y + 8, { align: 'center' });
    
    // Separator
    doc.setDrawColor(...colors.lightGray);
    doc.line(x + 6, y + 11, x + cardWidth - 6, y + 11);
    
    // Value
    let valueColor = colors.navy;
    if (metric.isDebit) valueColor = colors.debit;
    if (metric.isCredit) valueColor = colors.credit;
    
    doc.setTextColor(...valueColor);
    doc.setFontSize(11);
    doc.setFont('AvenirNext', 'bold');
    doc.text(metric.value, x + cardWidth / 2, y + 19, { align: 'center' });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SEPARATOR
  // ═══════════════════════════════════════════════════════════════════════════
  y = 108;
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIGHT DETAILS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  y = 116;
  
  // Section title
  doc.setTextColor(...colors.navy);
  doc.setFontSize(10);
  doc.setFont('AvenirNext', 'bold');
  doc.text('DETALLE DE VUELOS', 14, y);
  
  doc.setTextColor(...colors.silver);
  doc.setFontSize(8);
  doc.setFont('AvenirNext', 'normal');
  doc.text(`${data.flights.length} registros`, pageWidth - 14, y, { align: 'right' });
  
  y += 6;

  if (data.flights.length > 0) {
    const flightRows = data.flights.map(f => {
      const horas = Number(f.diff_hobbs || 0);
      const airplaneRate = f.tarifa ? formatCurrency(f.tarifa * horas) : '-';
      const instructorRate = f.instructor_rate ? formatCurrency(f.instructor_rate * horas) : '-';
      const detalle = (f.detalle || '-').substring(0, 25);
      return [
        formatDate(f.fecha),
        horas ? horas.toFixed(1) : '-',
        airplaneRate,
        instructorRate,
        formatCurrency(f.costo),
        detalle,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'HRS', 'AVIÓN', 'INSTRUCTOR', 'TOTAL', 'DETALLE']],
      body: flightRows,
      foot: [['TOTAL', data.totalHours.toFixed(1), '', '', formatCurrency(data.totalSpent), '']],
      theme: 'plain',
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: colors.white,
        textColor: colors.silver,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'left',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.textPrimary,
        cellPadding: 2.5,
        lineColor: colors.lightGray,
        lineWidth: 0.1,
      },
      footStyles: {
        fillColor: colors.navy,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: colors.offWhite,
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'left' },
        1: { cellWidth: 14, halign: 'center', textColor: colors.navy },
        2: { cellWidth: 24, halign: 'right' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: colors.debit },
        5: { cellWidth: 'auto', halign: 'left', textColor: colors.grayDark, fontSize: 7 },
      },
    });
    
    y = (doc as any).lastAutoTable?.finalY + 10 || y + 50;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPOSITS & FUEL CREDITS - Side by side
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.deposits.length > 0 || data.fuelCredits.length > 0) {
    if (y > pageHeight - 70) {
      doc.addPage();
      y = 20;
    }
    
    // Separator
    doc.setDrawColor(...colors.silver);
    doc.setLineWidth(0.3);
    doc.line(14, y - 4, pageWidth - 14, y - 4);
    
    const halfWidth = (pageWidth - 32) / 2;
    
    // Left: Deposits
    if (data.deposits.length > 0) {
      doc.setTextColor(...colors.navy);
      doc.setFontSize(9);
      doc.setFont('AvenirNext', 'bold');
      doc.text('DEPÓSITOS', 14, y + 4);
      
      const depositRows = data.deposits.map(d => [
        formatDate(d.fecha),
        `+${formatCurrency(d.monto)}`,
      ]);

      autoTable(doc, {
        startY: y + 8,
        head: [['FECHA', 'MONTO']],
        body: depositRows,
        foot: [['TOTAL', `+${formatCurrency(data.totalDeposits)}`]],
        theme: 'plain',
        margin: { left: 14, right: pageWidth / 2 + 4 },
        tableWidth: halfWidth,
        headStyles: {
          fillColor: colors.white,
          textColor: colors.silver,
          fontStyle: 'bold',
          fontSize: 7,
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.textPrimary,
          cellPadding: 2,
          lineColor: colors.lightGray,
          lineWidth: 0.1,
        },
        footStyles: {
          fillColor: colors.credit,
          textColor: colors.white,
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: colors.offWhite,
        },
        columnStyles: {
          0: { cellWidth: 28, halign: 'left' },
          1: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', textColor: colors.credit },
        },
      });
    }
    
    // Right: Fuel Credits
    if (data.fuelCredits.length > 0) {
      doc.setTextColor(...colors.navy);
      doc.setFontSize(9);
      doc.setFont('AvenirNext', 'bold');
      doc.text('CRÉDITOS COMBUSTIBLE', pageWidth / 2 + 4, y + 4);
      
      const fuelRows = data.fuelCredits.map(f => [
        formatDate(f.fecha),
        `+${formatCurrency(f.monto)}`,
      ]);

      autoTable(doc, {
        startY: y + 8,
        head: [['FECHA', 'MONTO']],
        body: fuelRows,
        foot: [['TOTAL', `+${formatCurrency(data.totalFuel)}`]],
        theme: 'plain',
        margin: { left: pageWidth / 2 + 4, right: 14 },
        tableWidth: halfWidth,
        headStyles: {
          fillColor: colors.white,
          textColor: colors.silver,
          fontStyle: 'bold',
          fontSize: 7,
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.textPrimary,
          cellPadding: 2,
          lineColor: colors.lightGray,
          lineWidth: 0.1,
        },
        footStyles: {
          fillColor: colors.navy,
          textColor: colors.white,
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: colors.offWhite,
        },
        columnStyles: {
          0: { cellWidth: 28, halign: 'left' },
          1: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', textColor: colors.credit },
        },
      });
    }
    
    const depositsY = (doc as any).lastAutoTable?.finalY || y + 30;
    y = depositsY + 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BANK INFORMATION
  // ═══════════════════════════════════════════════════════════════════════════
  const totalPages = doc.internal.pages.length - 1;
  doc.setPage(totalPages);
  
  const lastY = (doc as any).lastAutoTable?.finalY || y;
  let bankY = Math.max(lastY + 15, pageHeight - 48);
  
  if (bankY > pageHeight - 30) {
    doc.addPage();
    bankY = 20;
  }
  
  // Separator
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.5);
  doc.line(14, bankY - 6, pageWidth - 14, bankY - 6);
  
  // Bank info card
  doc.setFillColor(...colors.offWhite);
  doc.setDrawColor(...colors.lightGray);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, bankY, pageWidth - 28, 28, 2, 2, 'FD');
  
  // Title
  doc.setTextColor(...colors.navy);
  doc.setFontSize(8);
  doc.setFont('AvenirNext', 'bold');
  doc.text('INFORMACIÓN BANCARIA', 20, bankY + 6);
  
  // Details - two columns
  const col1 = 20;
  const col2 = pageWidth / 2 + 10;
  let detailY = bankY + 12;
  
  // Left column
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'normal');
  doc.text('Titular', col1, detailY);
  doc.text('RUT', col1, detailY + 8);
  
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(8);
  doc.setFont('AvenirNext', 'bold');
  doc.text('SANTIAGO NICOLÁS VARAS SAAVEDRA', col1, detailY + 4);
  doc.text('18.166.515-7', col1, detailY + 12);
  
  // Right column
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'normal');
  doc.text('Banco', col2, detailY);
  doc.text('Email', col2, detailY + 8);
  
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(8);
  doc.setFont('AvenirNext', 'bold');
  doc.text('Santander • Cta. Cte. 0-000-75-79256-5', col2, detailY + 4);
  doc.setFont('AvenirNext', 'normal');
  doc.text('santvaras92@gmail.com', col2, detailY + 12);

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════════
  const pagesCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pagesCount; i++) {
    doc.setPage(i);
    
    // Simple footer line
    doc.setDrawColor(...colors.silver);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    
    // Footer text
    doc.setTextColor(...colors.silver);
    doc.setFontSize(7);
    doc.setFont('AvenirNext', 'normal');
    doc.text('CC-AQI  •  AeroStratus Aviation Solutions  •  https://aerostratus.cl/', 14, pageHeight - 6);
    doc.text(`Página ${i} de ${pagesCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  // Save PDF
  const fileName = `Estado_Cuenta_${data.clientCode}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
// Force rebuild Wed Dec 10 16:53:17 -03 2025
