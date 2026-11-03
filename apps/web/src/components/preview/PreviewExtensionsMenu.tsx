import type { DesktopBrowserExtension, DesktopChromeExtensionCandidate } from "@t3tools/contracts";
import { useState } from "react";

import {
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/components/ui/menu";
import { toastManager } from "~/components/ui/toast";

import { previewBridge } from "./previewBridge";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "An error occurred.";

/** Unpacked Chrome extensions for every desktop browser profile. Renders nothing outside the desktop app. */
export function PreviewExtensionsMenu(props: { readonly onChanged: () => void }) {
  const bridge = previewBridge?.extensions;
  const [extensions, setExtensions] = useState<ReadonlyArray<DesktopBrowserExtension> | null>(null);
  const [chromeCandidates, setChromeCandidates] =
    useState<ReadonlyArray<DesktopChromeExtensionCandidate> | null>(null);
  if (!bridge) return null;

  const refresh = () => {
    void bridge.list().then(setExtensions, () => setExtensions([]));
  };
  const refreshChrome = () => {
    void bridge.listChromeCandidates().then(setChromeCandidates, () => setChromeCandidates([]));
  };
  const run = (title: string, operation: () => Promise<unknown>) => {
    void operation().then(
      (result) => {
        refresh();
        if (result !== null) props.onChanged();
      },
      (error: unknown) => {
        toastManager.add({ type: "error", title, description: errorMessage(error) });
      },
    );
  };

  const importedChromeIds = new Set(
    (extensions ?? [])
      .filter((extension) => extension.imported)
      .map((extension) => extension.path.split(/[\\/]/).at(-1)),
  );

  return (
    <MenuSub onOpenChange={(open) => open && refresh()}>
      <MenuSubTrigger>Extensions</MenuSubTrigger>
      <MenuSubPopup>
        {extensions === null ? (
          <MenuItem disabled>Loading…</MenuItem>
        ) : extensions.length === 0 ? (
          <MenuItem disabled>No extensions</MenuItem>
        ) : (
          extensions.map((extension) => (
            <MenuSub key={extension.path}>
              <MenuSubTrigger>
                <span className="min-w-0 max-w-56 truncate">{extension.name}</span>
                <span className="text-xs text-muted-foreground">
                  {extension.error ? "Missing" : extension.version}
                </span>
              </MenuSubTrigger>
              <MenuSubPopup>
                <MenuGroupLabel>
                  <span className="block max-w-72 truncate">{extension.path}</span>
                </MenuGroupLabel>
                <MenuItem
                  variant="destructive"
                  onClick={() =>
                    run("Couldn't remove the extension", () => bridge.remove(extension.path))
                  }
                >
                  Remove
                </MenuItem>
              </MenuSubPopup>
            </MenuSub>
          ))
        )}
        <MenuSeparator />
        <MenuItem onClick={() => run("Couldn't add the extension", () => bridge.addUnpacked())}>
          Add unpacked extension…
        </MenuItem>
        <MenuSub onOpenChange={(open) => open && refreshChrome()}>
          <MenuSubTrigger>Import from Chrome</MenuSubTrigger>
          <MenuSubPopup>
            {chromeCandidates === null ? (
              <MenuItem disabled>Loading…</MenuItem>
            ) : chromeCandidates.length === 0 ? (
              <MenuItem disabled>No Chrome extensions found</MenuItem>
            ) : (
              chromeCandidates.map((candidate) => (
                <MenuItem
                  key={candidate.path}
                  disabled={importedChromeIds.has(candidate.chromeId)}
                  onClick={() =>
                    run("Couldn't import the extension", () =>
                      bridge.importFromChrome(candidate.path),
                    )
                  }
                >
                  <span className="min-w-0 max-w-56 truncate">{candidate.name}</span>
                  <span className="max-w-40 truncate text-xs text-muted-foreground">
                    {candidate.profileName}
                  </span>
                </MenuItem>
              ))
            )}
          </MenuSubPopup>
        </MenuSub>
      </MenuSubPopup>
    </MenuSub>
  );
}
