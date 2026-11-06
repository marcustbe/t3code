import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { useAtomValue } from "@effect/atom-react";
import { useClientSettings, useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { shortcutLabelForCommand } from "../../keybindings";
import {
  navigateHistory,
  useCanNavigateHistory,
  type HistoryDirection,
} from "../../navigationHistory";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { cn } from "../../lib/utils";
import { usePullRequestsSupported } from "../../state/environments";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebarMobileControls,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import {
  isSettingsPage,
  isSidebarUtilityPage,
  useCloseAppModal,
  useNavigateToMainApp,
} from "./mainAppLocation";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { observeResize } from "~/lib/observeResize";
import {
  ArrowLeftSymbol,
  HISTORY_ARROW_SIZE,
  HISTORY_ARROW_STROKE,
  SettingsSymbol,
  UsageSymbol,
} from "./SidebarSymbols";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode,
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          variant={backdropVariant ? "media-navigation" : "ghost"}
          className="relative top-auto translate-y-0"
          aria-label="Toggle main sidebar"
        />
      </div>
      {/* The sidebar toggle and history arrows float above this row (SidebarControl), so they
          stay put when the sidebar collapses. */}
      <div className="relative z-10 ml-[var(--workspace-titlebar-content-left)] flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
});

/** Measures the window controls, toggle and history arrows, so the sidebar never gets narrower. */
export function SidebarBrandWidthProbe({
  onWidthChange,
}: {
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex gap-1" />
    </div>
  );
}

/** Back and forward, beside the sidebar toggle; desktop only. */
export function HistoryNavigationButtons({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    // 24px hover boxes like the top bar's right-side toggles; 2px inset keeps the arrows where the
    // overlapping 28px buttons had them.
    <div className="pointer-events-auto ml-0.5 flex items-center">
      <HistoryNavigationButton direction="back" onBackdrop={onBackdrop} />
      <HistoryNavigationButton direction="forward" onBackdrop={onBackdrop} />
    </div>
  );
}

function HistoryNavigationButton({
  direction,
  onBackdrop,
}: {
  direction: HistoryDirection;
  onBackdrop: boolean;
}) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const enabled = useCanNavigateHistory(direction);
  const label = direction === "back" ? "Go back" : "Go forward";
  const shortcutLabel = shortcutLabelForCommand(
    keybindings,
    direction === "back" ? "navigation.back" : "navigation.forward",
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              "[-webkit-app-region:no-drag]",
              onBackdrop && "relative top-auto translate-y-0",
            )}
            disabled={!enabled}
            onClick={() => navigateHistory(direction)}
            size="icon-xs"
            variant={onBackdrop ? "media-navigation" : "ghost"}
          />
        }
      >
        <ArrowLeftSymbol
          {...HISTORY_ARROW_STROKE}
          className={cn(
            HISTORY_ARROW_SIZE,
            "text-(--sidebar-icon-color)",
            direction === "forward" && "-scale-x-100",
          )}
        />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {label}
        {shortcutLabel ? ` (${shortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
  className,
  isActive = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  isActive?: boolean;
}) {
  return (
    <SidebarMenuItem className={cn("shrink-0", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              aria-label={label}
              aria-pressed={isActive}
              isActive={isActive}
              onClick={onClick}
              size="icon"
            >
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebarMobileControls();
  const closeAppModal = useCloseAppModal();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  // Settings and Usage toggle: their footer button opens the page and, pressed again, leaves it.
  const settingsOpen = useLocation({ select: (location) => isSettingsPage(location.pathname) });
  const usageOpen = useLocation({ select: (location) => location.pathname === "/usage" });
  const showPullRequests = useClientSettings((settings) => settings.sidebarShowPullRequests);
  const pullRequestsSupported = usePullRequestsSupported() && showPullRequests;
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handlePullRequestsClick = () => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  };
  const handleSettingsClick = () => {
    closeMobileSidebar();
    if (settingsOpen) {
      void closeAppModal();
      return;
    }
    // Straight to the first section: "/settings" only redirects there, costing a second navigation.
    void navigate({ to: "/settings/general" });
  };

  const handleUsageClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (usageOpen) {
      void closeAppModal();
      return;
    }
    void navigate({ to: "/usage" });
  };

  const handleBackClick = () => {
    closeMobileSidebar();
    void navigateToMainApp();
  };

  return (
    <SidebarMenu className="flex-row items-center">
      {isOnUtilityPage ? (
        <>
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton onClick={handleBackClick}>
              <ArrowLeftIcon />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarUpdatePill />
        </>
      ) : (
        <>
          <SidebarUtilityItem
            icon={<SettingsSymbol />}
            label="Settings"
            isActive={settingsOpen}
            onClick={handleSettingsClick}
          />
          <SidebarUpdatePill />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<PullRequestGlyph.pullRequest />}
              label="Pull requests"
              onClick={handlePullRequestsClick}
            />
          ) : null}
        </>
      )}
      {isOnUtilityPage ? null : (
        <SidebarUtilityItem
          // 2px out so the chart's ink, not its padded box, sits 18px from the edge like the rest.
          className="-me-0.5 ml-auto"
          icon={<UsageSymbol />}
          label="Usage"
          isActive={usageOpen}
          onClick={handleUsageClick}
        />
      )}
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
