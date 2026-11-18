import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { ClientSettings } from "@t3tools/contracts/settings";
import { createBrowserHistory, createHashHistory } from "@tanstack/react-router";
import * as Schema from "effect/Schema";

import { applyAppearanceContrast } from "./appearanceContrast";
import { applyAppearanceFontVariables, TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "./appearanceFonts";
import { applyAppearanceLayout } from "./appearanceLayout";
import { startElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { startBrowserProfileReporting } from "./browser/BrowserProfileReporter";
import { startPreviewTitleRecording } from "./browserHistoryStore";
import { retainThreadOverlaysForThread } from "./components/chat/threadOverlayRetention";
import { resolveWindowTitleThreadStatus } from "./components/Sidebar.logic";
import { startBackgroundThreadAnnouncements } from "./components/BackgroundThreadAnnouncer";
import { startSshPasswordPromptQueue } from "./components/desktop/SshPasswordPromptDialog";
import { startHostFreezeToasts } from "./components/HostFreezeToastCoordinator";
import { startKeybindingsUpdateToasts } from "./components/KeybindingsUpdateToast";
import { startLegacyThreadMigrationToast } from "./components/LegacyThreadMigrationToast";
import { startPermissionUpdateNotices } from "./components/PermissionUpdateNotice";
import { startAgentOpenedPreviews } from "./components/preview/agentOpenedPreviews";
import { startMainAppLocationTracking } from "./components/sidebar/mainAppLocation";
import { startDesktopUpdateLaunchNotice } from "./components/sidebar/updateEverythingRun";
import { startSlowRpcRequestToasts } from "./components/SlowRpcRequestToastCoordinator";
import { startThreadNotifications } from "./components/ThreadNotificationCoordinator";
import { startGuideRunNotifications } from "./components/pullRequest/guide/PullRequestGuideRunCoordinator";
import { APP_BASE_NAME, APP_DISPLAY_NAME, APP_STAGE_LABEL } from "./branding";
import { resolveServerBackedAppDisplayName, resolveWindowTitle } from "./branding.logic";
import { isElectron } from "./env";
import { isMacPlatform } from "./lib/utils";
import {
  subscribeComposerDraftModelReconciliation,
  subscribeDraftThreadPromotion,
  useComposerDraftStore,
} from "./composerDraftStore";
import { startDefaultThemeAdoption } from "./hooks/useDefaultTheme";
import { startEnvironmentThemeRepaint } from "./hooks/useEnvironmentTheme";
import { startThemeBackground } from "./themeBackground";
import { readLocalStorageValue, subscribeLocalStorageKey } from "./hooks/useLocalStorage";
import { startHostEnvironmentLookup } from "./state/primaryEnvironment";
import {
  getClientSettings,
  startModelPreferencesMigration,
  subscribeClientSettings,
} from "./hooks/useSettings";
import { syncBrowserChromeTheme } from "./hooks/useTheme";
import { startThreadVisitedMigration } from "./hooks/useThreadVisitedMigration";
import { installDesktopPasteAsText } from "./lib/desktopPasteAsText";
import {
  syncDocumentElectronPlatformClasses,
  syncDocumentWindowControlsOverlayClass,
} from "./lib/windowControlsOverlay";
import { startProviderAuthDelivery } from "./providerAuthDelivery";
import { getRouter, type AppRouter } from "./router";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { environmentProjects } from "./state/projects";
import { primaryServerConfigAtom } from "./state/server";
import { environmentShell } from "./state/shell";
import { installChatRouteCommands } from "./shortcuts/chatRouteCommands";
import { startWorkspaceFocus } from "./lib/workspaceFocus";
import { m } from "./i18n/messages";
import { startI18n, subscribeI18n } from "./i18n/runtime";
import { installCommandPaletteCommands } from "./shortcuts/commandPaletteCommands";
import { registerOpenFavoriteEditorCommand } from "./components/chat/OpenInPickerShortcut";
import { environmentThreadShells, threadEnvironment } from "./state/threads";
import { resolveActiveThreadRouteRef, resolveThreadRouteTarget } from "./threadRoutes";

// Only the macOS desktop app can show the desktop through the window.
const WINDOW_TRANSLUCENCY_SUPPORTED = isElectron && isMacPlatform(navigator.platform);

if (isMacPlatform(navigator.platform)) {
  document.documentElement.dataset.nativeScrollbars = "true";
}

// macOS "Reduce transparency" (Accessibility › Display) keeps the window solid whatever the
// opacity sliders say.
const reducedTransparencyQuery = window.matchMedia("(prefers-reduced-transparency: reduce)");

/** See-through surfaces: the CSS tints them, the desktop app clears and blurs the window behind. */
function applyWindowTranslucency(root: HTMLElement, settings: ClientSettings): void {
  const reduced = reducedTransparencyQuery.matches;
  const sidebarOpacity = reduced ? 100 : settings.sidebarSurfaceOpacity;
  const contentOpacity = reduced ? 100 : settings.contentSurfaceOpacity;
  const panelOpacity = reduced ? 100 : settings.panelSurfaceOpacity;
  root.style.setProperty("--sidebar-surface-opacity", `${sidebarOpacity}%`);
  root.style.setProperty("--content-surface-opacity", `${contentOpacity}%`);
  root.style.setProperty("--panel-surface-opacity", `${panelOpacity}%`);
  const translucent =
    WINDOW_TRANSLUCENCY_SUPPORTED &&
    (sidebarOpacity < 100 || contentOpacity < 100 || panelOpacity < 100);
  if (translucent) {
    root.dataset.windowTranslucent = "true";
  } else {
    delete root.dataset.windowTranslucent;
  }
  // The main area itself is see-through, so the chat's top bar can't blur (index.css).
  root.toggleAttribute("data-content-translucent", translucent && contentOpacity < 100);
  void window.desktopBridge?.setWindowTranslucent?.({
    enabled: translucent,
    blurRadius: settings.windowBlurRadius,
  });
}

/** Writes appearance settings onto the document, touching only the groups that changed. */
function startClientAppearance(): void {
  const root = document.documentElement;
  let applied: ClientSettings | null = null;
  let appliedSeparateFonts: boolean | null = null;
  const apply = () => {
    const settings = getClientSettings();
    const previous = applied;
    applied = settings;
    const separateFonts = readLocalStorageValue(
      TYPOGRAPHY_ADVANCED_STORAGE_KEY,
      false,
      Schema.Boolean,
    );
    const previousSeparateFonts = appliedSeparateFonts;
    appliedSeparateFonts = separateFonts;
    if (previous?.diffColorScheme !== settings.diffColorScheme) {
      root.dataset.diffColorScheme = settings.diffColorScheme;
    }
    if (previous?.chatWidthPercent !== settings.chatWidthPercent) {
      // index.css turns the fraction into one width from the chat canvas's measured width, so the
      // conversation and the composer always get the same width.
      const percent = settings.chatWidthPercent;
      root.style.setProperty("--chat-width-fraction", String(Math.min(percent, 100) / 100));
      root.toggleAttribute("data-chat-wide", percent > 0);
    }
    if (previous?.appearanceContrast !== settings.appearanceContrast) {
      applyAppearanceContrast(root, settings.appearanceContrast);
    }
    if (previous?.glassOpacity !== settings.glassOpacity) {
      root.style.setProperty("--glass-opacity", `${settings.glassOpacity}%`);
      if (settings.glassOpacity === 100) {
        root.style.setProperty("--glass-blur", "0px");
      } else {
        root.style.removeProperty("--glass-blur");
      }
    }
    if (
      previous?.sidebarSurfaceOpacity !== settings.sidebarSurfaceOpacity ||
      previous.contentSurfaceOpacity !== settings.contentSurfaceOpacity ||
      previous.panelSurfaceOpacity !== settings.panelSurfaceOpacity ||
      previous.windowBlurRadius !== settings.windowBlurRadius
    ) {
      applyWindowTranslucency(root, settings);
    }
    if (
      previous?.backgroundGrain !== settings.backgroundGrain ||
      previous.topBarBlur !== settings.topBarBlur ||
      previous.topBarOpacity !== settings.topBarOpacity ||
      previous.primaryTextStrength !== settings.primaryTextStrength ||
      previous.messageBubbleColor !== settings.messageBubbleColor ||
      previous.messageBubbleColorDark !== settings.messageBubbleColorDark ||
      previous.letterSpacing !== settings.letterSpacing ||
      previous.messageBubbleOpacity !== settings.messageBubbleOpacity ||
      previous.sidebarSidePadding !== settings.sidebarSidePadding ||
      previous.windowTopPadding !== settings.windowTopPadding ||
      previous.sidebarBottomPadding !== settings.sidebarBottomPadding ||
      previous.topBarSidePadding !== settings.topBarSidePadding ||
      previous.browserSidePadding !== settings.browserSidePadding ||
      previous.browserTopPadding !== settings.browserTopPadding ||
      previous.browserBottomPadding !== settings.browserBottomPadding
    ) {
      applyAppearanceLayout(root, settings);
    }
    if (previous?.preventSleepWhileOpen !== settings.preventSleepWhileOpen) {
      void window.desktopBridge?.setPreventSleep?.(settings.preventSleepWhileOpen);
    }
    if (
      previous?.fontFamilySans !== settings.fontFamilySans ||
      previous.fontFamilyCode !== settings.fontFamilyCode ||
      previous.fontFamilyComposer !== settings.fontFamilyComposer ||
      previous.fontSizeInterface !== settings.fontSizeInterface ||
      previous.fontSizeChat !== settings.fontSizeChat ||
      previous.fontWeightChat !== settings.fontWeightChat ||
      previous.fontSizeCode !== settings.fontSizeCode ||
      previous.fontSmoothing !== settings.fontSmoothing ||
      previousSeparateFonts !== separateFonts
    ) {
      applyAppearanceFontVariables(root, {
        sans: settings.fontFamilySans,
        code: settings.fontFamilyCode,
        composer: settings.fontFamilyComposer,
        sizeInterface: settings.fontSizeInterface,
        sizeChat: settings.fontSizeChat,
        weightChat: settings.fontWeightChat,
        sizeCode: settings.fontSizeCode,
        smoothing: settings.fontSmoothing,
        separate: separateFonts,
      });
    }
  };
  subscribeClientSettings(apply);
  reducedTransparencyQuery.addEventListener("change", () =>
    applyWindowTranslucency(root, getClientSettings()),
  );
  subscribeLocalStorageKey(TYPOGRAPHY_ADVANCED_STORAGE_KEY, apply);
  apply();
}

function readOpenThreadRef(router: AppRouter): ScopedThreadRef | null {
  const target = resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
  const draft =
    target?.kind === "draft"
      ? useComposerDraftStore.getState().getDraftSession(target.draftId)
      : null;
  return resolveActiveThreadRouteRef(target, draft);
}

function windowTitleThreadStatus(
  thread: Parameters<typeof resolveWindowTitleThreadStatus>[0] | null,
): string | null {
  return thread === null ? null : resolveWindowTitleThreadStatus(thread, m);
}

/**
 * Names the open thread and its project in the window title, or the app when none is open.
 * Screen readers read it on Alt+Tab, so it can lead with the thread and what it's doing.
 */
function startDocumentTitle(router: AppRouter): void {
  const readOnGuestPage = () => router.state.matches.some((match) => match.routeId === "/guest");
  let openThreadRef = readOpenThreadRef(router);
  let onGuestPage = readOnGuestPage();
  const write = () => {
    // GuestPage titles the tab after the shared thread.
    if (onGuestPage) return;
    const thread =
      openThreadRef === null
        ? null
        : appAtomRegistry.get(environmentThreadShells.quietThreadShellAtom(openThreadRef));
    const project =
      thread === null
        ? null
        : appAtomRegistry.get(
            environmentProjects.projectAtom(
              scopeProjectRef(thread.environmentId, thread.projectId),
            ),
          );
    const title = resolveWindowTitle({
      appDisplayName: resolveServerBackedAppDisplayName({
        baseName: APP_BASE_NAME,
        fallbackDisplayName: APP_DISPLAY_NAME,
        fallbackStageLabel: APP_STAGE_LABEL,
        primaryServerVersion:
          appAtomRegistry.get(primaryServerConfigAtom)?.environment.serverVersion ?? null,
      }),
      projectTitle: project?.title ?? null,
      threadTitle: thread?.title ?? null,
      ...(getClientSettings().screenReaderWindowTitle && {
        screenReader: {
          threadStatus: windowTitleThreadStatus(thread),
        },
      }),
      desktop: isElectron,
    });
    // Projects change whenever any project does; most changes leave the title alone.
    if (document.title !== title) document.title = title;
  };
  // The open thread's own shell, since the shell lists skip threads hidden by a tag filter.
  let unsubscribeOpenThread = () => {};
  const watchOpenThread = () => {
    unsubscribeOpenThread();
    unsubscribeOpenThread =
      openThreadRef === null
        ? () => {}
        : appAtomRegistry.subscribe(
            environmentThreadShells.quietThreadShellAtom(openThreadRef),
            write,
          );
  };
  // The draft store changes on every keystroke; only a new open thread matters here.
  const updateOpenThread = () => {
    const next = readOpenThreadRef(router);
    const nextOnGuestPage = readOnGuestPage();
    if (
      nextOnGuestPage === onGuestPage &&
      (next && scopedThreadKey(next)) === (openThreadRef && scopedThreadKey(openThreadRef))
    ) {
      return;
    }
    openThreadRef = next;
    onGuestPage = nextOnGuestPage;
    watchOpenThread();
    write();
  };
  watchOpenThread();
  appAtomRegistry.subscribe(primaryServerConfigAtom, write, { immediate: true });
  appAtomRegistry.subscribe(environmentProjects.projectsAtom, write);
  subscribeClientSettings(write);
  subscribeI18n(write);
  router.subscribe("onResolved", updateOpenThread);
  useComposerDraftStore.subscribe(updateOpenThread);
}

/**
 * Each route paints its own surface, which the browser chrome samples once it is on screen.
 * onRendered only fires for a new href; onResolved also covers `router.invalidate()`, which
 * can swap the root between the bare outlet and the shell at the same address.
 */
function startBrowserChromeThemeSync(router: AppRouter): void {
  const resync = () => window.requestAnimationFrame(syncBrowserChromeTheme);
  router.subscribe("onRendered", resync);
  router.subscribe("onResolved", resync);
}

/** Chat overlays belong to the thread they were opened in, so leaving its route drops them. */
function startThreadOverlayRetention(router: AppRouter): void {
  router.subscribe("onResolved", () => {
    const target = resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
    const draftSession =
      target?.kind === "draft"
        ? useComposerDraftStore.getState().getDraftSession(target.draftId)
        : null;
    const threadRef =
      target?.kind === "server"
        ? target.threadRef
        : draftSession
          ? scopeThreadRef(draftSession.environmentId, draftSession.threadId)
          : null;
    retainThreadOverlaysForThread(threadRef ? scopedThreadKey(threadRef) : null);
  });
}

/**
 * Starts every app-lifetime service once, before the first render, and returns the router.
 * They run for the life of the page, so their disposers are dropped here.
 */
export function startAppServices(): AppRouter {
  // Ahead of the history: the provider auth code must leave the address before anything reads it.
  startProviderAuthDelivery();

  // Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
  const router = getRouter(isElectron ? createHashHistory() : createBrowserHistory());

  if (isElectron) {
    syncDocumentElectronPlatformClasses(navigator.platform);
    syncDocumentWindowControlsOverlayClass();
  }

  installDesktopPasteAsText(window.desktopBridge, window);

  startClientAppearance();
  startI18n();
  startDocumentTitle(router);
  startHostEnvironmentLookup();
  startEnvironmentThemeRepaint();
  startThemeBackground();
  startBrowserChromeThemeSync(router);
  startDefaultThemeAdoption();
  startModelPreferencesMigration();
  startAgentOpenedPreviews();
  if (isElectron) startElectronBrowserHost();
  startPreviewTitleRecording();
  startBrowserProfileReporting();
  installChatRouteCommands(router);
  installCommandPaletteCommands(router);
  registerOpenFavoriteEditorCommand();
  startThreadOverlayRetention(router);
  // Drafts promote as their server threads arrive, wherever the user is.
  subscribeDraftThreadPromotion({
    registry: appAtomRegistry,
    threadShellAtom: environmentThreadShells.quietThreadShellAtom,
    threadRefsAtom: environmentThreadShells.threadRefsAtom,
  });
  subscribeComposerDraftModelReconciliation({
    registry: appAtomRegistry,
    threadShellAtom: environmentThreadShells.threadShellAtom,
    threadRefsAtom: environmentThreadShells.threadRefsAtom,
    shellStateAtom: environmentShell.stateAtom,
    pendingThreadIdsAtom: threadEnvironment.pendingThreadIdsAtom,
  });
  startMainAppLocationTracking(router);
  startWorkspaceFocus(router);
  startBackgroundThreadAnnouncements(appAtomRegistry, router);
  startThreadVisitedMigration(appAtomRegistry);
  startSshPasswordPromptQueue();

  startKeybindingsUpdateToasts();
  startSlowRpcRequestToasts();
  startHostFreezeToasts();
  startLegacyThreadMigrationToast();
  startPermissionUpdateNotices(router);
  startThreadNotifications(appAtomRegistry, router);
  startGuideRunNotifications(appAtomRegistry, router);
  if (isElectron) startDesktopUpdateLaunchNotice();

  return router;
}
