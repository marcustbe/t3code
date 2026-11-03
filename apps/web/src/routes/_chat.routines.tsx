import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ScheduledTasksSettings } from "../components/settings/ScheduledTasksSettings";
import { SettingsScopeProvider } from "../components/settings/SettingsScopeContext";
import type { SettingsScopeSearch } from "../components/settings/settingsScope";
import { validateScheduledTasksSearch } from "../components/settings/scheduledTasksSettings.logic";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../components/WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { isElectron } from "../env";
import { workspaceAreaProps } from "../lib/workspaceFocus";

// Scheduled tasks as a page of their own, opened from the sidebar's Routines row.
function RoutinesRoute() {
  const target = Route.useSearch();
  const [scope, setScope] = useState<SettingsScopeSearch>({});
  const contentArea = workspaceAreaProps("routines", 1, "Routines");
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div {...contentArea} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <WorkspaceBreadcrumb ariaLabel="Routines">
            <WorkspaceBreadcrumbItem current className="truncate">
              <h1 className="truncate">Routines</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
        </WorkspacePageHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <SettingsScopeProvider search={scope} onChange={setScope}>
            <ScheduledTasksSettings {...target} />
          </SettingsScopeProvider>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/routines")({
  validateSearch: validateScheduledTasksSearch,
  component: RoutinesRoute,
});
