import { CircleCheckIcon, CircleDashedIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { type LatestTodoListState, yourCallQuestion } from "../../session-logic";

/** The agent's task list at the end of the conversation while it works. */
export function PlanChecklist({ todoList }: { readonly todoList: LatestTodoListState }) {
  return (
    <div className="chat-content-lane">
      <ul
        aria-label="Plan"
        data-plan-checklist="true"
        className="flex flex-col gap-1.5 rounded-2xl border border-foreground/8 px-4 py-3 text-chat leading-relaxed text-foreground"
      >
        {todoList.steps.map((step) => (
          <li key={step.id} className="flex min-w-0 items-start gap-2">
            <span aria-hidden className="flex h-lh flex-none items-center">
              {step.status === "completed" ? (
                <CircleCheckIcon className="size-3.5 text-foreground" />
              ) : step.status === "running" ? (
                <RunningRing />
              ) : (
                <CircleDashedIcon className="size-3.5 text-foreground" />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 wrap-anywhere",
                step.status === "completed" && "text-muted-foreground",
              )}
            >
              {yourCallQuestion(step) ?? step.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunningRing() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-foreground" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path
        d="M8 1.5A6.5 6.5 0 0 0 1.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
