import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { useGT } from "gt-react";
import { useRef, useState, type ReactNode } from "react";

import { useCloseAppModal } from "../sidebar/mainAppLocation";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Settings floating over the window (Settings › Appearance › Floating settings panel). Esc, the
 * close button or a press outside the panel returns to the page that opened it. Keyboard guards
 * that skip dialogs exempt `[data-app-modal]`, because Settings owns its shortcuts. It opens
 * and closes with no animation.
 */
export function SettingsFloatingPanel({ children }: { children: ReactNode }) {
  const gt = useGT();
  const closeAppModal = useCloseAppModal();
  const [open, setOpen] = useState(true);
  // Text selection that ends outside the panel is not a dismissal.
  const outsidePressRef = useRef(false);
  // Focus the surface, not its first control, so no stray focus ring shows.
  const popupRef = useRef<HTMLDivElement>(null);

  return (
    <DialogPrimitive.Root
      open={open}
      // Portaled layers outside this tree (toasts, confirm dialogs) are not outside presses.
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) void closeAppModal();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Viewport
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:px-18 sm:py-14"
          onPointerDown={(event) => {
            outsidePressRef.current = event.target === event.currentTarget;
          }}
          onClick={(event) => {
            if (outsidePressRef.current && event.target === event.currentTarget) setOpen(false);
            outsidePressRef.current = false;
          }}
        >
          <DialogPrimitive.Popup
            ref={popupRef}
            initialFocus={popupRef}
            finalFocus={false}
            aria-label={gt("Settings")}
            data-slot="dialog-popup"
            data-app-modal=""
            data-settings-floating-panel=""
            className="relative flex size-full max-h-[64rem] max-w-[96rem] min-h-0 min-w-0 overflow-hidden rounded-2xl bg-background text-foreground outline-none [-webkit-app-region:no-drag]"
          >
            {children}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function SettingsFloatingPanelClose() {
  const gt = useGT();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <DialogPrimitive.Close
            aria-label={gt("Close settings")}
            render={<Button size="icon-sm" variant="ghost" />}
          />
        }
      >
        <XIcon />
      </TooltipTrigger>
      <TooltipPopup side="bottom">{gt("Close (Esc)")}</TooltipPopup>
    </Tooltip>
  );
}
