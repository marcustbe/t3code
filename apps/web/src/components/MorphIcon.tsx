import { MorphIcon as BaseMorphIcon, type MorphIconProps } from "morphicons/react";

// data-morph-icon lets the app-wide icon stroke rule in index.css reach these too.
export function MorphIcon({ reducedMotion = "user", ...props }: MorphIconProps) {
  return <BaseMorphIcon data-morph-icon="" reducedMotion={reducedMotion} {...props} />;
}
