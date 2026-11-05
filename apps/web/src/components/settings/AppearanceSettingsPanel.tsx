import type { CSSProperties } from "react";
import { useState } from "react";
import {
  DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
  DEFAULT_UNIFIED_SETTINGS,
  type ChatWidth,
  type EffortDisplay,
  type EnvironmentIdentificationMode,
  MAX_APPEARANCE_CONTRAST,
  MAX_BACKGROUND_GRAIN,
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
import {
  resolveSidebarStageBackdropVariant,
  type SidebarStageBackdropVariant,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
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
import { searchableSetting } from "./settingsSearch";
import { PanelAnimationsPreview } from "./PanelAnimationsPreview";
import { TypographySection } from "./TypographySettings";
import { SettingsSliderRow } from "./SettingsSliderRow";
import { ThreadDetailsItemsRow } from "./ThreadDetailsItemsRow";

const ENVIRONMENT_IDENTIFICATION_LABELS: Record<EnvironmentIdentificationMode, string> = {
  artwork: "Artwork",
  "nightly-artwork": "Nightly artwork",
  "dev-artwork": "Dev artwork",
  pill: "Version pill",
  none: "None",
};

// The default "artwork" follows the running channel, so it is labeled as that channel's art,
// or as "None" on Latest. The other channel's art is offered as a fixed choice.
function environmentIdentificationOptions(
  stageVariant: SidebarStageBackdropVariant | null,
): ReadonlyArray<readonly [EnvironmentIdentificationMode, string]> {
  if (stageVariant === "dev") {
    return [
      ["artwork", "Dev artwork"],
      ["nightly-artwork", "Nightly artwork"],
      ["pill", "Version pill"],
      ["none", "None"],
    ];
  }
  if (stageVariant === "nightly") {
    return [
      ["artwork", "Nightly artwork"],
      ["dev-artwork", "Dev artwork"],
      ["pill", "Version pill"],
      ["none", "None"],
    ];
  }
  return [
    ["artwork", "None"],
    ["nightly-artwork", "Nightly artwork"],
    ["dev-artwork", "Dev artwork"],
  ];
}

const CHAT_WIDTH_LABELS: Record<ChatWidth, string> = {
  comfortable: "Comfortable",
  wide: "Wide",
  full: "Full",
};

const EFFORT_DISPLAY_LABELS: Record<EffortDisplay, string> = {
  label: "Word",
  bars: "Bars",
};

/** The user bubble's colour: a swatch opening the system colour picker; empty follows the theme. */
function MessageBubbleColorRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingsRow
      {...searchableSetting("message-bubble-color")}
      description="Background of your messages. Reset to follow the theme."
      resetAction={
        value !== "" ? (
          <SettingResetButton label="message colour" onClick={() => onChange("")} />
        ) : null
      }
      control={
        <div className="flex w-full items-center justify-end gap-3 sm:w-52">
          <span className="font-mono text-xs text-muted-foreground uppercase">
            {value === "" ? "Theme" : value}
          </span>
          <label
            className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/12 ring-inset"
            style={{ background: value === "" ? "var(--message-surface)" : value }}
          >
            <input
              aria-label="Message colour"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              type="color"
              value={value === "" ? "#808080" : value}
              onChange={(event) => onChange(event.currentTarget.value.toLowerCase())}
            />
          </label>
        </div>
      }
    />
  );
}

// Only the macOS desktop app can show the desktop through the window.
const WINDOW_TRANSPARENCY_SUPPORTED =
  isElectron && typeof navigator !== "undefined" && isMacPlatform(navigator.platform);

export function AppearanceSettingsPanel() {
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
  const customThemes = useCustomThemes();
  const [isImportThemeOpen, setIsImportThemeOpen] = useState(false);
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const environmentStageLabel = useEnvironmentStageLabel();
  const environmentStageVariant = resolveSidebarStageBackdropVariant(environmentStageLabel);
  const environmentIdentificationOptionList =
    environmentIdentificationOptions(environmentStageVariant);
  const environmentIdentificationLabel =
    environmentIdentificationOptionList.find(
      ([value]) => value === settings.environmentIdentificationMode,
    )?.[1] ?? ENVIRONMENT_IDENTIFICATION_LABELS[settings.environmentIdentificationMode];
  const effectiveEnvironmentIdentificationMode = useEnvironmentIdentificationMode();
  const themeHidesEnvironmentArtwork =
    effectiveEnvironmentIdentificationMode === "pill" &&
    resolveSidebarStageBackdropVariant(
      environmentStageLabel,
      settings.environmentIdentificationMode,
    ) !== null;
  const environmentIdentificationDescription = themeHidesEnvironmentArtwork
    ? environmentStageVariant
      ? "Only built-in themes show artwork, so this theme shows the version pill."
      : "Only built-in themes show artwork."
    : environmentStageVariant
      ? "Choose how Dev and Nightly environments are identified."
      : "Show Dev or Nightly artwork in the sidebar header.";
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
      <SettingsSection id="appearance" title="Colors & themes" variant="plain" hideTitle>
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

      <SettingsSection id="appearance-interface" title="Interface">
        <SettingsRow
          {...searchableSetting("setting-appearance-contrast")}
          description="Adjust the contrast of colors and borders across the interface."
          resetAction={
            settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast ? (
              <SettingResetButton
                label="contrast"
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
                aria-label="Contrast"
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
                step={5}
                style={appearanceContrastSliderStyle}
                type="range"
                value={settings.appearanceContrast}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("setting-glass-opacity")}
          description="Higher values make menus, dialogs, and the composer more solid."
          resetAction={
            settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity ? (
              <SettingResetButton
                label="glass opacity"
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
                aria-label="Glass opacity"
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
                step={5}
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
              label="Sidebar opacity"
              description="Lower values let the desktop show through the left sidebar."
              value={settings.sidebarSurfaceOpacity}
              defaultValue={DEFAULT_UNIFIED_SETTINGS.sidebarSurfaceOpacity}
              onChange={(sidebarSurfaceOpacity) => updateSettings({ sidebarSurfaceOpacity })}
            />
            <SettingsSliderRow
              searchId="content-surface-opacity"
              inputId="content-surface-opacity-input"
              label="Main area opacity"
              description="Lower values let the desktop show through the chat and other pages."
              value={settings.contentSurfaceOpacity}
              defaultValue={DEFAULT_UNIFIED_SETTINGS.contentSurfaceOpacity}
              onChange={(contentSurfaceOpacity) => updateSettings({ contentSurfaceOpacity })}
            />
            <SettingsSliderRow
              searchId="panel-surface-opacity"
              inputId="panel-surface-opacity-input"
              label="Right panel opacity"
              description="Lower values let the desktop show through the right panel."
              value={settings.panelSurfaceOpacity}
              defaultValue={DEFAULT_UNIFIED_SETTINGS.panelSurfaceOpacity}
              onChange={(panelSurfaceOpacity) => updateSettings({ panelSurfaceOpacity })}
            />
            <SettingsSliderRow
              searchId="window-blur-radius"
              inputId="window-blur-radius-input"
              label="Background blur"
              description="How much the desktop behind see-through areas is blurred."
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
          label="Background grain"
          description="Noise texture over the sidebar, main area and panels."
          value={settings.backgroundGrain}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.backgroundGrain}
          onChange={(backgroundGrain) => updateSettings({ backgroundGrain })}
          min={0}
          max={MAX_BACKGROUND_GRAIN}
        />
        <SettingsSliderRow
          searchId="primary-text-strength"
          inputId="primary-text-strength-input"
          label="Text strength"
          description="Opacity of primary text and icons."
          value={settings.primaryTextStrength}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.primaryTextStrength}
          onChange={(primaryTextStrength) => updateSettings({ primaryTextStrength })}
          min={MIN_PRIMARY_TEXT_STRENGTH}
          max={100}
        />
        <MessageBubbleColorRow
          value={settings.messageBubbleColor}
          onChange={(messageBubbleColor) => updateSettings({ messageBubbleColor })}
        />
        <SettingsSliderRow
          searchId="message-bubble-opacity"
          inputId="message-bubble-opacity-input"
          label="Message opacity"
          description="How solid the background of your messages is."
          value={settings.messageBubbleOpacity}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.messageBubbleOpacity}
          onChange={(messageBubbleOpacity) => updateSettings({ messageBubbleOpacity })}
          min={0}
          max={100}
        />
        <SettingsSliderRow
          searchId="top-bar-blur"
          inputId="top-bar-blur-input"
          label="Top bar blur"
          description="How much the chat's top bar blurs what scrolls under it."
          value={settings.topBarBlur}
          defaultValue={DEFAULT_UNIFIED_SETTINGS.topBarBlur}
          onChange={(topBarBlur) => updateSettings({ topBarBlur })}
          min={0}
          max={MAX_TOP_BAR_BLUR}
          unit="px"
          step={1}
        />

        <SettingsRow
          {...searchableSetting("chat-width")}
          description="Set how wide messages and the composer can grow on large screens."
          resetAction={
            settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth ? (
              <SettingResetButton
                label="chat width"
                onClick={() => updateSettings({ chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth })}
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.chatWidth}
                onValueChange={(value) => {
                  if (value === "comfortable" || value === "wide" || value === "full")
                    updateSettings({ chatWidth: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Chat width">
                  <SelectValue>{CHAT_WIDTH_LABELS[settings.chatWidth]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="comfortable">Comfortable (default)</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <SettingsRow
          {...searchableSetting("chat-behind-composer")}
          description="Let the conversation run a little into the composer box as it scrolls. Off stops it at the composer's top edge."
          resetAction={
            settings.chatScrollsBehindComposer !==
            DEFAULT_UNIFIED_SETTINGS.chatScrollsBehindComposer ? (
              <SettingResetButton
                label="chat scrolls behind composer"
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
              aria-label="Chat scrolls behind composer"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("composer-prompt-layout")}
          description="Where a prompt goes once it wraps: above the + and send buttons, or between them."
          resetAction={
            settings.composerPromptLayout !== DEFAULT_UNIFIED_SETTINGS.composerPromptLayout ? (
              <SettingResetButton
                label="long prompts"
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
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Long prompts">
                  <SelectValue>
                    {settings.composerPromptLayout === "inline"
                      ? "Between buttons"
                      : "Above buttons"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="stack">Above buttons (default)</SelectItem>
                  <SelectItem value="inline">Between buttons</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <ThreadDetailsItemsRow />
        <SettingsRow
          {...searchableSetting("effort-display")}
          description="Show reasoning effort in the composer as its name, such as High, or as bars."
          resetAction={
            settings.effortDisplay !== DEFAULT_UNIFIED_SETTINGS.effortDisplay ? (
              <SettingResetButton
                label="effort display"
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
                <SelectTrigger size="sm" className="w-full min-w-0" aria-label="Effort display">
                  <SelectValue>{EFFORT_DISPLAY_LABELS[settings.effortDisplay]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="label">Word (default)</SelectItem>
                  <SelectItem value="bars">Bars</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <SettingsRow
          {...searchableSetting("sidebar-pull-requests")}
          description="Show the pull requests button at the bottom of the sidebar."
          control={
            <Switch
              checked={settings.sidebarShowPullRequests}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarShowPullRequests: Boolean(checked) })
              }
              aria-label="Show pull requests in sidebar"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("sidebar-settled-count")}
          description="Show how many chats are settled beside the Settled shelf."
          control={
            <Switch
              checked={settings.sidebarShowSettledCount}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarShowSettledCount: Boolean(checked) })
              }
              aria-label="Show settled count in sidebar"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("math-rendering")}
          description="Typeset LaTeX math, such as $x^2$ or \[x^2\], in messages and Markdown previews. The composer keeps TeX source editable."
          resetAction={
            settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled ? (
              <SettingResetButton
                label="math rendering"
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
              aria-label="Render math"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("panel-animations")}
          description="Set how fast panels open and close."
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
                  aria-label="Panel animation duration"
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
                label="panel animations"
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
          {...searchableSetting("environment-identification")}
          description={environmentIdentificationDescription}
          resetAction={
            settings.environmentIdentificationMode !== DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE ? (
              <SettingResetButton
                label="environment identification"
                onClick={() =>
                  updateSettings({
                    environmentIdentificationMode: DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.environmentIdentificationMode}
              onValueChange={(value) => {
                const option = environmentIdentificationOptionList.find(
                  ([optionValue]) => optionValue === value,
                );
                if (option) updateSettings({ environmentIdentificationMode: option[0] });
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label="Environment identification"
              >
                <SelectValue>{environmentIdentificationLabel}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {environmentIdentificationOptionList.map(([value, label]) => (
                  <SelectItem hideIndicator key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("composer-context")}
          description="Keep branch and worktree controls below the composer after a thread starts."
          resetAction={
            settings.persistComposerContextStrip !==
            DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip ? (
              <SettingResetButton
                label="composer context"
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
              aria-label="Keep composer context visible in active threads"
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
    label: "Sidebar side padding",
    description: "From the sidebar's sides to its icons. The window buttons line up with them.",
  },
  {
    key: "windowTopPadding",
    searchId: "window-top-padding",
    label: "Top padding",
    description: "From the window's top to the window buttons; the top bars grow with it.",
  },
  {
    key: "sidebarBottomPadding",
    searchId: "sidebar-bottom-padding",
    label: "Sidebar bottom padding",
    description: "From the window's bottom to the sidebar's footer icons.",
  },
  {
    key: "topBarSidePadding",
    searchId: "top-bar-side-padding",
    label: "Top bar side padding",
    description: "From the main area's sides to the breadcrumb and the top-right buttons.",
  },
  {
    key: "browserSidePadding",
    searchId: "browser-side-padding",
    label: "Browser side padding",
    description: "Sides of the browser's tabs and toolbar.",
  },
  {
    key: "browserTopPadding",
    searchId: "browser-top-padding",
    label: "Browser top padding",
    description: "Above the browser's toolbar.",
  },
  {
    key: "browserBottomPadding",
    searchId: "browser-bottom-padding",
    label: "Browser bottom padding",
    description: "Below the browser's toolbar.",
  },
] as const;

function EdgePaddingSection() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsSection id="appearance-layout" title="Layout">
      {EDGE_PADDING_ROWS.map((row) => (
        <SettingsSliderRow
          key={row.key}
          searchId={row.searchId}
          inputId={`${row.searchId}-input`}
          label={row.label}
          description={row.description}
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
