import { RouterProvider } from "@tanstack/react-router";

import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { QuitHoldOverlay } from "./components/QuitHoldOverlay";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

// Keep webviews outside the router but inside its atom registry so route changes preserve them.
export function AppRoot({ router }: { readonly router: AppRouter }) {
  return (
    <AppAtomRegistryProvider>
      {/* One tooltip group for the app: once a tooltip has shown, the next one opens at once
          (like macOS toolbars) if the pointer reaches it within 600ms. */}
      <TooltipProvider closeDelay={0} timeout={600}>
        <RouterProvider router={router} />
      </TooltipProvider>
      <ElectronBrowserHost />
      <QuitHoldOverlay />
    </AppAtomRegistryProvider>
  );
}
