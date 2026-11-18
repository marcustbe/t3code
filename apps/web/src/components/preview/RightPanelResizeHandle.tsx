import type { ComponentProps } from "react";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

interface Props extends Pick<
  ComponentProps<"div">,
  "tabIndex" | "onKeyDown" | "aria-valuenow" | "aria-valuemin" | "aria-valuemax"
> {
  handlers: ResizableWidthHandlers;
  className?: string;
  label?: string;
}

export function RightPanelResizeHandle({ handlers, className, label, ...separatorProps }: Props) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      {...separatorProps}
      className={cn(
        "group absolute inset-y-0 left-0 z-40 w-1 cursor-col-resize touch-none select-none any-pointer-coarse:-left-2 any-pointer-coarse:w-4",
        className,
      )}
      {...handlers}
    >
      <span
        aria-hidden
        // Drawn over the panel's left border so hover darkens it rather than adding a second line.
        className="pointer-events-none absolute inset-y-0 -left-px w-px bg-transparent transition-colors duration-150 group-hover:bg-foreground/20 group-focus-visible:bg-primary/60 group-active:bg-primary/60 any-pointer-coarse:left-[7px]"
      />
    </div>
  );
}
