/**
 * Numpad shortcuts for Master Entry.
 *
 * Everything here keys on `event.code` (physical key), never `event.key`.
 * With NumLock OFF the numpad emits navigation keys — Numpad1 arrives as "End",
 * Numpad2 as "ArrowDown", Numpad4 as "ArrowLeft" — so a `key`-based map would
 * break the moment someone toggled NumLock. `code` is stable either way.
 *
 * The layout is deliberately right-hand-only: the operator's right hand already
 * rests on the numpad to type dozens and pieces.
 */
export const NUMPAD = {
  /** Numpad 1-6 → the six entry panels, in pipeline order. */
  panels: ["Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6"],
  save: "NumpadEnter",
  nextField: "NumpadAdd", // +
  prevField: "NumpadSubtract", // −
  nextGroup: "NumpadMultiply", // *  skip past the colour chips
  toggle: "NumpadDecimal", // .  toggle the focused colour chip
  command: "NumpadDivide", // /  jump back to the scan box
} as const;

/** Marks the always-present barcode input, which is exempt from most rules. */
export const SCAN_BOX_ATTR = "data-scan-box";

/**
 * True when the operator is typing data into a field, so panel-switching keys
 * must behave as plain digits instead.
 *
 * With NumLock ON, Numpad1 produces the character "1" — exactly what goes into
 * the Dozen box. Stealing that keystroke would make "1 dozen" untypeable, so
 * panel switching stands down whenever a data field has focus (use Numpad / to
 * escape). `select` and `button` deliberately return false: nothing is being
 * typed there, so the shortcuts stay live over the lot and employee pickers.
 */
export function isDataEntryTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute(SCAN_BOX_ATTR)) return false; // the scan box has its own rules
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

/** True when focus is sitting in the barcode scan box. */
export function isScanBox(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && el.hasAttribute(SCAN_BOX_ATTR);
}
