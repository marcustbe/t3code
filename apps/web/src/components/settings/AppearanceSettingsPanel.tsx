import type { CSSProperties } from "react";
import { useState } from "react";
import { msg, useGT, useMessages } from "gt-react";
import {
  DEFAULT_UNIFIED_SETTINGS,
  type EffortDisplay,
  MAX_APPEARANCE_CONTRAST,
  MAX_BACKGROUND_GRAIN,
  MAX_CHAT_WIDTH_PERCENT,
  MAX_EDGE_PADDING,
  MAX_GLASS_OPACITY,
  MAX_PANEL_ANIMATION_DURATION_MS,
  MAX_TOP_BAR_BLUR,
  MIN_PRIMARY_TEXT_STRENGTH,
  MAX_WINDOW_BLUR_RADIUS,
  MIN_APPEARANCE_CONTRAST,
  MIN_EDGE_PADDING,
  MIN_GLASS_OPACITY,
  MIN_PANEL_ANIMATION_DURATION_MS,
  MIN_WINDOW_BLUR_RADIUS,
} from "@t3tools/contracts/settings";
import { isElectron } from "../../env";
import { isMacPlatform } from "../../lib/utils";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useTheme } from "../../hooks/useTheme";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { ThemeLibrary } from "./ThemeSettings";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { PanelAnimationsPreview } from "./PanelAnimationsPreview";
import { TypographySection } from "./TypographySettings";
import { SettingsSliderRow } from "./SettingsSliderRow";
import { ThreadDetailsItemsRow } from "./ThreadDetailsItemsRow";

const CHAT_WIDTH_LABELS = {
  comfortable: msg("Comfortable"),
  wide: msg("Wide"),
  full: msg("Full", { $context: "chat width" }),
};

const EFFORT_DISPLAY_LABELS: Record<EffortDisplay, string> = {
  label: msg("Word", { $context: "show effort as a word" }),
  bars: msg("Bars", { $context: "show effort as bars" }),
};

function MessageBubbleSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const gt = useGT();
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <label
        className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/12 ring-inset"
        style={{ background: value === "" ? "var(--message-surface)" : value }}
      >
        <input
          aria-label={gt("Message colour, {mode} mode", { mode: label.toLowerCase() })}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          type="color"
          value={value === "" ? "#808080" : value}
          onChange={(event) => onChange(event.currentTarget.value.toLowerCase())}
        />
      </label>
    </div>
  );
}

/** The user bubble's colour in light and dark mode: swatches opening the system colour picker; empty follows the theme. */
function MessageBubbleColorRow({
  light,
  dark,
  onChange,
}: {
  light: string;
  dark: string;
  onChange: (patch: { messageBubbleColor?: string; messageBubbleColorDark?: string }) => void;
}) {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  return (
    <SettingsRow
      {...searchableSetting("message-bubble-color")}
      description={gt(
        "Background of your messages in light and dark mode. Reset to follow the theme.",
      )}
      resetAction={
        light !== "" || dark !== "" ? (
          <SettingResetButton
            ariaLabel={gt("Reset message colour to default")}
            onClick={() => onChange({ messageBubbleColor: "", messageBubbleColorDark: "" })}
          />
        ) : null
      }
      control={
        <div className="flex w-full items-center justify-end gap-4 sm:w-52">
          <MessageBubbleSwatch
            label={gt("Light")}
            value={light}
            onChange={(messageBubbleColor) => onChange({ messageBubbleColor })}
          />
          <MessageBubbleSwatch
            label={gt("Dark")}
            value={dark}
            onChange={(messageBubbleColorDark) => onChange({ messageBubbleColorDark })}
          />
        </div>
      }
    />
  );
}

// Only the macOS desktop app can show the desktop through the window.
const WINDOW_TRANSPARENCY_SUPPORTED =
  isElectron && typeof navigator !== "undefined" && isMacPlatform(navigator.platform);

export function AppearanceSettingsPanel() {
  const searchableSetting = useSearchableSetting();
  const {
    appearanceMode,
    refreshTheme,
    resolvedTheme,
    setAppearanceMode,
    setTheme,
    setThemeHalf,
    theme,
    themeHalves,
  } = useTheme();
  const gt = useGT();
  const m = useMessages();
  const customThemes = useCustomThemes();
  const [isImportThemeOpen, setIsImportThemeOpen] = useState(false);
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const glassOpacityRatio =
    (settings.glassOpacity - MIN_GLASS_OPACITY) / (MAX_GLASS_OPACITY - MIN_GLASS_OPACITY);
  const glassOpacitySliderStyle = {
    "--settings-slider-progress": `${glassOpacityRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - glassOpacityRatio}rem`,
  } as CSSProperties;
  const appearanceContrastRatio =
    (settings.appearanceContrast - MIN_APPEARANCE_CONTRAST) /
    (MAX_APPEARANCE_CONTRAST - MIN_APPEARANCE_CONTRAST);
  const appearanceContrastSliderStyle = {
    "--settings-slider-progress": `${appearanceContrastRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - appearanceContrastRatio}rem`,
  } as CSSProperties;
  const panelAnimationDurationRatio =
    (settings.panelAnimationDurationMs - MIN_PANEL_ANIMATION_DURATION_MS) /
    (MAX_PANEL_ANIMATION_DURATION_MS - MIN_PANEL_ANIMATION_DURATION_MS);
  const panelAnimationDurationSliderStyle = {
    "--settings-slider-progress": `${panelAnimationDurationRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - panelAnimationDurationRatio}rem`,
  } as CSSProperties;

  return (
    <SettingsPageContainer>
      <SettingsSection id="appearance" title={gt("Colors & themes")} variant="plain" hideTitle>
        <div id={searchableSetting("theme").id}>
          <ThemeLibrary
            appearanceMode={appearanceMode}
            customThemes={customThemes}
            initialAppearance={resolvedTheme}
            refreshTheme={refreshTheme}
            isImportOpen={isImportThemeOpen}
            setAppearanceMode={setAppearanceMode}
            setTheme={setTheme}
            setThemeHalf={setThemeHalf}
            theme={theme}
            themeHalves={themeHalves}
            onImportOpenChange={setIsImportThemeOpen}
          />
        </div>
      </SettingsSection>

      <SettingsSection id="appearance-interface" title={gt("Interface")}>
        <SettingsRow
          {...searchableSetting("setting-appearance-contrast")}
          description={gt("Adjust the contrast of colors and borders across the interface.")}
          resetAction={
            settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast ? (
              <SettingResetButton
                ariaLabel={gt("Reset contrast to default")}
                onClick={() =>
                  updateSettings({
                    appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="appearance-contrast"
              >
                {settings.appearanceContrast}%
              </output>
              <input
                aria-label={gt("Contrast")}
                className="settings-slider min-w-0 flex-1"
                id="appearance-contrast"
                max={MAX_APPEARANCE_CONTRAST}
                min={MIN_APPEARANCE_CONTRAST}
                onChange={(event) => {
                  const appearanceContrast = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(appearanceContrast) &&
                    appearanceContrast >= MIN_APPEARANCE_CONTRAST &&
                    appearanceContrast <= MAX_APPEARANCE_CONTRAST
                  ) {
                    updateSettings({ appearanceContrast });
                  }
                }}
                step={1}
                style={appearanceContrastSliderStyle}
                type="range"
                value={settings.appearanceContrast}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("setting-glass-opacity")}
          description={gt("Higher values make menus, dialogs, and the composer more solid.")}
          resetAction={
            settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity ? (
              <SettingResetButton
                ariaLabel={gt("Reset glass opacity to default")}
                onClick={() =>
                  updateSettings({ glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="glass-opacity"
              >
                {settings.glassOpacity}%
              </output>
              <input
                aria-label={gt("Glass opacity")}
                className="settings-slider min-w-0 flex-1"
                id="glass-opacity"
                max={MAX_GLASS_OPACITY}
                min={MIN_GLASS_OPACITY}
                onChange={(event) => {
                  const glassOpacity = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(glassOpacity) &&
                    glassOpacity >= MIN_GLASS_OPACITY &&
                    glassOpacity <= MAX_GLASS_OPACITY
                  ) {
                    updateSettings({ glassOpacity });
                  }
                }}
                step={1}
                style={glassOpacitySliderStyle}
                type="range"
                value={settings.glassOpacity}
              />
            </div>
          }
        />

        {WINDOW_TRANSPARENCY_SUPPORTED ? (
          <>
            <SettingsSliderRow
              searchId="sidebar-surface-opacity"
              inputId="sidebar-surface-opacity-input"
              label={gt("Sidebar opacity")}
              description={gt("Lower values let the desktop show through the left sidebar.")}
              value={settings.sidebarSurfaceOpacity}
              defaultValue={DEFAULT_UNIFIED_SETTINGS.sidebarSurfaceOpacity}
              onChange={(sidebarSurfaceOpacity) => updateSettings({ sidebarSurfaceOpacity })}
            />
            <SettingsSliderRow
              searchId="content-surface-opacity"
              inputId="content-surface-opacity-input"
              label={gt("Main area opacity")}
              description={gt(
                "Lower values let the desktop show through the chat and other pages.",
              )}
              value={settings.contentSurfaceOpacity}
              defaultValue={DEFAULT_UNIFIED_SETTINGS.contentSurfaceOpacity}
              onChange={(contentSurfaceOpacity) => updateSettings({ contentSurfaceOpacity })}
            />
            <SettingsSliderRow
              searchId="panel-surface-opacity"
              inputId="panel-surface-opacity-input"
              label={gt("Right panel opacity")}
              description={gt("Lower values let the desktop show through the right panel.")}
              value={settings.panelSurfaceOpacity}
              defaultValue={DEFAULT_UNIFIED_SETTINGS.panelSurfaceOpacity}
              onChange={(panelSurfaceOpacity) => updateSettings({ panelSurfaceOpacity })}
            />
            <SettingsSliderRow
              searchId="window-blur-radius"
              inputId="window-blur-radius-input"
              label={gt("Background blur")}
              description={gt("How much the desktop behind see-through areas is blurred.")}
              value={settings.windowBlurRadius}
              defaultValue={DEFAULT_UNIFIED_SETTINGS.windowBlurRadius}
              onChange={(windowBlurRadius) => updateSettings({ windowBlurRadius })}
              min={MIN_WINDOW_BLUR_RADIUS}
              max={MAX_WINDOW_BLUR_RADIUS}
              unit="pt"
            />
          </>
        ) : null}
        <SettingsSliderRow
          searchId="background-grain"
          inputId="background-grain-input"
          label={gt("Background grain")}
          description={gt("Noise texture over the sidebar, main area and panels.")}
          value={settings.backgroundGrain}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.backgroundGrain}
          onChange={(backgroundGrain) => updateSettings({ backgroundGrain })}
          min={0}
          max={MAX_BACKGROUND_GRAIN}
        />
        <SettingsSliderRow
          searchId="primary-text-strength"
          inputId="primary-text-strength-input"
          label={gt("Text strength")}
          description={gt("Opacity of primary text and icons.")}
          value={settings.primaryTextStrength}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.primaryTextStrength}
          onChange={(primaryTextStrength) => updateSettings({ primaryTextStrength })}
          min={MIN_PRIMARY_TEXT_STRENGTH}
          max={100}
        />
        <MessageBubbleColorRow
          light={settings.messageBubbleColor}
          dark={settings.messageBubbleColorDark}
          onChange={updateSettings}
        />
        <SettingsSliderRow
          searchId="message-bubble-opacity"
          inputId="message-bubble-opacity-input"
          label={gt("Message opacity")}
          description={gt("How solid the background of your messages is.")}
          value={settings.messageBubbleOpacity}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.messageBubbleOpacity}
          onChange={(messageBubbleOpacity) => updateSettings({ messageBubbleOpacity })}
          min={0}
          max={100}
        />
        <SettingsSliderRow
          searchId="top-bar-blur"
          inputId="top-bar-blur-input"
          label={gt("Top bar blur")}
          description={gt("How much the chat's top bar blurs what scrolls under it.")}
          value={settings.topBarBlur}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.topBarBlur}
          onChange={(topBarBlur) => updateSettings({ topBarBlur })}
          min={0}
          max={MAX_TOP_BAR_BLUR}
          unit="px"
          step={1}
        />
        <SettingsSliderRow
          searchId="top-bar-opacity"
          inputId="top-bar-opacity-input"
          label={gt("Top bar opacity")}
          description={gt("How solid the chat's top bar is over what scrolls under it.")}
          value={settings.topBarOpacity}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.topBarOpacity}
          onChange={(topBarOpacity) => updateSettings({ topBarOpacity })}
          min={0}
          max={100}
        />

        <SettingsSliderRow
          searchId="chat-width"
          inputId="chat-width-input"
          label={gt("Chat width")}
          description={gt(
            "How wide messages and the composer can grow. Far left is the comfortable default, far right fills the window.",
          )}
          value={settings.chatWidthPercent}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.chatWidthPercent}
          onChange={(chatWidthPercent) => updateSettings({ chatWidthPercent })}
          min={0}
          max={MAX_CHAT_WIDTH_PERCENT}
          format={(value) =>
            m(
              value === 0
                ? CHAT_WIDTH_LABELS.comfortable
                : value >= 100
                  ? CHAT_WIDTH_LABELS.full
                  : CHAT_WIDTH_LABELS.wide,
            )
          }
        />
        <SettingsRow
          {...searchableSetting("chat-behind-composer")}
          description={gt(
            "Let the conversation run a little into the composer box as it scrolls. Off stops it at the composer's top edge.",
          )}
          resetAction={
            settings.chatScrollsBehindComposer !==
            DEFAULT_UNIFIED_SETTINGS.chatScrollsBehindComposer ? (
              <SettingResetButton
                ariaLabel={gt("Reset chat scrolls behind composer to default")}
                onClick={() =>
                  updateSettings({
                    chatScrollsBehindComposer: DEFAULT_UNIFIED_SETTINGS.chatScrollsBehindComposer,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.chatScrollsBehindComposer}
              onCheckedChange={(checked) =>
                updateSettings({ chatScrollsBehindComposer: Boolean(checked) })
              }
              aria-label={gt("Chat scrolls behind composer")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("composer-prompt-layout")}
          description={gt(
            "Where a prompt goes once it wraps: above the + and send buttons, or between them.",
          )}
          resetAction={
            settings.composerPromptLayout !== DEFAULT_UNIFIED_SETTINGS.composerPromptLayout ? (
              <SettingResetButton
                ariaLabel={gt("Reset long prompts to default")}
                onClick={() =>
                  updateSettings({
                    composerPromptLayout: DEFAULT_UNIFIED_SETTINGS.composerPromptLayout,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.composerPromptLayout}
                onValueChange={(value) => {
                  if (value === "stack" || value === "inline")
                    updateSettings({ composerPromptLayout: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label={gt("Long prompts")}>
                  <SelectValue>
                    {settings.composerPromptLayout === "inline"
                      ? gt("Between buttons")
                      : gt("Above buttons")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="stack">{gt("Above buttons (default)")}</SelectItem>
                  <SelectItem value="inline">{gt("Between buttons")}</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <ThreadDetailsItemsRow />
        <SettingsRow
          {...searchableSetting("effort-display")}
          description={gt(
            "Show reasoning effort in the composer as its name, such as High, or as bars.",
          )}
          resetAction={
            settings.effortDisplay !== DEFAULT_UNIFIED_SETTINGS.effortDisplay ? (
              <SettingResetButton
                ariaLabel={gt("Reset effort display to default")}
                onClick={() =>
                  updateSettings({ effortDisplay: DEFAULT_UNIFIED_SETTINGS.effortDisplay })
                }
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.effortDisplay}
                onValueChange={(value) => {
                  if (value === "bars" || value === "label")
                    updateSettings({ effortDisplay: value });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0"
                  aria-label={gt("Effort display")}
                >
                  <SelectValue>{m(EFFORT_DISPLAY_LABELS[settings.effortDisplay])}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="label">{gt("Word (default)")}</SelectItem>
                  <SelectItem value="bars">{m(EFFORT_DISPLAY_LABELS.bars)}</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <SettingsRow
          {...searchableSetting("sidebar-pull-requests")}
          description={gt("Show the pull requests button at the bottom of the sidebar.")}
          control={
            <Switch
              checked={settings.sidebarShowPullRequests}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarShowPullRequests: Boolean(checked) })
              }
              aria-label={gt("Show pull requests in sidebar")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("sidebar-settled-count")}
          description={gt("Show how many chats are settled beside the Settled shelf.")}
          control={
            <Switch
              checked={settings.sidebarShowSettledCount}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarShowSettledCount: Boolean(checked) })
              }
              aria-label={gt("Show settled count in sidebar")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("sidebar-toggle-static-icon")}
          description={gt(
            "Always show the sidebar button's collapsed icon, instead of switching icons as the sidebar opens and closes.",
          )}
          control={
            <Switch
              checked={settings.sidebarToggleStaticIcon}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarToggleStaticIcon: Boolean(checked) })
              }
              aria-label={gt("Static sidebar button icon")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("math-rendering")}
          description={gt(
            "Typeset LaTeX math, such as $x^2$ or \\[x^2\\], in messages and Markdown previews. The composer keeps TeX source editable.",
          )}
          resetAction={
            settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled ? (
              <SettingResetButton
                ariaLabel={gt("Reset math rendering to default")}
                onClick={() =>
                  updateSettings({
                    mathRenderingEnabled: DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.mathRenderingEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ mathRenderingEnabled: Boolean(checked) })
              }
              aria-label={gt("Render math")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("panel-animations")}
          description={gt("Set how fast panels open and close.")}
          control={
            <div className="grid w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 sm:w-auto sm:grid-cols-[7rem_13rem] sm:gap-4">
              <PanelAnimationsPreview durationMs={settings.panelAnimationDurationMs} />
              <div className="flex w-full items-center gap-3">
                <output
                  className="min-w-16 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                  htmlFor="panel-animation-duration"
                >
                  {settings.panelAnimationDurationMs} ms
                </output>
                <input
                  aria-label={gt("Panel animation duration")}
                  className="settings-slider min-w-0 flex-1"
                  id="panel-animation-duration"
                  max={MAX_PANEL_ANIMATION_DURATION_MS}
                  min={MIN_PANEL_ANIMATION_DURATION_MS}
                  onChange={(event) => {
                    const panelAnimationDurationMs = Number(event.currentTarget.value);
                    if (
                      Number.isInteger(panelAnimationDurationMs) &&
                      panelAnimationDurationMs >= MIN_PANEL_ANIMATION_DURATION_MS &&
                      panelAnimationDurationMs <= MAX_PANEL_ANIMATION_DURATION_MS
                    ) {
                      updateSettings({ panelAnimationDurationMs });
                    }
                  }}
                  step={25}
                  style={panelAnimationDurationSliderStyle}
                  type="range"
                  value={settings.panelAnimationDurationMs}
                />
              </div>
            </div>
          }
          resetAction={
            settings.panelAnimationDurationMs !==
            DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs ? (
              <SettingResetButton
                ariaLabel={gt("Reset panel animations to default")}
                onClick={() =>
                  updateSettings({
                    panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
                  })
                }
              />
            ) : null
          }
        />
        <SettingsRow
          {...searchableSetting("composer-context")}
          description={gt(
            "Keep branch and worktree controls below the composer after a thread starts.",
          )}
          resetAction={
            settings.persistComposerContextStrip !==
            DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip ? (
              <SettingResetButton
                ariaLabel={gt("Reset composer context to default")}
                onClick={() =>
                  updateSettings({
                    persistComposerContextStrip:
                      DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.persistComposerContextStrip}
              onCheckedChange={(checked) =>
                updateSettings({ persistComposerContextStrip: Boolean(checked) })
              }
              aria-label={gt("Keep composer context visible in active threads")}
            />
          }
        />
      </SettingsSection>

      <EdgePaddingSection />

      <TypographySection />
    </SettingsPageContainer>
  );
}

const EDGE_PADDING_ROWS = [
  {
    key: "sidebarSidePadding",
    searchId: "sidebar-side-padding",
    label: msg("Sidebar side padding"),
    description: msg(
      "From the sidebar's sides to its icons. The window buttons line up with them.",
    ),
  },
  {
    key: "windowTopPadding",
    searchId: "window-top-padding",
    label: msg("Top padding"),
    description: msg("From the window's top to the window buttons; the top bars grow with it."),
  },
  {
    key: "sidebarBottomPadding",
    searchId: "sidebar-bottom-padding",
    label: msg("Sidebar bottom padding"),
    description: msg("From the window's bottom to the sidebar's footer icons."),
  },
  {
    key: "topBarSidePadding",
    searchId: "top-bar-side-padding",
    label: msg("Top bar side padding"),
    description: msg("From the main area's sides to the breadcrumb and the top-right buttons."),
  },
  {
    key: "browserSidePadding",
    searchId: "browser-side-padding",
    label: msg("Browser side padding"),
    description: msg("Sides of the browser's tabs and toolbar."),
  },
  {
    key: "browserTopPadding",
    searchId: "browser-top-padding",
    label: msg("Browser top padding"),
    description: msg("Above the browser's toolbar."),
  },
  {
    key: "browserBottomPadding",
    searchId: "browser-bottom-padding",
    label: msg("Browser bottom padding"),
    description: msg("Below the browser's toolbar."),
  },
] as const;

function EdgePaddingSection() {
  const gt = useGT();
  const m = useMessages();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsSection id="appearance-layout" title={gt("Layout")}>
      {EDGE_PADDING_ROWS.map((row) => (
        <SettingsSliderRow
          key={row.key}
          searchId={row.searchId}
          inputId={`${row.searchId}-input`}
          label={m(row.label)}
          description={m(row.description)}
          value={settings[row.key]}
          defaultValue={DEFAULT_UNIFIED_SETTINGS[row.key]}
          onChange={(value) => updateSettings({ [row.key]: value })}
          min={MIN_EDGE_PADDING}
          max={MAX_EDGE_PADDING}
          unit="px"
          step={1}
        />
      ))}
    </SettingsSection>
  );
}
