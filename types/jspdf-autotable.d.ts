import { jsPDF } from 'jspdf';

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}

declare module 'jspdf-autotable' {
  export interface UserOptions {
    startY?: number;
    head?: any[][];
    body?: any[][];
    theme?: 'striped' | 'grid' | 'plain';
    margin?: { left?: number; right?: number; top?: number; bottom?: number };
    styles?: any;
    headStyles?: any;
    bodyStyles?: any;
    alternateRowStyles?: any;
    columnStyles?: { [key: number]: any };
    tableWidth?: number | 'auto' | 'wrap';
  }

  export default function autoTable(doc: jsPDF, options: UserOptions): void;
}
