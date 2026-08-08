import { useCallback, useEffect, useRef, useState } from "react";
import { parseBarcode, type BarcodeKind } from "@erp/shared";
import { SCAN_BOX_ATTR, isDataEntryTarget } from "@/lib/keyboard";

export interface ScanHit {
  kind: BarcodeKind;
  id: number;
}

/** A scanner emits 5–20 ms per character; 50 ms is ~240 wpm, unreachable by hand. */
const MAX_GAP_MS = 50;
/** A whole scan lands well inside this; slow human typing will not. */
const MAX_TOTAL_MS = 300;

/**
 * Barcode input for Master Entry, via two cooperating paths.
 *
 * A wedge scanner is just a fast keyboard: it types the payload then sends a
 * terminator. The PRIMARY path is therefore a real focused input (`scanBoxProps`)
 * where no timing guesswork is needed — whatever arrives before the terminator
 * is the code. The document-level FALLBACK only runs when focus is somewhere
 * that cannot receive text (a select, a chip, the body), and there it uses
 * inter-keystroke timing to tell a scanner apart from a person.
 */
export function useBarcodeScanner(
  onScan: (hit: ScanHit) => void,
  opts: { enabled?: boolean; onUnrecognised?: (raw: string) => void } = {}
) {
  const { enabled = true, onUnrecognised } = opts;
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cb = useRef({ onScan, onUnrecognised });
  cb.current = { onScan, onUnrecognised };

  const focusScanBox = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = useCallback((raw: string) => {
    const hit = parseBarcode(raw);
    setValue("");
    if (hit) cb.current.onScan(hit);
    else if (raw.trim()) cb.current.onUnrecognised?.(raw);
  }, []);

  // --- Fallback: scanner fired while focus was not in a text field ---
  useEffect(() => {
    if (!enabled) return;
    let chars: string[] = [];
    let startTs = 0;
    let lastTs = 0;

    function onKeyDown(e: KeyboardEvent) {
      // The scan box handles itself; text fields must never be intercepted.
      if (isDataEntryTarget(e.target) || (e.target as HTMLElement)?.hasAttribute?.(SCAN_BOX_ATTR))
        return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = e.timeStamp;
      if (e.key === "Enter" || e.code === "NumpadEnter" || e.key === "Tab") {
        const raw = chars.join("");
        const fastEnough = now - startTs <= MAX_TOTAL_MS;
        chars = [];
        // Only claim the keystroke when this really looks like a scan AND
        // decodes — otherwise let Enter/Tab do their normal job.
        if (raw.length >= 2 && fastEnough && parseBarcode(raw)) {
          e.preventDefault();
          e.stopPropagation();
          submit(raw);
        }
        return;
      }

      if (e.key.length !== 1) return; // ignore Shift, arrows, F-keys…
      if (now - lastTs > MAX_GAP_MS) {
        chars = [];
        startTs = now;
      }
      lastTs = now;
      chars.push(e.key);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, submit]);

  const scanBoxProps = {
    ref: inputRef,
    value,
    [SCAN_BOX_ATTR]: "",
    autoComplete: "off",
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Accept Enter, NumpadEnter AND Tab: wedge scanners are commonly
      // configured to send a Tab (or CR+LF) suffix rather than a bare Enter,
      // and a Tab suffix would otherwise move focus away and drop the scan.
      if (e.key === "Enter" || e.code === "NumpadEnter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        submit(e.currentTarget.value);
      }
    },
  };

  return { scanBoxProps, focusScanBox, scanValue: value };
}
