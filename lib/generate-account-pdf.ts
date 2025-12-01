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
  
  // Professional color palette
  const colors = {
    navy: [40, 48, 71] as [number, number, number],        // #283047 - Dark navy header
    white: [255, 255, 255] as [number, number, number],
    accent: [0, 122, 204] as [number, number, number],     // #007ACC - Professional blue accent
    textPrimary: [30, 30, 30] as [number, number, number], // #1E1E1E - Almost black
    textSecondary: [96, 96, 96] as [number, number, number], // #606060 - Gray
    lightGray: [245, 245, 245] as [number, number, number], // #F5F5F5 - Light background
    border: [220, 220, 220] as [number, number, number],   // #DCDCDC - Border gray
    success: [16, 124, 16] as [number, number, number],    // #107C10 - Green for positive
    warning: [202, 80, 16] as [number, number, number],    // #CA5010 - Orange for negative
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

  // === PROFESSIONAL HEADER ===
  // Navy background header
  doc.setFillColor(...colors.navy);
  doc.rect(0, 0, pageWidth, 50, 'F');
  
  // Add logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 15, 12, 45, 26);
    } catch (e) {
      console.error('Could not add logo to PDF:', e);
    }
  }
  
  // Title - positioned after logo with proper spacing
  doc.setTextColor(...colors.white);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADO DE CUENTA', 68, 24);
  
  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('CC-AQI • Flight Operations', 68, 33);
  
  // Date on the right
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, pageWidth - 15, 24, { align: 'right' });
  
  // Date range if provided
  if (data.dateRange?.start || data.dateRange?.end) {
    const rangeText = `Período: ${data.dateRange.start || 'Inicio'} - ${data.dateRange.end || 'Actual'}`;
    doc.text(rangeText, pageWidth - 15, 33, { align: 'right' });
  }

  // === CLIENT INFO SECTION ===
  // Clean white box with subtle border
  doc.setDrawColor(...colors.border);
  doc.setFillColor(...colors.white);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, 58, pageWidth - 30, 24, 2, 2, 'FD');
  
  // Client name - prominent
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 20, 68);
  doc.text(data.clientName, 42, 68);
  
  // Client code - smaller, gray
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.textSecondary);
  doc.text(`Código: ${data.clientCode}`, 20, 76);

  // === KEY METRICS CARDS - PROFESSIONAL STYLE ===
  const cardY = 90;
  const cardHeight = 28;
  const cardWidth = (pageWidth - 40) / 4;
  const cardGap = 3;

  const summaryItems = [
    { label: 'Total Vuelos', value: data.totalFlights.toString(), color: colors.accent },
    { label: 'Horas Voladas', value: `${data.totalHours.toFixed(1)} hrs`, color: colors.accent },
    { label: 'Total Gastado', value: formatCurrency(data.totalSpent), color: colors.accent },
    { label: 'Balance', value: formatCurrency(data.balance), color: data.balance >= 0 ? colors.success : colors.warning },
  ];

  summaryItems.forEach((item, i) => {
    const x = 15 + i * (cardWidth + cardGap);
    
    // Card background - clean white with border
    doc.setDrawColor(...colors.border);
    doc.setFillColor(...colors.white);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
    
    // Left accent bar
    doc.setFillColor(...item.color);
    doc.rect(x, cardY, 2, cardHeight, 'F');
    
    // Label - clean, small caps style
    doc.setTextColor(...colors.textSecondary);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const labelText = item.label.toUpperCase();
    doc.text(labelText, x + cardWidth / 2, cardY + 10, { align: 'center' });
    
    // Value - large and prominent
    doc.setTextColor(...colors.textPrimary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, x + cardWidth / 2, cardY + 20, { align: 'center' });
  });

  // === FINANCIAL SUMMARY - CLEAN TABLE ===
  let currentY = cardY + cardHeight + 15;
  
  // Section title with subtle underline
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN FINANCIERO', 15, currentY);
  
  doc.setDrawColor(...colors.border);
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
      lineColor: colors.border,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { 
        fontStyle: 'normal', 
        textColor: colors.textSecondary,
        cellWidth: 60,
      },
      1: { 
        fontStyle: 'bold', 
        halign: 'right', 
        textColor: colors.textPrimary,
        cellWidth: 40,
      },
    },
    tableWidth: 100,
    didParseCell: function(data) {
      // Add border to last row (balance)
      if (data.row.index === 3) {
        data.cell.styles.lineWidth = { top: 0.5, bottom: 0.5, left: 0, right: 0 };
        data.cell.styles.lineColor = colors.accent;
      }
    },
  });

  // === DEPOSITS TABLE - PROFESSIONAL DESIGN ===
  currentY = (doc as any).lastAutoTable?.finalY + 15 || currentY + 50;
  
  if (data.deposits.length > 0) {
    // Section title
    doc.setTextColor(...colors.textPrimary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`DEPÓSITOS (${data.deposits.length})`, 15, currentY);
    
    doc.setDrawColor(...colors.border);
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
        fillColor: colors.accent,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.textPrimary,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: colors.lightGray,
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      styles: {
        lineColor: colors.border,
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
    doc.setTextColor(...colors.textPrimary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`CRÉDITOS DE COMBUSTIBLE (${data.fuelCredits.length})`, 15, currentY);
    
    doc.setDrawColor(...colors.border);
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
        fillColor: colors.accent,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.textPrimary,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: colors.lightGray,
      },
      columnStyles: {
        0: { cellWidth: 28, halign: 'left' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      styles: {
        lineColor: colors.border,
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
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`DETALLE DE VUELOS (${data.flights.length})`, 15, currentY);
  
  doc.setDrawColor(...colors.border);
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
        fillColor: colors.accent,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: colors.textPrimary,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: colors.lightGray,
      },
      columnStyles: {
        0: { cellWidth: 24, halign: 'left' },
        1: { cellWidth: 16, halign: 'right' },
        2: { cellWidth: 26, halign: 'right', fontStyle: 'normal' },
        3: { cellWidth: 28, halign: 'right', fontStyle: 'normal' },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 'auto', halign: 'left' },
      },
      styles: {
        lineColor: colors.border,
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
  doc.setDrawColor(...colors.border);
  doc.setLineWidth(0.5);
  doc.line(15, footerY - 5, pageWidth - 15, footerY - 5);
  
  // Bank details section - clean box
  doc.setDrawColor(...colors.border);
  doc.setFillColor(...colors.lightGray);
  doc.setLineWidth(0.3);
  doc.roundedRect(15, footerY, pageWidth - 30, 35, 2, 2, 'FD');
  
  // Title for bank section
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMACIÓN PARA TRANSFERENCIAS', 20, footerY + 7);
  
  // Bank details - clean layout
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.textSecondary);
  
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
    doc.setFillColor(...colors.navy);
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
