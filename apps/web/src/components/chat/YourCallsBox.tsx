import { CircleHelpIcon, QuoteIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";

const DISMISSED_KEY = "ghost:dismissed-your-calls:v1";

function readDismissed(): ReadonlySet<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

/** After a finished turn: the "Your call: …" steps the agent left open for the user. */
export function YourCallsBox({
  listId,
  calls,
  onQuote,
}: {
  readonly listId: string;
  readonly calls: ReadonlyArray<{ readonly id: string; readonly question: string }>;
  readonly onQuote: (question: string, source: HTMLElement) => void;
}) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const shown = calls.filter((call) => !dismissed.has(`${listId}:${call.id}`));
  if (shown.length === 0) return null;
  const dismiss = (callId: string) => {
    const next = new Set(dismissed).add(`${listId}:${callId}`);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-200)));
    } catch {
      // Storage can be unavailable; the call stays hidden for this session only.
    }
  };
  return (
    <div className="chat-content-lane">
      <section
        aria-label="Waiting on you"
        data-your-calls="true"
        className="flex flex-col gap-1.5 rounded-2xl border border-foreground/8 px-4 py-3 text-chat leading-relaxed text-foreground"
      >
        <p className="text-xs text-muted-foreground">Waiting on you</p>
        <ul className="flex flex-col gap-1.5">
          {shown.map((call) => (
            <li key={call.id} className="flex min-w-0 items-start gap-2">
              <span aria-hidden className="flex h-lh flex-none items-center">
                <CircleHelpIcon className="size-3.5 text-foreground" />
              </span>
              <span data-your-call-text="true" className="min-w-0 flex-1 wrap-anywhere">
                {call.question}
              </span>
              <span className="flex flex-none items-center gap-0.5">
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={`Dismiss: ${call.question}`}
                  title="Dismiss"
                  onClick={() => dismiss(call.id)}
                >
                  <XIcon />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={`Cite in message: ${call.question}`}
                  title="Cite in message"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    const text = event.currentTarget
                      .closest("li")
                      ?.querySelector<HTMLElement>("[data-your-call-text]");
                    if (text) onQuote(call.question, text);
                  }}
                >
                  <QuoteIcon />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
