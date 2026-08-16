import { useEffect, useRef } from "react";
import { NUMPAD, isDataEntryTarget, isScanBox } from "@/lib/keyboard";

export interface NumpadHandlers {
  onPanel: (index: number) => void;
  onSave: () => void;
  onNextField: () => void;
  onPrevField: () => void;
  onNextGroup: () => void;
  onToggle: () => void;
  onCommand: () => void;
}

/**
 * Binds the numpad shortcuts for as long as the calling component is mounted.
 *
 * The listener is registered on `document` in the CAPTURE phase because the
 * app's pickers are native `<select>` elements, which swallow arrow keys — and
 * with NumLock off the panel keys *are* arrow keys. Capturing lets us
 * preventDefault before the select acts on them, which is what stops
 * "Numpad2 → ArrowDown → silently changes the selected cutting lot".
 *
 * Cleanup on unmount is load-bearing: without it these shortcuts would keep
 * firing on every other page in the app.
 */
export function useNumpadNav(enabled: boolean, handlers: NumpadHandlers) {
  // Latest handlers live in a ref so the listener registers exactly once and
  // never goes stale on re-render.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const h = ref.current;
      const target = e.target;

      const panelIndex = NUMPAD.panels.indexOf(e.code as (typeof NUMPAD.panels)[number]);
      if (panelIndex !== -1) {
        // Typing a quantity? Let the digit through instead of switching panels.
        if (isDataEntryTarget(target)) return;
        e.preventDefault();
        e.stopPropagation();
        h.onPanel(panelIndex);
        return;
      }

      // Inside an open combobox popup, Enter picks the highlighted option and
      // * / . must not fire chip actions on the form underneath — the popup
      // owns those keys until it closes.
      const inComboboxPopup =
        target instanceof HTMLElement && !!target.closest("[data-combobox-popup]");

      switch (e.code) {
        case NUMPAD.save:
          // The scan box owns Enter — it submits a scan, not the entry form.
          // Without this the capture listener would swallow the key and
          // scanning would silently stop working.
          if (isScanBox(target)) return;
          if (inComboboxPopup) return;
          // preventDefault matters even outside a form: implicit submission
          // plus our requestSubmit() would post every entry twice.
          e.preventDefault();
          e.stopPropagation();
          h.onSave();
          return;
        case NUMPAD.nextField:
          e.preventDefault();
          e.stopPropagation();
          h.onNextField();
          return;
        case NUMPAD.prevField:
          e.preventDefault();
          e.stopPropagation();
          h.onPrevField();
          return;
        case NUMPAD.nextGroup:
          if (inComboboxPopup) return;
          e.preventDefault();
          e.stopPropagation();
          h.onNextGroup();
          return;
        case NUMPAD.toggle:
          if (inComboboxPopup) return;
          // NumLock-off this key is Delete — preventDefault keeps it from
          // eating a character in whatever field happens to have focus.
          e.preventDefault();
          e.stopPropagation();
          h.onToggle();
          return;
        case NUMPAD.command:
          e.preventDefault();
          e.stopPropagation();
          h.onCommand();
          return;
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
