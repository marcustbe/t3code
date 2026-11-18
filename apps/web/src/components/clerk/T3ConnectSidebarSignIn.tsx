import { useAuth, useClerk, useUser } from "@clerk/react";
import { T } from "gt-react";
import { LogOutIcon, UserRoundCogIcon } from "lucide-react";
import type { ReactNode } from "react";

import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { Menu, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { retryClerkLoad, useClerkLoadFailed } from "./clerkLoadFailure";
import { useT3ConnectAccountPage } from "./T3ConnectAccountPages";
import { useT3ConnectAuthPrompt } from "./useT3ConnectAuthPrompt";

/** Settings' "Account" section: the T3 Connect account, tiled like the other sections. */
export function T3ConnectSettingsAccountRow({ tile }: { tile: ReactNode }) {
  if (!hasCloudPublicConfig()) return null;

  return <ConfiguredT3ConnectSettingsAccountRow tile={tile} />;
}

function ConfiguredT3ConnectSettingsAccountRow({ tile }: { tile: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const loadFailed = useClerkLoadFailed();
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  const accountPage = useT3ConnectAccountPage();

  if (loadFailed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={retryClerkLoad}>
            {tile}
            <span className="truncate">
              <T>Retry T3 Connect</T>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={openAuthPrompt}>
            {tile}
            <span className="truncate">
              <T>Account</T>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            render={
              <SidebarMenuButton>
                {tile}
                <span className="truncate">
                  <T>Account</T>
                </span>
              </SidebarMenuButton>
            }
          />
          <MenuPopup align="start" side="bottom" className="min-w-56">
            {user?.primaryEmailAddress ? (
              <MenuGroupLabel>{user.primaryEmailAddress.emailAddress}</MenuGroupLabel>
            ) : null}
            {accountPage.open ? (
              <MenuItem onClick={() => accountPage.open?.()}>
                <UserRoundCogIcon />
                <T>Manage account</T>
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem onClick={() => void clerk.signOut()}>
              <LogOutIcon />
              <T>Sign out</T>
            </MenuItem>
          </MenuPopup>
        </Menu>
        {accountPage.portals}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
