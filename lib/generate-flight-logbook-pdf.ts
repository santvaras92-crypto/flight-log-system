// Flight Logbook PDF Generator
// Generates a single-flight logbook entry PDF for pilot confirmation
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface FlightLogbookData {
  submissionId: number;
  flightId: number;
  piloto: {
    nombre: string;
    codigo: string;
  };
  fecha: string;
  hobbs_inicio: number;
  hobbs_fin: number;
  diff_hobbs: number;
  tach_inicio: number;
  tach_fin: number;
  diff_tach: number;
  airframe: number;
  engine: number;
  propeller: number;
  copiloto?: string;
  detalle?: string;
  aerodromoSalida: string;
  aerodromoDestino: string;
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

export async function generateFlightLogbookPDF(data: FlightLogbookData): Promise<void> {
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
  // AEROSTRATUS COLOR PALETTE
  // ═══════════════════════════════════════════════════════════════════════════
  const colors = {
    navy: [30, 58, 110] as [number, number, number],
    silver: [140, 147, 154] as [number, number, number],
    grayDark: [90, 96, 104] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    offWhite: [244, 245, 246] as [number, number, number],
    lightGray: [230, 232, 234] as [number, number, number],
    textPrimary: [45, 52, 54] as [number, number, number],
    textSecondary: [140, 147, 154] as [number, number, number],
  };
  
  // Helper functions
  const formatDate = (dateStr: string) => {
    // Parse as local date to avoid UTC timezone shift
    // "2026-02-16" → parts [2026, 02, 16] → new Date(2026, 1, 16)
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} de ${month}, ${year}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER - Logo and Title
  // ═══════════════════════════════════════════════════════════════════════════
  let y = 14;
  
  // Logo - Right aligned
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', pageWidth - 64, y - 2, 50, 11);
    } catch (e) {
      console.error('Could not add logo to PDF:', e);
    }
  }
  
  // Title - Left aligned
  doc.setTextColor(...colors.navy);
  doc.setFontSize(20);
  doc.setFont('AvenirNext', 'bold');
  doc.text('BITÁCORA DE VUELO', 14, y + 2);
  
  // Aircraft subtitle
  doc.setTextColor(...colors.silver);
  doc.setFontSize(12);
  doc.setFont('AvenirNext', 'normal');
  doc.text('CC-AQI', 14, y + 10);
  
  // Submission ID badge
  doc.setFontSize(9);
  doc.setTextColor(...colors.grayDark);
  doc.text(`Registro #${data.submissionId}`, 14, y + 17);
  
  // Separator line
  y = 36;
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIGHT INFORMATION CARD
  // ═══════════════════════════════════════════════════════════════════════════
  y = 44;
  
  doc.setFillColor(...colors.offWhite);
  doc.setDrawColor(...colors.lightGray);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y, pageWidth - 28, 32, 2, 2, 'FD');
  
  // Date
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'bold');
  doc.text('FECHA', 20, y + 5);
  
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(11);
  doc.setFont('AvenirNext', 'bold');
  doc.text(formatDate(data.fecha), 20, y + 11);
  
  // Pilot
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'bold');
  doc.text('PILOTO', 20, y + 18);
  
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(10);
  doc.setFont('AvenirNext', 'normal');
  doc.text(`${data.piloto.nombre} (${data.piloto.codigo})`, 20, y + 24);
  
  // Copilot/Instructor (if exists)
  if (data.copiloto) {
    doc.setTextColor(...colors.silver);
    doc.setFontSize(7);
    doc.setFont('AvenirNext', 'bold');
    doc.text('INSTRUCTOR / COPILOTO', pageWidth / 2 + 4, y + 5);
    
    doc.setTextColor(...colors.textPrimary);
    doc.setFontSize(10);
    doc.setFont('AvenirNext', 'normal');
    doc.text(data.copiloto, pageWidth / 2 + 4, y + 11);
  }
  
  // Route
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'bold');
  doc.text('RUTA', pageWidth / 2 + 4, data.copiloto ? y + 18 : y + 5);
  
  doc.setTextColor(...colors.textPrimary);
  doc.setFontSize(10);
  doc.setFont('AvenirNext', 'normal');
  doc.text(`${data.aerodromoSalida} → ${data.aerodromoDestino}`, pageWidth / 2 + 4, data.copiloto ? y + 24 : y + 11);

  // ═══════════════════════════════════════════════════════════════════════════
  // COUNTERS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  y = 84;
  
  doc.setTextColor(...colors.navy);
  doc.setFontSize(10);
  doc.setFont('AvenirNext', 'bold');
  doc.text('CONTADORES DE AERONAVE', 14, y);
  
  y += 6;

  const countersData = [
    ['Hobbs', data.hobbs_inicio.toFixed(1), data.hobbs_fin.toFixed(1), data.diff_hobbs.toFixed(1)],
    ['Tach', data.tach_inicio.toFixed(1), data.tach_fin.toFixed(1), data.diff_tach.toFixed(1)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['CONTADOR', 'INICIO', 'FIN', 'DELTA']],
    body: countersData,
    theme: 'plain',
    margin: { left: 14, right: 14 },
    headStyles: {
      fillColor: colors.navy,
      textColor: colors.white,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: colors.textPrimary,
      cellPadding: 3,
      lineColor: colors.lightGray,
      lineWidth: 0.1,
      font: 'courier',
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: colors.offWhite,
    },
    columnStyles: {
      0: { cellWidth: 40, halign: 'left', fontStyle: 'bold' },
      1: { cellWidth: 'auto', halign: 'right' },
      2: { cellWidth: 'auto', halign: 'right' },
      3: { cellWidth: 'auto', halign: 'right', textColor: colors.navy, fontStyle: 'bold' },
    },
  });

  // Get Y position after table
  const finalY1 = (doc as any).lastAutoTable.finalY;

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPONENT HOURS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  y = finalY1 + 12;
  
  doc.setTextColor(...colors.navy);
  doc.setFontSize(10);
  doc.setFont('AvenirNext', 'bold');
  doc.text('HORAS DE COMPONENTES', 14, y);
  
  y += 6;

  const componentsData = [
    ['Airframe (Célula)', data.airframe.toFixed(1) + ' hrs'],
    ['Engine (Motor)', data.engine.toFixed(1) + ' hrs'],
    ['Propeller (Hélice)', data.propeller.toFixed(1) + ' hrs'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['COMPONENTE', 'HORAS TOTALES']],
    body: componentsData,
    theme: 'plain',
    margin: { left: 14, right: 14 },
    headStyles: {
      fillColor: colors.navy,
      textColor: colors.white,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: colors.textPrimary,
      cellPadding: 3,
      lineColor: colors.lightGray,
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: colors.offWhite,
    },
    columnStyles: {
      0: { cellWidth: 80, halign: 'left' },
      1: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', font: 'courier' },
    },
  });

  const finalY2 = (doc as any).lastAutoTable.finalY;

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.detalle) {
    y = finalY2 + 12;
    
    doc.setTextColor(...colors.navy);
    doc.setFontSize(10);
    doc.setFont('AvenirNext', 'bold');
    doc.text('OBSERVACIONES', 14, y);
    
    y += 6;
    
    doc.setFillColor(...colors.offWhite);
    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, pageWidth - 28, 20, 2, 2, 'FD');
    
    doc.setTextColor(...colors.textPrimary);
    doc.setFontSize(9);
    doc.setFont('AvenirNext', 'normal');
    
    // Split text if too long
    const splitText = doc.splitTextToSize(data.detalle, pageWidth - 36);
    doc.text(splitText, 20, y + 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER - Status and timestamp
  // ═══════════════════════════════════════════════════════════════════════════
  y = pageHeight - 40;
  
  // Separator
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);
  
  y += 8;
  
  // Status badge
  doc.setFillColor(255, 243, 205); // Yellow background
  doc.setDrawColor(245, 158, 11); // Amber border
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, 60, 10, 2, 2, 'FD');
  
  doc.setTextColor(146, 64, 14); // Amber text
  doc.setFontSize(8);
  doc.setFont('AvenirNext', 'bold');
  doc.text('⏳ PENDIENTE VALIDACIÓN', 16, y + 6.5);
  
  // Timestamp
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'normal');
  const now = new Date();
  const timestamp = now.toLocaleString('es-CL', { 
    year: 'numeric', 
    month: 'short', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  doc.text(`Documento generado: ${timestamp}`, 14, y + 16);
  
  // Verification link
  doc.setTextColor(...colors.navy);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'bold');
  doc.text(`Verificar registro: aerostratus.cl/verify/${data.submissionId}`, 14, y + 22);
  
  // Final footer line
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.3);
  doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
  
  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'normal');
  doc.text('CC-AQI  •  AeroStratus Aviation Solutions  •  https://aerostratus.cl/', 14, pageHeight - 6);
  
  doc.setTextColor(...colors.silver);
  doc.text('Página 1 de 1', pageWidth - 14, pageHeight - 6, { align: 'right' });

  // Save PDF
  const fileName = `Bitacora_CC-AQI_${data.piloto.codigo}_${data.fecha}_#${data.submissionId}.pdf`;
  doc.save(fileName);
}
