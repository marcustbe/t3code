import type { DesktopBrowserExtension, DesktopChromeExtensionCandidate } from "@t3tools/contracts";
import { msg, T, useGT } from "gt-react";
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
import { m } from "~/i18n/messages";

import { previewBridge } from "./previewBridge";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : m(msg("An error occurred."));

/** Unpacked Chrome extensions for every desktop browser profile. Renders nothing outside the desktop app. */
export function PreviewExtensionsMenu(props: { readonly onChanged: () => void }) {
  const gt = useGT();
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
      <MenuSubTrigger>
        <T>Extensions</T>
      </MenuSubTrigger>
      <MenuSubPopup>
        {extensions === null ? (
          <MenuItem disabled>
            <T>Loading…</T>
          </MenuItem>
        ) : extensions.length === 0 ? (
          <MenuItem disabled>
            <T>No extensions</T>
          </MenuItem>
        ) : (
          extensions.map((extension) => (
            <MenuSub key={extension.path}>
              <MenuSubTrigger>
                <span className="min-w-0 max-w-56 truncate">{extension.name}</span>
                <span className="text-xs text-muted-foreground">
                  {extension.error
                    ? gt("Missing", { $context: "extension files not found" })
                    : extension.version}
                </span>
              </MenuSubTrigger>
              <MenuSubPopup>
                <MenuGroupLabel>
                  <span className="block max-w-72 truncate">{extension.path}</span>
                </MenuGroupLabel>
                <MenuItem
                  variant="destructive"
                  onClick={() =>
                    run(gt("Couldn't remove the extension"), () => bridge.remove(extension.path))
                  }
                >
                  <T>Remove</T>
                </MenuItem>
              </MenuSubPopup>
            </MenuSub>
          ))
        )}
        <MenuSeparator />
        <MenuItem onClick={() => run(gt("Couldn't add the extension"), () => bridge.addUnpacked())}>
          <T>Add unpacked extension…</T>
        </MenuItem>
        <MenuSub onOpenChange={(open) => open && refreshChrome()}>
          <MenuSubTrigger>
            <T>Import from Chrome</T>
          </MenuSubTrigger>
          <MenuSubPopup>
            {chromeCandidates === null ? (
              <MenuItem disabled>
                <T>Loading…</T>
              </MenuItem>
            ) : chromeCandidates.length === 0 ? (
              <MenuItem disabled>
                <T>No Chrome extensions found</T>
              </MenuItem>
            ) : (
              chromeCandidates.map((candidate) => (
                <MenuItem
                  key={candidate.path}
                  disabled={importedChromeIds.has(candidate.chromeId)}
                  onClick={() =>
                    run(gt("Couldn't import the extension"), () =>
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
