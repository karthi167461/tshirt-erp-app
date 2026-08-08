import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ----------------------------- Button ----------------------------- */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:opacity-90 shadow-sm",
        outline:
          "border border-input bg-card hover:bg-muted text-foreground",
        ghost: "hover:bg-muted text-foreground",
        destructive: "bg-destructive text-white hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

/* ----------------------------- Input ----------------------------- */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

/* ----------------------------- Select (native) ----------------------------- */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

/* ----------------------------- MultiSelectChips ----------------------------- */
/**
 * Touch-friendly multi-select: a row of toggleable pill buttons. Dumb component —
 * caller owns `selected` and gets the next array on every toggle. Preferred over a
 * native <select multiple> on the shop floor's mobile devices.
 */
export function MultiSelectChips({
  options,
  selected,
  onChange,
  disabled = false,
  emptyLabel,
  chipRef,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
  /** Lets a keyboard-driven parent splice the chips into its own focus ring. */
  chipRef?: (el: HTMLButtonElement | null, index: number) => void;
}) {
  if (disabled || options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const toggle = (opt: string) =>
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt]
    );

  // Roving tabindex: the group is ONE tab stop and arrows move within it, so a
  // lot with a dozen colours doesn't bury the rest of the form in the tab order.
  const firstStop = Math.max(0, options.findIndex((o) => selected.includes(o)));
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    let next = -1;
    if (delta) next = (index + delta + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const group = e.currentTarget.parentElement;
    group?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }

  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((opt, i) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            ref={chipRef ? (el) => chipRef(el, i) : undefined}
            type="button"
            aria-pressed={on}
            tabIndex={i === firstStop ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => toggle(opt)}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              on
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-input bg-card text-foreground hover:bg-muted"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- Label / Field ----------------------------- */
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ----------------------------- Card ----------------------------- */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground card-shadow",
        className
      )}
      {...props}
    />
  );
}
export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-2", className)} {...props} />;
}
export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}
export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-3", className)} {...props} />;
}

/* ----------------------------- Badge ----------------------------- */
export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "success" | "muted" | "warning";
}) {
  const tones: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

/* ----------------------------- Progress ----------------------------- */
export function Progress({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("h-2 w-full rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
