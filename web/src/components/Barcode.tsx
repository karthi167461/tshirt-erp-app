import { useLayoutEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { cn } from "@/lib/utils";

/**
 * Code 128 is the default because it carries the letter prefix and auto-switches
 * to subset C for the digit run, so "C000123" prints about a third the width of
 * the Code 39 equivalent. Nearly every keyboard-wedge scanner reads it out of
 * the box. If the shop's scanner turns out to be one of the cheap Code-39-only
 * units, changing this one constant switches every label in the app.
 */
export const BARCODE_FORMAT = "CODE128";

export function Barcode({
  value,
  height = 40,
  showText = true,
  className,
}: {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: BARCODE_FORMAT,
        height,
        displayValue: showText,
        fontSize: 12,
        margin: 4,
        // Explicit black on white: a barcode drawn in a theme colour, or on a
        // dark background, will not scan. Labels are always printed on paper.
        lineColor: "#000000",
        background: "#ffffff",
      });
    } catch {
      // JsBarcode throws on payloads the symbology cannot encode; leave the SVG
      // blank rather than taking the page down over a label.
    }
  }, [value, height, showText]);

  return <svg ref={ref} className={cn("block", className)} role="img" aria-label={value} />;
}
