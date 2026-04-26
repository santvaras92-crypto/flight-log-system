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
  // Valores previos (para línea "Base A/E/P" en el PDF). Opcionales para retro-compatibilidad.
  airframe_inicio?: number | null;
  engine_inicio?: number | null;
  propeller_inicio?: number | null;
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
  // Landscape para que entre la tabla horizontal de 12 columnas (igual a vista previa)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm

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
  // PALETA
  // ═══════════════════════════════════════════════════════════════════════════
  const colors = {
    navy: [30, 58, 110] as [number, number, number],
    blue: [37, 99, 235] as [number, number, number],          // delta blue
    silver: [140, 147, 154] as [number, number, number],
    grayDark: [90, 96, 104] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    offWhite: [244, 245, 246] as [number, number, number],
    lightGray: [230, 232, 234] as [number, number, number],
    textPrimary: [45, 52, 54] as [number, number, number],
  };

  // Formato fecha "dd-MM-yy" para celda de la tabla (igual a la vista previa)
  const formatDateShort = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}-${m}-${y.slice(-2)}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER — título + logo
  // ═══════════════════════════════════════════════════════════════════════════
  const headerY = 14;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', pageWidth - 64, headerY - 4, 50, 11);
    } catch (e) {
      console.error('Could not add logo to PDF:', e);
    }
  }

  doc.setTextColor(...colors.navy);
  doc.setFontSize(16);
  doc.setFont('AvenirNext', 'bold');
  doc.text('BITÁCORA DE VUELO', 14, headerY);

  doc.setTextColor(...colors.silver);
  doc.setFontSize(10);
  doc.setFont('AvenirNext', 'normal');
  doc.text(`CC-AQI  •  Registro #${data.submissionId}`, 14, headerY + 6);

  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.4);
  doc.line(14, headerY + 10, pageWidth - 14, headerY + 10);

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLA PRINCIPAL — espejo de la vista previa
  // Anchos en mm: suman 269mm = ancho útil A4 landscape (297 - 14 - 14)
  // ═══════════════════════════════════════════════════════════════════════════
  const tableY = headerY + 16;

  // Fila 1: data["DATE","HOBBS","BLOCK TIME","TAC","TACH. TIME","AIRFRAME","ENGINE","PROPELLER","PILOT","INSTRUCTOR/COPILOT","ROUTE","REMARKS SIGNATURE"]
  const pilotName = data.piloto.nombre || '--';
  const copiloto = data.copiloto && data.copiloto.trim() ? data.copiloto.trim() : '—';
  const route = `${data.aerodromoSalida || 'SCCV'}-${data.aerodromoDestino || 'SCCV'}`;
  const remarks = data.detalle && data.detalle.trim() ? data.detalle.trim() : 'S/Obs';

  autoTable(doc, {
    startY: tableY,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    head: [
      [
        { content: 'DATE', rowSpan: 2 },
        { content: 'HOBBS', rowSpan: 2 },
        { content: 'BLOCK\nTIME', rowSpan: 2 },
        { content: 'TAC', rowSpan: 2 },
        { content: 'TACH.\nTIME', rowSpan: 2 },
        { content: 'TOTAL TIME IN SERVICE', colSpan: 3 },
        { content: 'PILOT', rowSpan: 2 },
        { content: 'INSTRUCTOR/\nCOPILOT', rowSpan: 2 },
        { content: 'ROUTE', rowSpan: 2 },
        { content: 'REMARKS\nSIGNATURE', rowSpan: 2 },
      ],
      [
        { content: 'AIRFRAME' },
        { content: 'ENGINE' },
        { content: 'PROPELLER' },
      ],
    ],
    body: [
      [
        formatDateShort(data.fecha),
        data.hobbs_fin.toFixed(1),
        data.diff_hobbs.toFixed(1),
        data.tach_fin.toFixed(1),
        data.diff_tach.toFixed(1),
        data.airframe.toFixed(1),
        data.engine.toFixed(1),
        data.propeller.toFixed(1),
        pilotName,
        copiloto,
        route,
        remarks,
      ],
    ],
    headStyles: {
      fillColor: colors.navy,
      textColor: colors.white,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      valign: 'middle',
      cellPadding: 2,
      lineColor: [180, 188, 196],
      lineWidth: 0.2,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: colors.textPrimary,
      cellPadding: 2.5,
      lineColor: colors.lightGray,
      lineWidth: 0.2,
      valign: 'middle',
      halign: 'center',
      overflow: 'linebreak',
    },
    columnStyles: {
      0:  { cellWidth: 22, font: 'courier', overflow: 'visible', cellPadding: { top: 2.5, bottom: 2.5, left: 1, right: 1 } }, // DATE
      1:  { cellWidth: 18, font: 'courier', fontStyle: 'bold' },                       // HOBBS
      2:  { cellWidth: 16, font: 'courier', fontStyle: 'bold', textColor: colors.blue }, // BLOCK TIME (Δhobbs)
      3:  { cellWidth: 16, font: 'courier', fontStyle: 'bold' },                       // TAC
      4:  { cellWidth: 16, font: 'courier', fontStyle: 'bold', textColor: colors.blue }, // TACH. TIME (Δtach)
      5:  { cellWidth: 20, font: 'courier' },                                          // AIRFRAME
      6:  { cellWidth: 18, font: 'courier' },                                          // ENGINE
      7:  { cellWidth: 20, font: 'courier' },                                          // PROPELLER
      8:  { cellWidth: 28, halign: 'left' },                                           // PILOT
      9:  { cellWidth: 33, halign: 'left' },                                           // INSTRUCTOR/COPILOT
      10: { cellWidth: 22, font: 'courier' },                                          // ROUTE
      11: { cellWidth: 40, halign: 'left', fontSize: 8 },                              // REMARKS
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY;

  // ═══════════════════════════════════════════════════════════════════════════
  // LÍNEA BASE A/E/P
  // ═══════════════════════════════════════════════════════════════════════════
  let y = finalY + 6;

  doc.setTextColor(...colors.silver);
  doc.setFontSize(7.5);
  doc.setFont('AvenirNext', 'normal');
  const baseAfp = `Base A/E/P: ${data.airframe_inicio != null ? data.airframe_inicio.toFixed(1) : 'N/A'} / ${data.engine_inicio != null ? data.engine_inicio.toFixed(1) : 'N/A'} / ${data.propeller_inicio != null ? data.propeller_inicio.toFixed(1) : 'N/A'}    Δ Tach usado: ${data.diff_tach.toFixed(1)}    Δ Hobbs: ${data.diff_hobbs.toFixed(1)}`;
  doc.text(baseAfp, 14, y);

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVACIONES (sólo si hay y son largas — pequeño extra)
  // La vista previa muestra las obs en la celda REMARKS de la tabla, pero
  // si exceden lo que entra cómodo en la celda, las repetimos abajo completas.
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.detalle && data.detalle.trim().length > 60) {
    y += 10;
    doc.setTextColor(...colors.navy);
    doc.setFontSize(9);
    doc.setFont('AvenirNext', 'bold');
    doc.text('OBSERVACIONES', 14, y);

    y += 5;
    doc.setFillColor(...colors.offWhite);
    doc.setDrawColor(...colors.lightGray);
    doc.setLineWidth(0.3);
    const boxHeight = 20;
    doc.roundedRect(14, y, pageWidth - 28, boxHeight, 2, 2, 'FD');

    doc.setTextColor(...colors.textPrimary);
    doc.setFontSize(8.5);
    doc.setFont('AvenirNext', 'normal');
    const splitText = doc.splitTextToSize(data.detalle.trim(), pageWidth - 36);
    doc.text(splitText, 18, y + 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER (sin pendiente validación, sin verify link)
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setDrawColor(...colors.silver);
  doc.setLineWidth(0.3);
  doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

  doc.setTextColor(...colors.silver);
  doc.setFontSize(7);
  doc.setFont('AvenirNext', 'normal');
  doc.text('CC-AQI  •  AeroStratus Aviation Solutions  •  https://aerostratus.cl/', 14, pageHeight - 6);
  doc.text('Página 1 de 1', pageWidth - 14, pageHeight - 6, { align: 'right' });

  // Save PDF
  const fileName = `Bitacora_CC-AQI_${data.piloto.codigo}_${data.fecha}_#${data.submissionId}.pdf`;
  doc.save(fileName);
}
