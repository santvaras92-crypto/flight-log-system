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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CORPORATE AVIATION COLOR PALETTE - Muted/Subdued tones for print
  // Based on: Lufthansa, NetJets, VistaJet, Executive Jet Management standards
  // ═══════════════════════════════════════════════════════════════════════════
  const colors = {
    // Primary Navy - Corporate Aviation Standard (matching dashboard header)
    navy: [30, 58, 138] as [number, number, number],              // #1e3a8a - Primary brand (darker)
    navyDark: [23, 37, 84] as [number, number, number],           // #172554 - Darker accent
    navyLight: [71, 85, 105] as [number, number, number],         // #475569 - Muted blue-gray
    
    // Executive Neutrals - High contrast for print
    white: [255, 255, 255] as [number, number, number],           // #FFFFFF
    offWhite: [248, 250, 252] as [number, number, number],        // #f8fafc - Subtle backgrounds
    platinum: [241, 245, 249] as [number, number, number],        // #f1f5f9 - Table alternates
    silver: [203, 213, 225] as [number, number, number],          // #cbd5e1 - Borders (slightly darker)
    
    // Typography - Maximum readability
    charcoal: [15, 23, 42] as [number, number, number],           // #0f172a - Primary text
    slate: [71, 85, 105] as [number, number, number],             // #475569 - Secondary text
    muted: [100, 116, 139] as [number, number, number],           // #64748b - Tertiary text (darker)
    
    // Semantic Colors - Muted/Subdued for professional look
    credit: [21, 128, 61] as [number, number, number],            // #15803d - Deposits/Credits (muted green)
    debit: [153, 27, 27] as [number, number, number],             // #991b1b - Charges/Negative (muted red)
    neutral: [30, 64, 175] as [number, number, number],           // #1e40af - Informational (muted blue)
    accent: [180, 138, 6] as [number, number, number],            // #b48a06 - Fuel/Highlights (muted gold)
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
  // HEADER - Corporate Aviation Style
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...colors.navy);
  doc.rect(0, 0, pageWidth, 32, 'F');
  
  // Subtle bottom accent line
  doc.setFillColor(...colors.navyDark);
  doc.rect(0, 30, pageWidth, 2, 'F');
  
  // Logo - Left aligned (original dimensions 32x4.2 for banner-style logo)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, 13, 32, 4.2);
    } catch (e) {
      console.error('Could not add logo to PDF:', e);
    }
  }
  
  // Title - Center
  doc.setTextColor(...colors.white);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PILOT ACCOUNT STATEMENT', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('CC-AQI  •  FLIGHT OPERATIONS', pageWidth / 2, 22, { align: 'center' });
  
  // Date - Right aligned
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }), pageWidth - 14, 15, { align: 'right' });
  if (data.dateRange?.start || data.dateRange?.end) {
    doc.text(`${data.dateRange.start || 'Inicio'} - ${data.dateRange.end || 'Actual'}`, pageWidth - 14, 21, { align: 'right' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PILOT IDENTIFICATION BAR
  // ═══════════════════════════════════════════════════════════════════════════
  let y = 40;
  
  doc.setFillColor(...colors.offWhite);
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, 'FD');
  
  doc.setTextColor(...colors.charcoal);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(data.clientName.toUpperCase(), 20, y + 9);
  
  doc.setTextColor(...colors.slate);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`ID: ${data.clientCode}`, pageWidth - 20, y + 9, { align: 'right' });

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS DASHBOARD - 4 Key Cards
  // ═══════════════════════════════════════════════════════════════════════════
  y = 60;
  const cardWidth = (pageWidth - 38) / 4;
  const cardHeight = 22;
  const cardGap = 3;
  
  const metrics = [
    { label: 'VUELOS', value: data.totalFlights.toString(), color: colors.neutral },
    { label: 'HORAS', value: data.totalHours.toFixed(1), color: colors.navyLight },
    { label: 'CARGOS', value: formatCurrency(data.totalSpent), color: colors.debit },
    { label: 'BALANCE', value: formatCurrency(data.balance), color: data.balance >= 0 ? colors.credit : colors.debit },
  ];
  
  metrics.forEach((metric, i) => {
    const x = 14 + i * (cardWidth + cardGap);
    
    // Card background
    doc.setFillColor(...colors.white);
    doc.setDrawColor(...colors.silver);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
    
    // Top color bar
    doc.setFillColor(...metric.color);
    doc.roundedRect(x, y, cardWidth, 3, 2, 2, 'F');
    doc.rect(x, y + 1.5, cardWidth, 1.5, 'F'); // Square off bottom of bar
    
    // Label
    doc.setTextColor(...colors.muted);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(metric.label, x + cardWidth / 2, y + 9, { align: 'center' });
    
    // Value
    doc.setTextColor(...metric.color);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(metric.value, x + cardWidth / 2, y + 17, { align: 'center' });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL SUMMARY - Credits vs Debits
  // ═══════════════════════════════════════════════════════════════════════════
  y = 90;
  const halfWidth = (pageWidth - 32) / 2;
  
  // Left: CRÉDITOS
  doc.setFillColor(...colors.white);
  doc.setDrawColor(...colors.silver);
  doc.roundedRect(14, y, halfWidth, 32, 2, 2, 'FD');
  
  doc.setFillColor(...colors.credit);
  doc.roundedRect(14, y, halfWidth, 7, 2, 2, 'F');
  doc.rect(14, y + 5, halfWidth, 2, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CRÉDITOS', 14 + halfWidth / 2, y + 5, { align: 'center' });
  
  doc.setTextColor(...colors.charcoal);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Depósitos:', 20, y + 14);
  doc.text('Combustible:', 20, y + 21);
  doc.text('TOTAL:', 20, y + 28);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.credit);
  doc.text(`+${formatCurrency(data.totalDeposits)}`, 14 + halfWidth - 6, y + 14, { align: 'right' });
  doc.text(`+${formatCurrency(data.totalFuel)}`, 14 + halfWidth - 6, y + 21, { align: 'right' });
  doc.setFontSize(9);
  doc.text(`+${formatCurrency(data.totalDeposits + data.totalFuel)}`, 14 + halfWidth - 6, y + 28, { align: 'right' });
  
  // Right: CARGOS
  doc.setFillColor(...colors.white);
  doc.setDrawColor(...colors.silver);
  doc.roundedRect(18 + halfWidth, y, halfWidth, 32, 2, 2, 'FD');
  
  doc.setFillColor(...colors.debit);
  doc.roundedRect(18 + halfWidth, y, halfWidth, 7, 2, 2, 'F');
  doc.rect(18 + halfWidth, y + 5, halfWidth, 2, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CARGOS', 18 + halfWidth + halfWidth / 2, y + 5, { align: 'center' });
  
  doc.setTextColor(...colors.charcoal);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Vuelos:', 24 + halfWidth, y + 14);
  doc.text('', 24 + halfWidth, y + 21);
  doc.text('TOTAL:', 24 + halfWidth, y + 28);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.debit);
  doc.text(`-${formatCurrency(data.totalSpent)}`, 14 + halfWidth * 2, y + 14, { align: 'right' });
  doc.setFontSize(9);
  doc.text(`-${formatCurrency(data.totalSpent)}`, 14 + halfWidth * 2, y + 28, { align: 'right' });

  // ═══════════════════════════════════════════════════════════════════════════
  // BALANCE DESTACADO
  // ═══════════════════════════════════════════════════════════════════════════
  y = 128;
  const balanceColor = data.balance >= 0 ? colors.credit : colors.debit;
  const balanceText = data.balance >= 0 ? 'SALDO A FAVOR' : 'SALDO PENDIENTE';
  
  doc.setFillColor(...balanceColor);
  doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(balanceText, 20, y + 9);
  
  doc.setFontSize(12);
  doc.text(formatCurrency(data.balance), pageWidth - 20, y + 9, { align: 'right' });

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIGHT HISTORY TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  y = 150;
  
  // Section header
  doc.setFillColor(...colors.navy);
  doc.roundedRect(14, y, pageWidth - 28, 8, 2, 2, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`HISTORIAL DE VUELOS (${data.flights.length})`, 20, y + 5.5);
  
  y += 10;

  if (data.flights.length > 0) {
    const flightRows = data.flights.map(f => {
      const horas = Number(f.diff_hobbs || 0);
      return [
        formatDate(f.fecha),
        horas ? horas.toFixed(1) : '-',
        f.copiloto || f.detalle?.substring(0, 20) || '-',
        f.tarifa ? formatCurrency(f.tarifa * horas) : '-',
        f.instructor_rate ? formatCurrency(f.instructor_rate * horas) : '-',
        formatCurrency(f.costo),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'HRS', 'COPILOTO / DETALLE', 'AVIÓN', 'INSTR.', 'TOTAL']],
      body: flightRows,
      foot: [['', data.totalHours.toFixed(1), '', '', '', formatCurrency(data.totalSpent)]],
      theme: 'plain',
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: colors.platinum,
        textColor: colors.slate,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'left',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: colors.charcoal,
        cellPadding: 2.5,
        lineColor: colors.silver,
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
        1: { cellWidth: 14, halign: 'center', textColor: colors.neutral },
        2: { cellWidth: 'auto', halign: 'left', textColor: colors.slate },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: colors.debit },
      },
    });
    
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 50;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPOSITS TABLE (if any)
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.deposits.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFillColor(...colors.navy);
    doc.roundedRect(14, y, pageWidth - 28, 8, 2, 2, 'F');
    
    doc.setTextColor(...colors.white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`HISTORIAL DE DEPÓSITOS (${data.deposits.length})`, 20, y + 5.5);
    
    y += 10;

    const depositRows = data.deposits.map(d => [
      formatDate(d.fecha),
      d.descripcion || '-',
      `+${formatCurrency(d.monto)}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'DESCRIPCIÓN', 'MONTO']],
      body: depositRows,
      foot: [['', 'TOTAL DEPÓSITOS', `+${formatCurrency(data.totalDeposits)}`]],
      theme: 'plain',
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: colors.platinum,
        textColor: colors.slate,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'left',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: colors.charcoal,
        cellPadding: 2.5,
        lineColor: colors.silver,
        lineWidth: 0.1,
      },
      footStyles: {
        fillColor: colors.credit,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: colors.offWhite,
      },
      columnStyles: {
        0: { cellWidth: 26, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left', textColor: colors.slate },
        2: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: colors.credit },
      },
    });
    
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUEL CREDITS TABLE (if any)
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.fuelCredits.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFillColor(...colors.navy);
    doc.roundedRect(14, y, pageWidth - 28, 8, 2, 2, 'F');
    
    doc.setTextColor(...colors.white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`CRÉDITOS DE COMBUSTIBLE (${data.fuelCredits.length})`, 20, y + 5.5);
    
    y += 10;

    const fuelRows = data.fuelCredits.map(f => [
      formatDate(f.fecha),
      f.descripcion || '-',
      `+${formatCurrency(f.monto)}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'DETALLE', 'MONTO']],
      body: fuelRows,
      foot: [['', 'TOTAL COMBUSTIBLE', `+${formatCurrency(data.totalFuel)}`]],
      theme: 'plain',
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: colors.platinum,
        textColor: colors.slate,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'left',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: colors.charcoal,
        cellPadding: 2.5,
        lineColor: colors.silver,
        lineWidth: 0.1,
      },
      footStyles: {
        fillColor: colors.accent,
        textColor: colors.charcoal,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: colors.offWhite,
      },
      columnStyles: {
        0: { cellWidth: 26, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left', textColor: colors.slate },
        2: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: colors.accent },
      },
    });
    
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BANK TRANSFER INFORMATION
  // ═══════════════════════════════════════════════════════════════════════════
  const totalPages = doc.internal.pages.length - 1;
  doc.setPage(totalPages);
  
  const lastY = (doc as any).lastAutoTable?.finalY || y;
  let bankY = Math.max(lastY + 15, pageHeight - 48);
  
  if (bankY > pageHeight - 20) {
    doc.addPage();
    bankY = 20;
  }
  
  // Bank info card
  doc.setFillColor(...colors.offWhite);
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, bankY, pageWidth - 28, 30, 2, 2, 'FD');
  
  // Header
  doc.setFillColor(...colors.navy);
  doc.roundedRect(14, bankY, pageWidth - 28, 7, 2, 2, 'F');
  doc.rect(14, bankY + 5, pageWidth - 28, 2, 'F');
  
  doc.setTextColor(...colors.white);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS PARA TRANSFERENCIA BANCARIA', 20, bankY + 4.5);
  
  // Bank details
  doc.setTextColor(...colors.charcoal);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  
  const bankDetails = [
    ['Titular:', 'SANTIAGO NICOLÁS VARAS SAAVEDRA'],
    ['RUT:', '18.166.515-7'],
    ['Banco:', 'Santander  •  Cuenta Corriente Nº 0-000-75-79256-5'],
    ['Email:', 'santvaras92@gmail.com'],
  ];
  
  let detailY = bankY + 12;
  bankDetails.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, detailY);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 42, detailY);
    detailY += 4.5;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════════════════════════
  const pagesCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pagesCount; i++) {
    doc.setPage(i);
    
    // Footer bar
    doc.setFillColor(...colors.navy);
    doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');
    
    // Footer text
    doc.setTextColor(...colors.white);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('CC-AQI  •  Flight Operations  •  AeroStratus', 14, pageHeight - 3);
    doc.text(`Página ${i} de ${pagesCount}`, pageWidth - 14, pageHeight - 3, { align: 'right' });
  }

  // Save PDF
  const fileName = `Estado_Cuenta_${data.clientCode}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
// Build trigger 1764807953
