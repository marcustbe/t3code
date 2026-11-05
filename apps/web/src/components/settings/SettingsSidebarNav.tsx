import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import {
  ArchiveIcon,
  FlaskConicalIcon,
  BotIcon,
  createLucideIcon,
  CalendarClockIcon,
  FileDiffIcon,
  FolderTreeIcon,
  GitBranchIcon,
  GlobeIcon,
  InfoIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  PanelsTopLeftIcon,
  KeyboardIcon,
  KeyRoundIcon,
  PaletteIcon,
  SearchIcon,
  ServerIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SmartphoneIcon,
  WrenchIcon,
  XIcon,
  UserRoundIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarInput,
} from "../ui/sidebar";
import { scrollToSettingsTarget } from "./settingsLayout";
import {
  searchSettings,
  revealSettingsSearchTarget,
  SETTINGS_NAV_GROUPS,
  SETTINGS_SECTION_LABELS,
  type SettingsPath,
  type SettingsSearchItem,
} from "./settingsSearch";
import { useAvailableSettingsSearchItems } from "./useAvailableSettingsSearchItems";
import { validateSettingsScopeSearch } from "./settingsScope";
import { useSettingsSectionNavigation } from "./useSettingsSectionNavigation";
import { cn } from "../../lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";

const SnapShotIcon = createLucideIcon("snap-shot", [
  [
    "path",
    {
      d: "M8 3H6a3 3 0 0 0-3 3v2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2",
      key: "capture-frame",
    },
  ],
  ["rect", { width: "10", height: "8", x: "7", y: "8", rx: "2", key: "window" }],
  ["circle", { cx: "12", cy: "12", r: "1.5", key: "lens" }],
]);

const T3ConnectSettingsAccountRow = lazy(() =>
  import("../clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSettingsAccountRow,
  })),
);

const SETTINGS_SECTION_ICONS: Readonly<
  Record<SettingsPath, ComponentType<{ className?: string }>>
> = {
  "/settings/general": Settings2Icon,
  "/settings/diagnostics": WrenchIcon,
  "/settings/appearance": PaletteIcon,
  "/settings/chat": MessageSquareTextIcon,
  "/settings/diffs": FileDiffIcon,
  "/settings/projects": PanelsTopLeftIcon,
  "/settings/keybindings": KeyboardIcon,
  "/settings/snap-shot": SnapShotIcon,
  "/settings/providers": BotIcon,
  "/settings/threads": MessagesSquareIcon,
  "/settings/browser": GlobeIcon,
  "/settings/devices": SmartphoneIcon,
  "/settings/scheduled-tasks": CalendarClockIcon,
  "/settings/source-control": GitBranchIcon,
  "/settings/worktrees": FolderTreeIcon,
  "/settings/connections": ServerIcon,
  "/settings/access": ShieldCheckIcon,
  "/settings/secrets": KeyRoundIcon,
  "/settings/maintenance": WrenchIcon,
  "/settings/labs": FlaskConicalIcon,
  "/settings/about": InfoIcon,
  "/settings/archived": ArchiveIcon,
};

// Each section's icon sits on a coloured tile, like macOS System Settings: a top-to-bottom
// gradient a step lighter and darker than the base colour.
// "/settings/account" is the T3 Connect Account row (no page of its own), tiled like a section.
const SETTINGS_SECTION_TILES: Readonly<Record<SettingsPath | "/settings/account", string>> = {
  // oxlint-disable-next-line shadcn/no-raw-colors -- tile colours mirror macOS System Settings, like the rows below
  "/settings/account": "bg-linear-to-b from-cyan-400 to-cyan-600",
  "/settings/general": "bg-linear-to-b from-zinc-400 to-zinc-600",
  "/settings/diagnostics": "bg-linear-to-b from-zinc-400 to-zinc-600",
  "/settings/appearance": "bg-linear-to-b from-blue-400 to-blue-600",
  "/settings/chat": "bg-linear-to-b from-green-400 to-green-600",
  "/settings/diffs": "bg-linear-to-b from-orange-400 to-orange-600",
  "/settings/projects": "bg-linear-to-b from-indigo-400 to-indigo-600",
  "/settings/keybindings": "bg-linear-to-b from-zinc-400 to-zinc-600",
  "/settings/snap-shot": "bg-linear-to-b from-pink-400 to-pink-600",
  "/settings/providers": "bg-linear-to-b from-violet-400 to-violet-600",
  "/settings/threads": "bg-linear-to-b from-teal-400 to-teal-600",
  "/settings/browser": "bg-linear-to-b from-sky-400 to-sky-600",
  "/settings/devices": "bg-linear-to-b from-zinc-400 to-zinc-600",
  "/settings/scheduled-tasks": "bg-linear-to-b from-red-400 to-red-600",
  "/settings/source-control": "bg-linear-to-b from-orange-500 to-orange-700",
  "/settings/worktrees": "bg-linear-to-b from-amber-400 to-amber-600",
  "/settings/connections": "bg-linear-to-b from-blue-500 to-blue-700",
  "/settings/access": "bg-linear-to-b from-green-500 to-green-700",
  "/settings/secrets": "bg-linear-to-b from-yellow-400 to-yellow-600",
  "/settings/maintenance": "bg-linear-to-b from-zinc-400 to-zinc-600",
  "/settings/labs": "bg-linear-to-b from-purple-400 to-purple-600",
  "/settings/about": "bg-linear-to-b from-zinc-300 to-zinc-500",
  "/settings/archived": "bg-linear-to-b from-stone-400 to-stone-600",
};

// Detail pages without a nav entry highlight the page that links to them.
const SETTINGS_DETAIL_PAGE_PARENTS: Readonly<Record<string, SettingsPath>> = {
  "/settings/diagnostics": "/settings/maintenance",
  "/settings/open-source-licenses": "/settings/about",
};

// Attached only to the highlighted result, so it runs whenever the highlight lands on a row.
function scrollResultIntoView(row: HTMLElement | null) {
  row?.scrollIntoView({ block: "nearest" });
}

function AccountTile() {
  return (
    <span
      aria-hidden
      data-settings-tile=""
      className={cn(
        "flex size-icon-tile shrink-0 items-center justify-center rounded-md text-white",
        SETTINGS_SECTION_TILES["/settings/account"],
      )}
    >
      <UserRoundIcon className="size-icon-sm" />
    </span>
  );
}

function SettingsSectionIcon({ to }: { to: SettingsPath }) {
  const Icon = SETTINGS_SECTION_ICONS[to];
  return (
    <span
      aria-hidden
      data-settings-tile=""
      className={cn(
        "flex size-icon-tile shrink-0 items-center justify-center rounded-md text-white",
        SETTINGS_SECTION_TILES[to],
      )}
    >
      <Icon className="size-icon-sm" />
    </span>
  );
}

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navArea = workspaceAreaProps("settings-nav", 0, "Settings sections");
  const navigate = useNavigate();
  const currentHash = useLocation({ select: (location) => location.hash });
  const currentSearch = useLocation({ select: (location) => location.search });
  const scopeSearch = validateSettingsScopeSearch(currentSearch);
  const activePath = SETTINGS_DETAIL_PAGE_PARENTS[pathname] ?? pathname;
  const navPaths = SETTINGS_NAV_GROUPS.flatMap((group) => group.paths);
  const sectionNavigation = useSettingsSectionNavigation(
    navPaths.find((to) => activePath === to || activePath.startsWith(`${to}/`)) ??
      navPaths[0] ??
      "",
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const searchableItems = useAvailableSettingsSearchItems(scopeSearch);
  const results = searchSettings(query, searchableItems);
  const isSearching = query.trim().length > 0;
  const hasResults = results.length > 0;
  const maxResultIndex = Math.max(results.length - 1, 0);
  // Persist the clamp so a shrink-then-recover of results keeps the clamped highlight.
  if (activeResultIndex > maxResultIndex) {
    setActiveResultIndex(maxResultIndex);
  }

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener for the find and slash search shortcuts
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const isFindShortcut =
        event.key.toLowerCase() === "f" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      const isSlashShortcut =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isFindShortcut && !isSlashShortcut) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        ((isSlashShortcut &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)) ||
          target.closest(
            '[role="dialog"]:not([data-app-modal]), [aria-modal="true"]:not([data-app-modal]), [data-slot$="popup"]:not([data-app-modal]), [data-keybinding-capture]',
          ) !== null)
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSectionClick = (to: SettingsPath) => {
    void navigate({
      to,
      hash: "",
      replace: true,
      hashScrollIntoView: false,
    });
  };

  const clearSearch = () => {
    setQuery("");
    setActiveResultIndex(0);
  };
  const handleSearchResultClick = (item: SettingsSearchItem) => {
    clearSearch();
    const targetId = item.targetId ?? item.id;
    revealSettingsSearchTarget(targetId);
    if (pathname === item.to && currentHash.replace(/^#/, "") === targetId) {
      scrollToSettingsTarget(targetId);
      return;
    }
    void navigate({
      to: item.to,
      hash: targetId,
      replace: true,
      hashScrollIntoView: false,
      state: { settingsTargetHighlight: true },
    });
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && isSearching) {
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((activeResultIndex + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((activeResultIndex - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeResultIndex];
      if (result) handleSearchResultClick(result);
    }
  };

  return (
    <nav
      {...navArea}
      role="navigation"
      // Fills the app sidebar below its Back row (AppSidebarLayout).
      className="flex min-h-0 flex-1 flex-col text-sidebar-foreground"
    >
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup>
          <div className="flex flex-col gap-2">
            {/* A field, so it keeps a fill at rest (the open row's grey) and a faint stroke, darker while hovered. */}
            <div className="flex h-8 items-center gap-2 rounded-(--control-radius) bg-sidebar-row-hover ring-1 ring-foreground/6 ring-inset focus-within:ring-foreground/15 px-(--sidebar-row-content-inset) py-1.5 text-sm font-medium text-sidebar-muted-foreground focus-within:bg-sidebar-row-selected hover:bg-sidebar-row-selected hover:text-sidebar-foreground">
              <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
              <SidebarInput
                ref={searchInputRef}
                nativeInput
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveResultIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search"
                aria-label="Search settings"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSearching && hasResults}
                aria-controls={isSearching && hasResults ? "settings-search-results" : undefined}
                aria-activedescendant={
                  isSearching && results[activeResultIndex]
                    ? `settings-search-result-${results[activeResultIndex].id}`
                    : undefined
                }
                className="min-w-0 flex-1"
              />
              {isSearching ? (
                <Button
                  type="button"
                  size="icon-micro"
                  variant="ghost-muted"
                  className="shrink-0"
                  aria-label="Clear settings search"
                  onClick={() => {
                    clearSearch();
                    searchInputRef.current?.focus();
                  }}
                >
                  <XIcon className="size-3" />
                </Button>
              ) : (
                <Kbd>/</Kbd>
              )}
            </div>
            {isSearching && results.length === 0 ? (
              <p
                role="status"
                className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground"
              >
                No settings found
              </p>
            ) : null}
            {isSearching ? (
              <SidebarMenu
                id={hasResults ? "settings-search-results" : undefined}
                role={hasResults ? "listbox" : undefined}
                aria-label={hasResults ? "Settings search results" : undefined}
              >
                {results.map((item, index) => (
                  <SidebarMenuItem
                    key={item.id}
                    role="presentation"
                    ref={index === activeResultIndex ? scrollResultIntoView : undefined}
                  >
                    <SidebarMenuButton
                      id={`settings-search-result-${item.id}`}
                      role="option"
                      aria-selected={index === activeResultIndex}
                      tabIndex={-1}
                      size="sm"
                      isActive={index === activeResultIndex}
                      className="h-auto min-h-10 items-start"
                      onMouseMove={() => setActiveResultIndex(index)}
                      onClick={() => handleSearchResultClick(item)}
                    >
                      <SettingsSectionIcon to={item.to} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-sidebar-foreground">
                          {item.title}
                        </span>
                        <span className="block truncate text-2xs text-sidebar-muted-foreground/75">
                          {SETTINGS_SECTION_LABELS[item.to]}
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : (
              <div className="flex flex-col gap-4">
                {/* The T3 Connect account leads the sections, like the Apple Account in System Settings. */}
                <Suspense fallback={null}>
                  <T3ConnectSettingsAccountRow tile={<AccountTile />} />
                </Suspense>
                <div
                  {...sectionNavigation.containerProps}
                  role="tree"
                  aria-label="Settings sections"
                  className="flex flex-col gap-4"
                >
                  {SETTINGS_NAV_GROUPS.map((group, index) => (
                    <div
                      key={group.heading ?? index}
                      role="group"
                      aria-label={group.heading ?? undefined}
                      className="flex flex-col gap-1"
                    >
                      {group.heading ? (
                        // The group carries this label; a heading is not a valid tree child.
                        <h3
                          aria-hidden="true"
                          className="px-2 text-xs font-medium text-sidebar-muted-foreground/80"
                        >
                          {group.heading}
                        </h3>
                      ) : null}
                      <SidebarMenu role="presentation">
                        {group.paths.map((to) => {
                          const isActive = activePath === to || activePath.startsWith(`${to}/`);
                          return (
                            <SidebarMenuItem key={to} role="presentation">
                              <SidebarMenuButton
                                data-settings-section={to}
                                role="treeitem"
                                tabIndex={sectionNavigation.tabIndexFor(to)}
                                aria-selected={isActive}
                                aria-current={isActive ? "page" : undefined}
                                isActive={isActive}
                                onClick={() => handleSectionClick(to)}
                              >
                                <SettingsSectionIcon to={to} />
                                <span className="truncate">{SETTINGS_SECTION_LABELS[to]}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SidebarGroup>
      </SidebarContent>
    </nav>
  );
}
