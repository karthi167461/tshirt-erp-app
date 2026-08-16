import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra text the filter matches but the row doesn't display (e.g. a barcode). */
  keywords?: string;
}

/**
 * Searchable single-select: a button trigger that opens a popup with a filter
 * input and the full option list.
 *
 * Built around MasterEntry's numpad contract (see lib/keyboard.ts):
 * - The CLOSED state is a <button>, never an <input> — `isDataEntryTarget`
 *   stays false, so Numpad 1-6 panel switching and the document-level barcode
 *   scan fallback keep working exactly as they did over a native <select>.
 * - The popup carries `data-combobox-popup`, which useNumpadNav uses to keep
 *   NumpadEnter / * / . from acting on the form while the popup is open.
 * - No `role="group"` anywhere: MasterEntry's * and . handlers treat any
 *   [role="group"] ancestor as the colour-chip group.
 * - Extra props (data-ring etc.) are spread onto the TRIGGER so the +/− focus
 *   ring can include it like any other field.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
} & Record<string, unknown>) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [highlight, setHighlight] = React.useState(0);
  // Fixed-position coordinates so the popup escapes overflow containers
  // (EntryLog's table wrapper is overflow-x-auto and would clip an absolute one).
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; left: number; width: number }>({
    left: 0,
    width: 0,
  });
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.keywords ?? ""}`.toLowerCase().includes(q)
    );
  }, [options, filter]);

  function reposition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Open upward when the space below can't fit the popup but above can.
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < 300 && rect.top > spaceBelow;
    setPos(
      flip
        ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
        : { top: rect.bottom + 4, left: rect.left, width: rect.width }
    );
  }

  function openPopup() {
    if (disabled) return;
    setFilter("");
    // Start the highlight on the current selection so Enter twice is a no-op.
    const i = options.findIndex((o) => o.value === value);
    setHighlight(Math.max(0, i));
    reposition();
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function pick(option: ComboboxOption) {
    onChange(option.value);
    close(true);
  }

  // Close on any pointerdown outside the component. Outside scrolls and window
  // resizes REPOSITION rather than close: on mobile the soft keyboard raised by
  // the autofocused filter input fires exactly those events the moment the
  // popup opens (viewport resize + scroll-into-view), and closing on them made
  // the picker unusable on phones. The popup is position:fixed, so it follows
  // the trigger by recomputing from its rect.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (e.target instanceof Node && !wrapRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    function onScroll(e: Event) {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      reposition();
    }
    function onResize() {
      reposition();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Keep the highlighted row visible while arrowing through a long list.
  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function onFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      // Both main Enter and NumpadEnter land here (useNumpadNav stands down
      // inside the popup); picking must not submit the form underneath.
      e.preventDefault();
      e.stopPropagation();
      const hit = filtered[highlight] ?? filtered[0];
      if (hit) pick(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onBlur={(e) => {
        // Focus left the whole component (e.g. +/− walked the ring) → close.
        if (!(e.relatedTarget instanceof Node) || !wrapRef.current?.contains(e.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(true) : openPopup())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openPopup();
          }
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
          className
        )}
        {...rest}
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder ?? t("common.select")}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          data-combobox-popup
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className="fixed z-50 rounded-md border border-border bg-card shadow-lg"
          // On touch, a tap first BLURS the filter input; the wrapper's onBlur
          // would close the popup before the tap's click reaches the option
          // (mobile relatedTarget is null). Keeping pointer-down from moving
          // focus lets the click land. Taps on the input itself must still
          // focus it, and scrolling is unaffected (that's touchmove).
          onPointerDown={(e) => {
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
          }}
        >
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onFilterKeyDown}
              placeholder={t("combobox.search")}
              autoComplete="off"
              className="flex h-8 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-60 overflow-auto p-1">
            {filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                data-index={i}
                aria-selected={o.value === value}
                tabIndex={-1}
                onClick={() => pick(o)}
                onPointerMove={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                  i === highlight ? "bg-muted" : "",
                  o.value === value ? "font-medium" : ""
                )}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    o.value === value ? "text-primary" : "invisible"
                  )}
                />
                <span className="truncate">{o.label}</span>
              </button>
            ))}
            {!filtered.length && (
              <p className="px-2 py-2 text-sm text-muted-foreground">{t("combobox.noResults")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
