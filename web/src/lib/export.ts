import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { FabricationLot } from "@/lib/data";
import type { SalaryBreakdown } from "@erp/shared";
import { formatMoney, splitDozenPieces } from "@/lib/utils";

// English/ASCII headers — jsPDF core fonts don't render Tamil glyphs, and the
// roll data (dia, counts, weights) is numeric/ASCII anyway.
const COLS = ["Dia", "Roll count", "Weight", "Texture/Pinnal", "Fab weight", "Dye weight"];

function rows(lot: FabricationLot): (string | number)[][] {
  return lot.rolls.map((r) => [
    r.dia,
    r.rollCount,
    r.weight,
    r.texturePinnal,
    r.fabricationWeight ?? "",
    r.dyeingWeight ?? "",
  ]);
}

export function exportFabricationExcel(lot: FabricationLot) {
  const aoa: (string | number)[][] = [
    [`Fabrication Lot: ${lot.lotNumber} (${lot.status})`],
    [],
    COLS,
    ...rows(lot),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rolls");
  XLSX.writeFile(wb, `${lot.lotNumber}.xlsx`);
}

export function exportFabricationPdf(lot: FabricationLot, companyName?: string) {
  const doc = new jsPDF();
  let y = 16;
  if (companyName) {
    doc.setFontSize(15);
    doc.text(companyName, 14, y);
    y += 8;
  }
  doc.setFontSize(12);
  doc.text(`Fabrication Lot: ${lot.lotNumber} (${lot.status})`, 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Printed: ${new Date().toLocaleString()}`, 14, y);
  doc.setTextColor(0);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [COLS],
    body: rows(lot),
    theme: "grid", // draws borders on every cell
    styles: { fontSize: 9, lineColor: [90, 90, 90], lineWidth: 0.2 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
  });

  // Outer border around the printed content.
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(150);
  doc.rect(8, 8, pw - 16, ph - 16);

  doc.save(`${lot.lotNumber}.pdf`);
}

/** Monospace is unreliable (Tamil isn't fixed-width), so use label: value lines. */
export function fabricationWhatsappText(lot: FabricationLot): string {
  const lines = [`Fabrication Lot: ${lot.lotNumber} (${lot.status})`, ""];
  lot.rolls.forEach((r, i) => {
    lines.push(`#${i + 1}  Dia ${r.dia} · Count ${r.rollCount} · Wt ${r.weight}`);
    lines.push(
      `    Pinnal ${r.texturePinnal} · Fab ${r.fabricationWeight ?? "-"} · Dye ${r.dyeingWeight ?? "-"}`
    );
  });
  lines.push("", `Total rolls: ${lot.rolls.length}`);
  return lines.join("\n");
}

export function openWhatsapp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

// jsPDF core fonts can't render Tamil, so the salary slip is English-only.
// Section keys and the numeric/ASCII work labels (e.g. "drawyer/75") are safe.
const SECTION_LABEL: Record<string, string> = {
  cutting: "Cutting",
  pouch: "Pouch",
  stretching: "Stretching",
  pichiru: "Pichiru",
  packing: "Packing",
};

/** dozen quantity → "12 dz 3 pc" (pieces omitted when zero). */
function dzText(v: number): string {
  const { dozens, pieces } = splitDozenPieces(v);
  return pieces ? `${dozens} dz ${pieces} pc` : `${dozens} dz`;
}

/** Weekly salary slip PDF — mirrors the on-screen breakdown + totals. */
export function exportSalaryPdf(
  data: SalaryBreakdown,
  advanceDeducted: number,
  companyName?: string
) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  let y = 16;

  doc.setFontSize(15);
  doc.text(companyName || "Weekly Salary", 14, y);
  y += 7;
  doc.setFontSize(11);
  doc.text("Weekly Salary", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.text(`Employee: ${data.employeeName}`, 14, y);
  doc.text(`Week: ${data.weekStart} to ${data.weekEnd}`, pw - 14, y, { align: "right" });
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Printed: ${new Date().toLocaleString()}`, 14, y);
  doc.setTextColor(0);
  y += 3;

  const isShift = data.salaryType === "shift";
  const head = isShift
    ? [["Type", "Shifts", "Rate", "Amount"]]
    : [["Date", "Section", "Work", "Dozen", "Rate", "Amount"]];
  const body = isShift
    ? [["Shift", String(data.shifts), formatMoney(data.shiftRate), formatMoney(data.grossTotal)]]
    : data.lines.map((l) => [
        l.date,
        SECTION_LABEL[l.section] ?? l.section,
        l.label.startsWith("section.") ? "" : l.label,
        dzText(l.dozen),
        formatMoney(l.rate),
        formatMoney(l.amount),
      ]);

  autoTable(doc, {
    startY: y + 2,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, lineColor: [90, 90, 90], lineWidth: 0.2 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
    columnStyles: isShift ? {} : { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });

  const totalDozen = data.lines.reduce((s, l) => s + l.dozen, 0);
  const net = Math.round((data.grossTotal - advanceDeducted) * 100) / 100;
  let ty = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, pw - 90, ty);
    doc.text(value, pw - 14, ty, { align: "right" });
    doc.setFont("helvetica", "normal");
    ty += 6;
  };
  if (!isShift) row("Total dozen", dzText(totalDozen));
  row("Gross total", formatMoney(data.grossTotal));
  row("Advance deducted", formatMoney(advanceDeducted));
  row("Net payable", formatMoney(net), true);
  row("Advance balance", formatMoney(data.advanceBalance));

  doc.setDrawColor(150);
  doc.rect(8, 8, pw - 16, ph - 16);

  doc.save(`salary-${data.employeeName}-${data.weekStart}.pdf`);
}
