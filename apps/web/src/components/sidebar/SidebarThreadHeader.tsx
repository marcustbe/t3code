import { Link, useLocation } from "@tanstack/react-router";
import {
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "~/lib/utils";
import { SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  AddProjectSymbol,
  ComposeSymbol,
  NewChatSymbol,
  RoutinesSymbol,
  SearchSymbol,
} from "./SidebarSymbols";

export interface SidebarThreadHeaderProps {
  searchFieldRef?: RefObject<HTMLDivElement | null>;
  hasProjects: boolean;
  projectScope: ReactNode;
  onNewProject: () => void;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  onSearch: () => void;
  searchShortcutLabel: string | null | undefined;
  onNavigate: () => void;
}

export function SidebarThreadHeader({
  searchFieldRef,
  hasProjects,
  projectScope,
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
  // with the project filter left and add project / new thread right. The toolbar's 28px buttons
  // sit 3px in so their icons line up with the row icons above.
  return (
    <div className="flex flex-col">
      <ul className="flex w-full min-w-0 flex-col">
        <SidebarMenuItem>
          <SidebarMenuButton
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
            isActive={routinesActive}
            render={<Link to="/routines" onClick={onNavigate} />}
          >
            <RoutinesSymbol />
            <span>Routines</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* Search opens the ⌘K palette, which searches threads, projects and commands. */}
        <SidebarMenuItem>
          <div ref={searchFieldRef}>
            <SidebarMenuButton
              onClick={onSearch}
              title={searchShortcutLabel ? `Search (${searchShortcutLabel})` : "Search"}
            >
              <SearchSymbol />
              <span>Search</span>
            </SidebarMenuButton>
          </div>
        </SidebarMenuItem>
      </ul>
      {/* 22px from the Search icon to the toolbar icons, the same as from the window buttons to New. */}
      <div className="mt-1.5 -mb-1 flex items-center justify-between px-0.75">
        {/* Out to the rows' edge: the filter pads itself 8px like a row (Sidebar.tsx). */}
        <div className="-ms-0.75 flex items-center">{hasProjects ? projectScope : null}</div>
        {/* Pulled 3px out so the compose icon's ink ends on the rows' right line, like the times. */}
        <div className="-me-0.75 flex items-center">
          <SidebarHeaderIconButton label="Add project" onClick={onNewProject}>
            <AddProjectSymbol />
          </SidebarHeaderIconButton>
          <SidebarHeaderIconButton
            label="New thread"
            tooltip={newThreadLabel}
            disabled={newThreadDisabled}
            onClick={onNewThread}
          >
            <ComposeSymbol />
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
            className={cn("relative size-7 shrink-0", className)}
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
