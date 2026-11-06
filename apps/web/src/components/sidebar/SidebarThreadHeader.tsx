import { Link, useLocation } from "@tanstack/react-router";
import { type ComponentProps, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { SectionChevron } from "../ui/collapsible-section-header";
import { SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { AddProjectSymbol, NewChatSymbol, RoutinesSymbol, SearchSymbol } from "./SidebarSymbols";

// 28px rows with a 7px icon gap (his pick, 2026-11-05): the default 32px/8px felt loose around
// the 12px labels. Labels and icons take the chat titles' colour, not the dimmer muted one
// (2026-11-06).
const NAV_ROW_CLASS = "h-7 gap-[7px] text-foreground [&>svg]:text-foreground!";

export interface SidebarThreadHeaderProps {
  hasProjects: boolean;
  projectScope: ReactNode;
  doneExpanded: boolean;
  onToggleDone: () => void;
  onNewProject: () => void;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  onSearch: () => void;
  searchShortcutLabel: string | null | undefined;
  onNavigate: () => void;
}

export function SidebarThreadHeader({
  hasProjects,
  projectScope,
  doneExpanded,
  onToggleDone,
  onNewProject,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  onSearch,
  searchShortcutLabel,
  onNavigate,
}: SidebarThreadHeaderProps) {
  const routinesActive = useLocation({ select: (location) => location.pathname === "/routines" });
  const newThreadLabel = newThreadShortcutLabel
    ? `New thread (${newThreadShortcutLabel})`
    : "New thread";

  // Laid out after his Figma (node 21:1129): New, Routines and Search rows, then the list toolbar
  // with the "Done" heading left and the project filter / add project right.
  return (
    <div className="flex flex-col">
      <ul className="flex w-full min-w-0 flex-col">
        <SidebarMenuItem>
          <SidebarMenuButton
            className={NAV_ROW_CLASS}
            disabled={newThreadDisabled}
            onClick={onNewThread}
            title={newThreadLabel}
          >
            <NewChatSymbol />
            <span>New</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            className={NAV_ROW_CLASS}
            isActive={routinesActive}
            render={<Link to="/routines" onClick={onNavigate} />}
          >
            <RoutinesSymbol />
            <span>Routines</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* Search opens the ⌘K palette, which searches threads, projects and commands. */}
        <SidebarMenuItem>
          <div>
            <SidebarMenuButton
              className={NAV_ROW_CLASS}
              onClick={onSearch}
              title={searchShortcutLabel ? `Search (${searchShortcutLabel})` : "Search"}
            >
              <SearchSymbol />
              <span>Search</span>
            </SidebarMenuButton>
          </div>
        </SidebarMenuItem>
      </ul>
      {/* 26px from the Search icon to the toolbar icons, matching the gap above New. "Done" heads
          the chats that need nothing from the agent; Working and Settled follow below the list. */}
      <div className="mt-3.5 -mb-1 flex items-center justify-between px-0.75">
        {/* Starts 8px into the rows like the shelf headers' labels; folds the finished chats. Its
            hover runs right up to the project filter's hover square (flex-1, no gap), his ask; -me-0.5
            reaches past the filter's 2px clear border to its 24px grey. */}
        <button
          type="button"
          aria-expanded={doneExpanded}
          onClick={onToggleDone}
          data-testid="sidebar-done-shelf-toggle"
          className="-ms-0.75 -me-0.5 flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-start gap-1 rounded-lg ps-2 pe-2 text-xs font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        >
          Done
          <SectionChevron expanded={doneExpanded} />
        </button>
        {/* Pulled 3px out so the add-project icon's ink ends on the rows' right line, like the times. */}
        <div className="-me-0.75 flex items-center">
          {hasProjects ? projectScope : null}
          <SidebarHeaderIconButton label="Add project" onClick={onNewProject}>
            <AddProjectSymbol />
          </SidebarHeaderIconButton>
        </div>
      </div>
    </div>
  );
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
