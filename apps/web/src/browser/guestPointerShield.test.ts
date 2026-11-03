import { describe, expect, it } from "vite-plus/test";

import { shieldEmbeddedContent } from "./guestPointerShield";

describe("shieldEmbeddedContent", () => {
  it("keeps guests unhittable until the last overlapping drag ends, then restores them", () => {
    const webview = { style: { pointerEvents: "" } };
    const iframe = { style: { pointerEvents: "auto" } };
    const doc = { querySelectorAll: () => [webview, iframe] } as unknown as Document;

    const releaseFirst = shieldEmbeddedContent(doc);
    const releaseSecond = shieldEmbeddedContent(doc);
    expect([webview.style.pointerEvents, iframe.style.pointerEvents]).toEqual(["none", "none"]);

    releaseFirst();
    releaseFirst();
    expect(webview.style.pointerEvents).toBe("none");

    releaseSecond();
    expect([webview.style.pointerEvents, iframe.style.pointerEvents]).toEqual(["", "auto"]);
  });
});
