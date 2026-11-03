import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export function SettingsGroup({
  variant = "grouped",
  divided = true,
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: "grouped" | "plain";
  divided?: boolean;
}) {
  return (
    <div
      data-slot="settings-group"
      {...props}
      className={cn(
        "relative overflow-visible text-foreground",
        variant === "grouped" ? "rounded-xl bg-foreground/[3.5%]" : "space-y-1",
        // Dividers stop at the rows' text inset instead of running edge to edge.
        variant === "grouped" &&
          divided &&
          "[&>*+*]:relative [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:inset-x-3 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-separator sm:[&>*+*]:before:inset-x-4 [&>[data-slot=settings-row]]:rounded-none",
        className,
      )}
    />
  );
}
