import type { ReactNode } from "react";

/**
 * Ghost shows every setting in place: no row hides behind an "Advanced" fold. Kept only so
 * upstream panels that still wrap rows in it render them as ordinary rows of their section.
 */
export function AdvancedSettings({
  children,
}: {
  readonly targetIds?: ReadonlyArray<string>;
  readonly children: ReactNode;
}) {
  return <>{children}</>;
}
