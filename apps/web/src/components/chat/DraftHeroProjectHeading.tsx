import { useGT } from "gt-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { observeResize } from "~/lib/observeResize";

const PROJECT_SLOT = "\uE000";

export function DraftHeroProjectHeading({
  children,
  projectName,
  connector = "in",
  projectIcon = true,
}: {
  children: ReactNode;
  projectName: string;
  /** "in" between the question and the picker; null when the picker's text reads on directly
   * ("What should we build without a project?"). */
  connector?: "in" | null;
  projectIcon?: boolean;
}) {
  const gt = useGT();
  // One sentence for translators; the layout places the project picker at the placeholder.
  // The flex gap stands in for the space before it; the suffix keeps its own leading space.
  const sentence = connector
    ? gt("What should we build in {project}?", { project: PROJECT_SLOT })
    : gt("What should we build {project}?", { project: PROJECT_SLOT });
  const [before = "", after = ""] = sentence.split(PROJECT_SLOT);
  const buildIn = before.trim();
  const buildInSuffix = after.trimEnd();
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
      className={`flex w-max items-baseline gap-1.5 whitespace-nowrap font-normal tracking-hero ${size}`}
    >
      <span>{buildIn}</span>
      <span>
        {/* Room for the project icon beside the name. */}
        {projectIcon ? <span className="inline-block w-[1.25em]" /> : null}
        <span className="font-medium">{projectName}</span>
        {buildInSuffix}
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
        {measure(largeRef, "text-hero")}
        {measure(smallRef, "text-2xl")}
      </span>
      {/* On one line the question and the project share a baseline and a word space. The question
          reads in the secondary colour, the project (icon + name) in the primary at medium. Sizes
          are 28px (text-hero, fixed), a size down text-2xl. On a very short window only the picker
          shows. */}
      <h1 className="flex w-full flex-col items-center justify-center gap-2 text-center font-normal text-xl text-foreground tracking-hero group-data-[fit=large]/draft-hero:flex-row group-data-[fit=large]/draft-hero:items-baseline group-data-[fit=large]/draft-hero:gap-1.5 group-data-[fit=large]/draft-hero:text-hero group-data-[fit=small]/draft-hero:flex-row group-data-[fit=small]/draft-hero:items-baseline group-data-[fit=small]/draft-hero:gap-1.5 group-data-[fit=small]/draft-hero:text-2xl group-data-[fit=stack]/draft-hero:sm:text-2xl">
        <span className="max-w-full text-foreground group-data-[fit=large]/draft-hero:shrink-0 group-data-[fit=small]/draft-hero:shrink-0 [@media(max-height:28rem)]:sr-only">
          <span className="group-data-[fit=large]/draft-hero:hidden group-data-[fit=small]/draft-hero:hidden">
            {gt("What should we build?")}
          </span>
          <span className="hidden group-data-[fit=large]/draft-hero:inline group-data-[fit=small]/draft-hero:inline">
            {buildIn}
          </span>
        </span>
        <span className="flex min-w-0 max-w-full items-baseline justify-center font-medium text-base tracking-normal group-data-[fit=large]/draft-hero:text-hero group-data-[fit=large]/draft-hero:tracking-hero group-data-[fit=small]/draft-hero:text-2xl group-data-[fit=small]/draft-hero:tracking-hero">
          <span className="min-w-0">{children}</span>
          {/* Clicks pass through to the project picker, whose hover covers it. */}
          <span className="pointer-events-none hidden shrink-0 whitespace-pre font-medium group-data-[fit=large]/draft-hero:inline group-data-[fit=small]/draft-hero:inline [@media(max-height:28rem)]:hidden!">
            {buildInSuffix}
          </span>
        </span>
      </h1>
    </div>
  );
}
