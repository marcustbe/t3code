import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import { renderCodexDirectivesForCopy } from "@t3tools/shared/codexMarkdownDirectives";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { resolveUserMessageContext } from "../../lib/composerContextRecords";
import type { TimelineEntry } from "../../session-logic";

type Speaker = "You" | "Assistant" | "Agent" | "Automation" | string;

function userSpeaker(presentation: ReturnType<typeof resolveUserMessagePresentation>): Speaker {
  switch (presentation.attribution) {
    case "agent":
      return "Agent";
    case "automation":
      return "Automation";
    case "guest":
      return presentation.guestName?.trim() || "Guest";
    default:
      return "You";
  }
}

/**
 * The conversation as Markdown: what was said, under a heading per speaker.
 * Tool calls, work logs and other app chrome are left out.
 */
export function chatTranscriptMarkdown(entries: ReadonlyArray<TimelineEntry>): string {
  const sections: Array<{ speaker: Speaker; parts: string[] }> = [];
  const say = (speaker: Speaker, text: string) => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    const last = sections.at(-1);
    if (last?.speaker === speaker) last.parts.push(trimmed);
    else sections.push({ speaker, parts: [trimmed] });
  };

  for (const entry of entries) {
    if (entry.kind === "proposed-plan") {
      say("Assistant", entry.proposedPlan.planMarkdown);
      continue;
    }
    if (entry.kind !== "message") continue;
    const { message } = entry;
    if (message.role === "assistant") {
      say("Assistant", renderCodexDirectivesForCopy(message.text ?? ""));
    } else if (message.role === "user") {
      const presentation = resolveUserMessagePresentation(message);
      const context = resolveUserMessageContext({ ...message, text: presentation.text });
      const text = replaceComposerContextReferences(context.text, (reference) => reference.label);
      say(userSpeaker(presentation), text);
    }
  }

  return sections
    .map(({ speaker, parts }) => `## ${speaker}\n\n${parts.join("\n\n")}`)
    .join("\n\n")
    .concat("\n");
}
