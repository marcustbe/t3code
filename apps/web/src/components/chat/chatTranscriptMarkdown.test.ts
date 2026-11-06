import { describe, expect, it } from "vite-plus/test";
import type { TimelineEntry } from "../../session-logic";
import { chatTranscriptMarkdown } from "./chatTranscriptMarkdown";

const message = (id: string, role: "user" | "assistant", text: string) =>
  ({
    id,
    kind: "message",
    createdAt: "2026-11-05T00:00:00.000Z",
    message: {
      id,
      role,
      text,
      runId: null,
      streaming: false,
      createdAt: "2026-11-05T00:00:00.000Z",
      updatedAt: "2026-11-05T00:00:00.000Z",
    },
  }) as unknown as TimelineEntry;

describe("chatTranscriptMarkdown", () => {
  it("keeps what was said, merges a reply's messages, and drops work rows", () => {
    const work = { id: "w", kind: "work", createdAt: "" } as unknown as TimelineEntry;
    expect(
      chatTranscriptMarkdown([
        message("1", "user", "Hi **there**"),
        message("2", "assistant", "First part"),
        work,
        message("3", "assistant", "Second part"),
        message("4", "assistant", "   "),
        message("5", "user", "Thanks"),
      ]),
    ).toBe(
      "## You\n\nHi **there**\n\n## Assistant\n\nFirst part\n\nSecond part\n\n## You\n\nThanks\n",
    );
  });
});
