import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { observeResize } from "~/lib/observeResize";

export function DraftHeroProjectHeading({
  children,
  projectName,
  connector = "in",
  projectIcon = true,
}: {
  children: ReactNode;
  projectName: string;
  /** The word between the question and the picker; null when the picker's text reads on directly. */
  connector?: string | null;
  projectIcon?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const largeRef = useRef<HTMLSpanElement>(null);
  const smallRef = useRef<HTMLSpanElement>(null);
  // One line at full size, one line a size down, or the name stacked under the question.
  const [fit, setFit] = useState<"large" | "small" | "stack">("stack");

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the heading against its container via ResizeObserver to choose inline or stacked layout
  useLayoutEffect(() => {
    const container = containerRef.current;
    const large = largeRef.current;
    const small = smallRef.current;
    if (!container || !large || !small) return;

    // Measure the full inline heading at both sizes independently of its current layout, so
    // moving the name below it cannot make the fit check oscillate.
    const update = () => {
      const width = container.getBoundingClientRect().width;
      setFit(
        large.getBoundingClientRect().width <= width
          ? "large"
          : small.getBoundingClientRect().width <= width
            ? "small"
            : "stack",
      );
    };
    update();
    return observeResize([container, large, small], update);
  }, []);

  const measure = (ref: typeof largeRef, size: string) => (
    <span
      ref={ref}
      className={`flex w-max items-baseline gap-1.5 whitespace-nowrap font-normal tracking-tight ${size}`}
    >
      <span>What should we build{connector ? ` ${connector}` : ""}</span>
      <span>
        {/* Room for the project icon beside the name. */}
        {projectIcon ? <span className="inline-block w-[1.25em]" /> : null}
        <span className="font-medium">{projectName}?</span>
      </span>
    </span>
  );

  // The fit is measured, not tied to a viewport breakpoint: window zoom shrinks the viewport.
  return (
    <div ref={containerRef} className="group/draft-hero relative w-full" data-fit={fit}>
      <span
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
      >
        {measure(largeRef, "text-2xl")}
        {measure(smallRef, "text-xl")}
      </span>
      {/* On one line the question and the project share a baseline and a word space. */}
      <h1 className="flex w-full flex-col items-center justify-center gap-2 text-center font-normal text-xl text-foreground tracking-tight group-data-[fit=large]/draft-hero:flex-row group-data-[fit=large]/draft-hero:items-baseline group-data-[fit=large]/draft-hero:gap-1.5 group-data-[fit=large]/draft-hero:text-2xl group-data-[fit=small]/draft-hero:flex-row group-data-[fit=small]/draft-hero:items-baseline group-data-[fit=small]/draft-hero:gap-1.5 group-data-[fit=stack]/draft-hero:sm:text-2xl">
        <span className="max-w-full group-data-[fit=large]/draft-hero:shrink-0 group-data-[fit=small]/draft-hero:shrink-0">
          What should we build
          <span className="group-data-[fit=large]/draft-hero:hidden group-data-[fit=small]/draft-hero:hidden">
            ?
          </span>
          <span className="hidden group-data-[fit=large]/draft-hero:inline group-data-[fit=small]/draft-hero:inline">
            {connector ? ` ${connector}` : null}
          </span>
        </span>
        <span className="flex min-w-0 max-w-full items-baseline justify-center text-base tracking-normal group-data-[fit=large]/draft-hero:text-2xl group-data-[fit=large]/draft-hero:tracking-tight group-data-[fit=small]/draft-hero:text-xl group-data-[fit=small]/draft-hero:tracking-tight">
          <span className="min-w-0">{children}</span>
          {/* Clicks pass through to the project picker, whose hover covers it. */}
          <span className="pointer-events-none hidden shrink-0 font-medium group-data-[fit=large]/draft-hero:inline group-data-[fit=small]/draft-hero:inline">
            ?
          </span>
        </span>
      </h1>
    </div>
  );
}
