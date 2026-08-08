import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Barcode } from "@/components/Barcode";

export interface PrintLabel {
  code: string;
  title: string;
  subtitle?: string;
}

/**
 * A sheet of barcode labels sent straight to the browser's print dialog.
 *
 * Deliberately NOT jsPDF: employee and lot names are Tamil, and jsPDF's core
 * fonts have no Tamil glyphs (see lib/export.ts) — a generated PDF would print
 * boxes where the names should be. Printing the live DOM keeps the browser's
 * font stack, so Tamil renders correctly.
 *
 * Mount it only while printing; `onDone` fires once the dialog closes.
 */
export function PrintSheet({ labels, onDone }: { labels: PrintLabel[]; onDone: () => void }) {
  useEffect(() => {
    if (!labels.length) {
      onDone();
      return;
    }
    const after = () => onDone();
    window.addEventListener("afterprint", after);
    // One frame's delay so JsBarcode's layout effects have drawn every SVG
    // before the print snapshot is taken — otherwise labels print blank.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("afterprint", after);
    };
  }, [labels, onDone]);

  if (!labels.length) return null;

  return createPortal(
    <div id="print-sheet" aria-hidden>
      {labels.map((l) => (
        <div className="print-label" key={l.code}>
          <div className="print-label-title">{l.title}</div>
          {l.subtitle && <div className="print-label-sub">{l.subtitle}</div>}
          <Barcode value={l.code} height={38} />
        </div>
      ))}
    </div>,
    document.body
  );
}
