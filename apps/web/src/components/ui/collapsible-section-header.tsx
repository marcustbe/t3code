import type { ComponentProps, ReactNode } from "react";
import { SECTION_CHEVRON_IS_SF, SectionChevronSymbol } from "../sidebar/SidebarSymbols";
import { cn } from "../../lib/utils";

const tones = {
  muted: { label: "text-sidebar-muted-foreground", line: "bg-sidebar-border/50" },
  emphasized: { label: "text-sidebar-foreground/80", line: "bg-sidebar-foreground/25" },
  accent: { label: "text-primary", line: "bg-primary/50" },
} as const;

export function CollapsibleSectionHeader({
  children,
  expanded,
  tone = "muted",
  variant = "default",
  accessory,
  ...buttonProps
}: Omit<ComponentProps<"button">, "className" | "style" | "aria-expanded"> & {
  expanded: boolean;
  tone?: keyof typeof tones;
  variant?: "default" | "panel";
  accessory?: ReactNode;
}) {
  return (
    <button
      {...buttonProps}
      type="button"
      aria-expanded={expanded}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg text-left font-medium hover:bg-sidebar-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        // The label starts 8px in so its first glyph lines up with the footer's gear below.
        // Sidebar shelves are as tall as the one-line chat rows (30px) so their hover matches.
        variant === "panel" ? "h-8 ps-2 pe-2.5 text-xs" : "h-7.5 ps-2 pe-2.5 text-sm",
        tones[tone].label,
      )}
    >
      <span className="shrink-0">{children}</span>
      <span
        aria-hidden
        // A header with a trailing count drops its rule so it doesn't read as a leader.
        className={cn("h-px min-w-2 flex-1", tones[tone].line, accessory && "invisible")}
      />
      {accessory}
      {/* Glyph-wide box so the chevron's tip sits on the row's right inset. */}
      <SectionChevronSymbol
        className={cn(
          "transition-transform",
          SECTION_CHEVRON_IS_SF
            ? cn("h-2 w-[4.5px]", expanded ? "-rotate-90" : "rotate-180")
            : // Lucide's chevron sits mid-box: pulled out so its ink ends on the rows' 12px line
              // like the other icons (6px pointing right, 4px pointing down, which is wider).
              expanded
              ? "-me-1"
              : "-me-1.5 -rotate-90",
        )}
      />
    </button>
  );
}

export function SectionHeaderStatus({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-3xs leading-none text-destructive-foreground">{children}</span>
  );
}
