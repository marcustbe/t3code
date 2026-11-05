import {
  buildTraitsTriggerDisplay,
  getDescriptorStringValue,
  getTraitSelectChange,
  replaceDescriptorCurrentValue,
  selectableProviderOptionChoices,
  isReasoningControl,
  isReasoningSelect,
} from "@t3tools/client-runtime/model-traits";
import {
  type ModelSelection,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type ScopedThreadRef,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type { EffortDisplay } from "@t3tools/contracts/settings";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentLabel,
  getProviderOptionDescriptors,
  isClaudeUltrathinkPrompt,
  normalizeModelSlug,
} from "@t3tools/shared/model";
import { memo, type ReactNode, useRef } from "react";
import { GaugeIcon, ZapIcon } from "lucide-react";
import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";
import { useComposerDraftStore, DraftId } from "../../composerDraftStore";
import { getProviderModelCapabilities } from "../../providerModels";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon, type ComposerControlSize } from "./ComposerControl";
import { focusRequestedPermission, useComposerMenuProps } from "./composerEventScope";
import { useComposerMenuState } from "./useComposerMenuState";
import { EffortGlyph, FastBolt, resolveEffortGlyph } from "./EffortGlyph";

type ProviderOptions = ReadonlyArray<ProviderOptionSelection>;

/**
 * All the picker reads from the prompt while rendering. Passing this instead of
 * the prompt keeps the picker from re-rendering on every keystroke.
 */
export type PromptUltrathink = "none" | "prefix" | "body";

export function readPromptUltrathink(prompt: string): PromptUltrathink {
  if (!isClaudeUltrathinkPrompt(prompt)) return "none";
  return isClaudeUltrathinkPrompt(prompt.replace(/^Ultrathink:\s*/i, "")) ? "body" : "prefix";
}

const SAVED_OPTION_LABELS: Readonly<Record<string, string>> = {
  agent: "Agent",
  effort: "Effort",
  reasoningEffort: "Reasoning effort",
  variant: "Reasoning",
};

function savedOptionLabel(id: string): string {
  return (
    SAVED_OPTION_LABELS[id] ??
    id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase())
  );
}

function buildUnavailableModelOptionDescriptors(
  selections: ProviderOptions | null | undefined,
): ReadonlyArray<ProviderOptionDescriptor> {
  return (selections ?? []).map((selection) =>
    typeof selection.value === "boolean"
      ? {
          id: selection.id,
          label: savedOptionLabel(selection.id),
          type: "boolean" as const,
          currentValue: selection.value,
        }
      : {
          id: selection.id,
          label: savedOptionLabel(selection.id),
          type: "select" as const,
          options: [{ id: selection.value, label: selection.value }],
          currentValue: selection.value,
        },
  );
}

type TraitsPersistence =
  | {
      threadRef?: ScopedThreadRef;
      draftId?: DraftId;
      onModelOptionsChange?: never;
    }
  | {
      threadRef?: undefined;
      onModelOptionsChange: (nextOptions: ProviderOptions | undefined) => void;
    };

function DefaultBadge() {
  return (
    <Badge variant="outline" size="sm" className="min-w-0">
      Default
    </Badge>
  );
}

function getSelectedTraits(
  provider: ProviderDriverKind,
  models: ReadonlyArray<ServerProviderModel>,
  model: string | null | undefined,
  promptUltrathink: PromptUltrathink,
  modelOptions: ProviderOptions | null | undefined,
  allowPromptInjectedEffort: boolean,
  planModeEnabled: boolean,
) {
  const caps = getProviderModelCapabilities(models, model, provider, planModeEnabled);
  const modelIsUnavailable =
    provider === "opencode" &&
    !models.some((candidate) => candidate.slug === normalizeModelSlug(model, provider));
  const descriptors = modelIsUnavailable
    ? buildUnavailableModelOptionDescriptors(
        planModeEnabled
          ? modelOptions
          : modelOptions?.filter((option) => option.id !== "agent" || option.value !== "plan"),
      )
    : getProviderOptionDescriptors({
        caps,
        selections: modelOptions,
      });
  const selectDescriptors = descriptors.filter(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
      descriptor.type === "select",
  );
  const booleanDescriptors = descriptors.filter(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "boolean" }> =>
      descriptor.type === "boolean",
  );
  const primarySelectDescriptor = selectDescriptors[0] ?? null;
  const contextWindowDescriptor =
    selectDescriptors.find((descriptor) => descriptor.id === "contextWindow") ?? null;
  const agentDescriptor = selectDescriptors.find((descriptor) => descriptor.id === "agent") ?? null;
  const fastModeDescriptor =
    booleanDescriptors.find((descriptor) => descriptor.id === "fastMode") ?? null;
  const thinkingDescriptor =
    booleanDescriptors.find((descriptor) => descriptor.id === "thinking") ?? null;

  const ultrathinkPromptControlled =
    allowPromptInjectedEffort &&
    (primarySelectDescriptor?.promptInjectedValues?.length ?? 0) > 0 &&
    promptUltrathink !== "none";
  const ultrathinkInBodyText = ultrathinkPromptControlled && promptUltrathink === "body";
  const effort =
    (ultrathinkPromptControlled
      ? "ultrathink"
      : getDescriptorStringValue(primarySelectDescriptor)) ?? null;
  const thinkingEnabled =
    typeof thinkingDescriptor?.currentValue === "boolean" ? thinkingDescriptor.currentValue : null;
  const contextWindow = getDescriptorStringValue(contextWindowDescriptor);
  const selectedAgent = getDescriptorStringValue(agentDescriptor);
  const selectedAgentLabel = agentDescriptor
    ? getProviderOptionCurrentLabel(agentDescriptor)
    : null;

  return {
    caps,
    descriptors,
    selectDescriptors,
    booleanDescriptors,
    primarySelectDescriptor,
    contextWindowDescriptor,
    agentDescriptor,
    fastModeDescriptor,
    thinkingDescriptor,
    effort,
    thinkingEnabled,
    contextWindow,
    ultrathinkPromptControlled,
    ultrathinkInBodyText,
    selectedAgent,
    selectedAgentLabel,
    modelIsUnavailable,
  };
}

function getTraitsSectionVisibility(input: {
  provider: ProviderDriverKind;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  promptUltrathink?: PromptUltrathink | undefined;
  modelOptions: ProviderOptions | null | undefined;
  allowPromptInjectedEffort?: boolean;
  planModeEnabled: boolean;
}) {
  const selected = getSelectedTraits(
    input.provider,
    input.models,
    input.model,
    input.promptUltrathink ?? "none",
    input.modelOptions,
    input.allowPromptInjectedEffort ?? true,
    input.planModeEnabled,
  );

  const showEffort = selected.primarySelectDescriptor !== null;
  const showThinking = selected.thinkingDescriptor !== null;
  const showFastMode = selected.fastModeDescriptor !== null;
  const showContextWindow = selected.contextWindowDescriptor !== null;
  const showAgent = selected.agentDescriptor !== null;

  return {
    ...selected,
    showEffort,
    showThinking,
    showFastMode,
    showContextWindow,
    showAgent,
    hasAnyControls:
      showEffort ||
      showThinking ||
      showFastMode ||
      showContextWindow ||
      showAgent ||
      (selected.modelIsUnavailable && selected.descriptors.length > 0),
  };
}

/**
 * `modelOptions` must already carry the composer's implicit defaults (see
 * `withImplicitFastModeDefault`) so the persisted selection matches what the
 * picker would write.
 */
export function getReasoningTraitStep(input: {
  provider: ProviderDriverKind;
  instanceId: ProviderInstanceId;
  model: string;
  models: ReadonlyArray<ServerProviderModel>;
  modelOptions: ProviderOptions | undefined;
  reportedModelSelection: ModelSelection | null | undefined;
  prompt: string;
  planModeEnabled: boolean;
  direction: 1 | -1;
}) {
  const selected = getSelectedTraits(
    input.provider,
    input.models,
    input.model,
    readPromptUltrathink(input.prompt),
    input.modelOptions,
    true,
    input.planModeEnabled,
  );
  if (selected.modelIsUnavailable || selected.ultrathinkInBodyText) return null;
  const descriptor = selected.selectDescriptors.find((entry) => isReasoningSelect(entry));
  const choices = descriptor ? selectableProviderOptionChoices(descriptor) : [];
  if (!descriptor || choices.length < 2) return null;
  const isPrimary = descriptor.id === selected.primarySelectDescriptor?.id;
  const current =
    isPrimary && selected.ultrathinkPromptControlled
      ? "ultrathink"
      : getDescriptorStringValue(
          descriptor,
          { instanceId: input.instanceId, model: input.model, options: input.modelOptions ?? [] },
          input.reportedModelSelection,
        );
  // Walk the full catalog order so a typed Ultrathink keeps its place, then land on a pickable level.
  const ordered = input.direction > 0 ? descriptor.options : descriptor.options.toReversed();
  const position =
    [current, getDescriptorStringValue(descriptor)]
      .map((value) => ordered.findIndex((option) => option.id === value))
      .find((index) => index >= 0) ?? -1;
  const next = [...ordered.slice(position + 1), ...ordered.slice(0, Math.max(position, 0))].find(
    (option) => choices.includes(option),
  );
  const change = next && getTraitSelectChange(selected, descriptor, input.prompt, next.id);
  return change?.modelOptions ? { prompt: change.prompt, modelOptions: change.modelOptions } : null;
}

export function shouldRenderTraitsControls(input: {
  provider: ProviderDriverKind;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  promptUltrathink?: PromptUltrathink | undefined;
  modelOptions: ProviderOptions | null | undefined;
  allowPromptInjectedEffort?: boolean;
  planModeEnabled: boolean;
}): boolean {
  return getTraitsSectionVisibility(input).hasAnyControls;
}

interface TraitsMenuContentProps {
  provider: ProviderDriverKind;
  instanceId?: ProviderInstanceId;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  promptUltrathink?: PromptUltrathink | undefined;
  /** Receives an edit of the live prompt; the picker never holds the prompt text itself. */
  onPromptEdit?: (edit: (prompt: string) => string) => void;
  modelOptions?: ProviderOptions | null | undefined;
  reportedModelSelection?: ModelSelection | null | undefined;
  allowPromptInjectedEffort?: boolean;
  planModeEnabled: boolean;
  triggerClassName?: string;
  isComposerOwned?: boolean;
  /** Composer chips name the effort level unless the user picked bars. */
  effortDisplay?: EffortDisplay;
  /** Extra section shown below the traits in the picker popup (Permissions). */
  extraMenuContent?: ReactNode;
  /** This trigger also answers composer.mode (while the permissions chip is hidden). */
  extraMenuOwnsModeShortcut?: boolean;
  /** Extra tooltip text naming what else the menu holds. */
  extraMenuHint?: string;
}

/** Writes trait options to the composer's draft or thread, or to the caller's own handler. */
function useTraitsModelOptionsUpdater(
  provider: ProviderDriverKind,
  instanceId: TraitsMenuContentProps["instanceId"],
  model: TraitsMenuContentProps["model"],
  persistence: TraitsPersistence,
) {
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);
  return (nextOptions: ProviderOptions | undefined) => {
    if ("onModelOptionsChange" in persistence) {
      persistence.onModelOptionsChange(nextOptions);
      return;
    }
    const threadTarget = persistence.threadRef ?? persistence.draftId;
    if (!threadTarget) {
      return;
    }
    setProviderModelOptions(threadTarget, provider, nextOptions, {
      ...(instanceId ? { instanceId } : {}),
      model,
      persistSticky: true,
    });
  };
}

export const TraitsMenuContent = memo(function TraitsMenuContentImpl({
  provider,
  instanceId,
  models,
  model,
  promptUltrathink,
  onPromptEdit,
  modelOptions,
  reportedModelSelection,
  allowPromptInjectedEffort = true,
  planModeEnabled,
  extraMenuContent,
  ...persistence
}: TraitsMenuContentProps & TraitsPersistence) {
  const modelSelection =
    instanceId && model ? { instanceId, model, options: modelOptions ?? [] } : null;
  const updateModelOptions = useTraitsModelOptionsUpdater(provider, instanceId, model, persistence);
  const selected = getTraitsSectionVisibility({
    provider,
    models,
    model,
    promptUltrathink,
    modelOptions,
    allowPromptInjectedEffort,
    planModeEnabled,
  });
  const {
    descriptors,
    selectDescriptors,
    booleanDescriptors,
    primarySelectDescriptor,
    ultrathinkPromptControlled,
    ultrathinkInBodyText,
    hasAnyControls,
    modelIsUnavailable,
  } = selected;
  const updateDescriptors = (nextDescriptors: ReadonlyArray<ProviderOptionDescriptor>) => {
    updateModelOptions(buildProviderOptionSelectionsFromDescriptors(nextDescriptors));
  };

  const handleSelectChange = (
    descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
    value: string,
  ) => {
    // Whether a pick applies, and the options it writes, do not depend on the prompt text.
    const change = getTraitSelectChange(selected, descriptor, "", value);
    if (!change) return;
    onPromptEdit?.(
      (prompt) => getTraitSelectChange(selected, descriptor, prompt, value)?.prompt ?? prompt,
    );
    updateModelOptions(change.modelOptions);
  };

  if (!hasAnyControls) {
    return extraMenuContent ?? null;
  }

  if (modelIsUnavailable) {
    return (
      <>
        {descriptors.map((descriptor, index) => {
          const value = getProviderOptionCurrentLabel(
            descriptor,
            modelSelection,
            reportedModelSelection,
          );
          if (!value) return null;
          return (
            <div key={descriptor.id}>
              {index > 0 ? <MenuDivider /> : null}
              <MenuGroup>
                <div className="px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs">
                  {descriptor.label}
                </div>
                <div className="px-2 pb-1.5 text-muted-foreground/80 text-xs">{value}</div>
              </MenuGroup>
            </div>
          );
        })}
        {extraMenuContent ? (
          <>
            <MenuDivider />
            {extraMenuContent}
          </>
        ) : null}
      </>
    );
  }

  const renderSelectGroup = (descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>) => {
    const selectedValue =
      ultrathinkPromptControlled && descriptor.id === primarySelectDescriptor?.id
        ? "ultrathink"
        : (getDescriptorStringValue(descriptor, modelSelection, reportedModelSelection) ?? "");

    return (
      <MenuGroup>
        <div className="px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs">
          {descriptor.label}
        </div>
        {ultrathinkInBodyText && descriptor.id === primarySelectDescriptor?.id ? (
          <div className="px-2 pb-1.5 text-muted-foreground/80 text-xs">
            Your prompt contains &quot;ultrathink&quot; in the text. Remove it to change this
            option.
          </div>
        ) : null}
        <MenuRadioGroup
          value={selectedValue}
          onValueChange={(value) => handleSelectChange(descriptor, value)}
        >
          {selectableProviderOptionChoices(descriptor).map((option) => (
            <MenuRadioItem
              key={option.id}
              value={option.id}
              hideIndicator
              closeOnClick
              emphasizeActive
              disabled={ultrathinkInBodyText && descriptor.id === primarySelectDescriptor?.id}
            >
              <span className="flex w-full min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.isDefault ? <DefaultBadge /> : null}
                </span>
                {option.description ? (
                  <span className="max-w-56 text-pretty text-muted-foreground/80 text-xs">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
    );
  };
  const renderBooleanGroup = (descriptor: (typeof booleanDescriptors)[number]) => {
    const selectedValue = descriptor.currentValue === true ? "on" : "off";

    return (
      <MenuGroup>
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
          {descriptor.label}
        </div>
        <MenuRadioGroup
          value={selectedValue}
          onValueChange={(value) => {
            updateDescriptors(
              replaceDescriptorCurrentValue(descriptors, descriptor.id, value === "on"),
            );
          }}
        >
          {(["on", "off"] as const).map((value) => (
            <MenuRadioItem key={value} value={value} hideIndicator closeOnClick emphasizeActive>
              <span className="flex w-full min-w-0 items-center justify-between gap-3">
                <span>{value === "on" ? "On" : "Off"}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
    );
  };

  // Reasoning comes last, below Fast mode and Permissions.
  const isReasoning = (descriptor: ProviderOptionDescriptor) => isReasoningControl(descriptor);
  const sections = [
    ...selectDescriptors
      .filter((descriptor) => !isReasoning(descriptor))
      .map((descriptor) => ({ key: descriptor.id, node: renderSelectGroup(descriptor) })),
    ...booleanDescriptors.map((descriptor) => ({
      key: descriptor.id,
      node: renderBooleanGroup(descriptor),
    })),
    ...(extraMenuContent ? [{ key: "extra-menu-content", node: extraMenuContent }] : []),
    ...selectDescriptors
      .filter(isReasoning)
      .map((descriptor) => ({ key: descriptor.id, node: renderSelectGroup(descriptor) })),
  ];

  return (
    <>
      {sections.map(({ key, node }, index) => (
        <div key={key}>
          {index > 0 ? <MenuDivider /> : null}
          {node}
        </div>
      ))}
    </>
  );
});

export const TraitsPicker = memo(function TraitsPicker({
  provider,
  instanceId,
  models,
  model,
  promptUltrathink,
  onPromptEdit,
  modelOptions,
  reportedModelSelection,
  allowPromptInjectedEffort = true,
  planModeEnabled,
  triggerClassName,
  isComposerOwned,
  effortDisplay = "label",
  extraMenuContent,
  extraMenuOwnsModeShortcut,
  extraMenuHint,
  size = "sm",
  hidden = false,
  disabled = false,
  ...persistence
}: TraitsMenuContentProps &
  TraitsPersistence & {
    size?: ComposerControlSize;
    hidden?: boolean;
    disabled?: boolean;
  }) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [isMenuOpen, setIsMenuOpen] = useComposerMenuState(hidden || disabled);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { descriptors, primarySelectDescriptor, ultrathinkPromptControlled } =
    getTraitsSectionVisibility({
      provider,
      models,
      model,
      promptUltrathink,
      modelOptions,
      allowPromptInjectedEffort,
      planModeEnabled,
    });
  if (
    !shouldRenderTraitsControls({
      provider,
      models,
      model,
      promptUltrathink,
      modelOptions,
      allowPromptInjectedEffort,
      planModeEnabled,
    })
  ) {
    return null;
  }

  const { label: triggerLabel, speedLabel } = buildTraitsTriggerDisplay({
    provider,
    descriptors,
    primarySelectDescriptorId: primarySelectDescriptor?.id ?? null,
    ultrathinkPromptControlled,
    modelSelection: instanceId && model ? { instanceId, model, options: modelOptions ?? [] } : null,
    reportedModelSelection,
  });
  const isCodexStyle = provider === "codex";
  // In the composer, Fast mode is its own toggle (FastModeToggle), so the trigger shows no bolt.
  const fastModeDescriptor = isComposerOwned
    ? descriptors.find((descriptor) => descriptor.id === "fastMode")
    : undefined;
  // In the composer the glyph has no word, so the tooltip and label name the control.
  const triggerDescription = isComposerOwned
    ? [`Effort: ${triggerLabel}`, speedLabel, extraMenuHint].filter(Boolean).join(" · ")
    : triggerLabel;
  const effortGlyph =
    isComposerOwned && primarySelectDescriptor && isReasoningSelect(primarySelectDescriptor)
      ? resolveEffortGlyph(
          primarySelectDescriptor,
          ultrathinkPromptControlled
            ? "ultrathink"
            : getDescriptorStringValue(
                primarySelectDescriptor,
                instanceId && model ? { instanceId, model, options: modelOptions ?? [] } : null,
                reportedModelSelection,
              ),
        )
      : null;
  // Workflow levels such as Ultracode always show their name; the setting names every level.
  // Traits the bars cannot show, such as an agent mode, appear as words in the composer.
  const effortWord = effortGlyph
    ? (effortGlyph.special ?? (effortDisplay === "label" ? effortGlyph.label : null))
    : isComposerOwned
      ? triggerLabel
      : null;

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        setIsMenuOpen(open && !disabled);
      }}
      onOpenChangeComplete={(open) => focusRequestedPermission(open, triggerRef.current)}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <ComposerControl
                  ref={triggerRef}
                  disabled={disabled}
                  aria-label={triggerDescription}
                  data-composer-shortcut={
                    isComposerOwned
                      ? extraMenuOwnsModeShortcut
                        ? "composer.effort composer.mode"
                        : "composer.effort"
                      : undefined
                  }
                  size={size}
                  className={cn(
                    isCodexStyle
                      ? "min-w-0 max-w-40 shrink justify-start overflow-hidden whitespace-nowrap sm:max-w-48"
                      : "shrink-0 whitespace-nowrap",
                    triggerClassName,
                    // Effort reads on from the model name, "Opus 5.5 High", a word space (4px)
                    // after it: the model chip's 4px end padding and the 2px row gap, less 2px.
                    isComposerOwned && (effortWord !== null ? "-ms-0.5 ps-0" : "-ms-1 ps-0.5"),
                    // The word sits at 55% next to the model name and brightens like it on hover.
                    effortWord !== null &&
                      "text-foreground/55 dark:text-foreground/55 hover:text-(--foreground-solid) dark:hover:text-(--foreground-solid) data-pressed:text-(--foreground-solid) data-popup-open:text-(--foreground-solid)",
                  )}
                />
              }
            />
          }
        >
          {effortGlyph ? (
            <span className="flex items-center gap-1.5">
              {effortWord === null ? (
                <EffortGlyph count={effortGlyph.count} filled={effortGlyph.filled} size={size} />
              ) : null}
              {effortWord !== null ? (
                <>
                  <span data-composer-control-label>{effortWord}</span>
                  {/* Icon-only footers hide labels and reveal this instead. */}
                  <GaugeIcon
                    aria-hidden="true"
                    data-composer-control-compact-icon
                    className="invisible absolute size-3.5"
                  />
                </>
              ) : (
                <span data-composer-control-label className="sr-only">
                  {triggerLabel}
                </span>
              )}
              {speedLabel === "Ultrafast" ||
              (speedLabel === "Fast" && fastModeDescriptor === undefined) ? (
                <FastBolt ultra={speedLabel === "Ultrafast"} />
              ) : null}
            </span>
          ) : effortWord !== null ? (
            <>
              <span data-composer-control-label>{effortWord}</span>
              <GaugeIcon
                aria-hidden="true"
                data-composer-control-compact-icon
                className="invisible absolute size-3.5"
              />
            </>
          ) : isCodexStyle ? (
            <span
              className={cn(
                "flex min-w-0 w-full items-center",
                size === "xs" ? "gap-1" : "gap-1.5",
              )}
            >
              <ComposerControlIcon icon={GaugeIcon} size={size} />
              <span data-composer-control-label className="min-w-0 truncate">
                {triggerLabel}
              </span>
            </span>
          ) : (
            <>
              <ComposerControlIcon icon={GaugeIcon} size={size} />
              <span data-composer-control-label>{triggerLabel}</span>
            </>
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">{triggerDescription}</TooltipPopup>
      </Tooltip>
      <MenuPopup align="start" {...(isComposerOwned ? composerFloatingLayerProps : {})}>
        <TraitsMenuContent
          provider={provider}
          {...(instanceId ? { instanceId } : {})}
          models={models}
          model={model}
          promptUltrathink={promptUltrathink}
          {...(onPromptEdit ? { onPromptEdit } : {})}
          modelOptions={modelOptions}
          reportedModelSelection={reportedModelSelection}
          allowPromptInjectedEffort={allowPromptInjectedEffort}
          planModeEnabled={planModeEnabled}
          {...(extraMenuContent ? { extraMenuContent } : {})}
          {...persistence}
        />
      </MenuPopup>
    </Menu>
  );
});

/** Whether the model offers Fast mode, so the composer shows FastModeToggle instead of a logo. */
export function hasFastModeTrait(
  input: Pick<
    TraitsMenuContentProps,
    "provider" | "models" | "model" | "modelOptions" | "planModeEnabled"
  >,
): boolean {
  return getTraitsSectionVisibility({
    ...input,
    modelOptions: input.modelOptions,
  }).descriptors.some(
    (descriptor) => descriptor.id === "fastMode" && descriptor.type === "boolean",
  );
}

/**
 * Fast mode in the composer: a bolt where the provider logo sat, 5px from the model name like the
 * logo. One click toggles it; on, it is a filled white bolt, off a hollow grey one.
 */
export const FastModeToggle = memo(function FastModeToggle({
  provider,
  instanceId,
  models,
  model,
  modelOptions,
  planModeEnabled,
  size = "sm",
  disabled = false,
  ...persistence
}: Pick<
  TraitsMenuContentProps,
  "provider" | "instanceId" | "models" | "model" | "modelOptions" | "planModeEnabled"
> &
  TraitsPersistence & { size?: ComposerControlSize; disabled?: boolean }) {
  const updateModelOptions = useTraitsModelOptionsUpdater(provider, instanceId, model, persistence);
  const { descriptors } = getTraitsSectionVisibility({
    provider,
    models,
    model,
    modelOptions,
    planModeEnabled,
  });
  const fastMode = descriptors.find((descriptor) => descriptor.id === "fastMode");
  if (!fastMode || fastMode.type !== "boolean") return null;
  const on = fastMode.currentValue === true;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ComposerControl
            size={size}
            disabled={disabled}
            aria-label="Fast mode"
            aria-pressed={on}
            onClick={() =>
              updateModelOptions(
                buildProviderOptionSelectionsFromDescriptors(
                  replaceDescriptorCurrentValue(descriptors, "fastMode", !on),
                ),
              )
            }
            // A 20px square overlapping the model button, the bolt about 7px from the name (5px felt
            // cramped, 8px detached). On is the filled bolt alone; hover brightens it like the name and
            // effort word, no box. Above the model button so the whole square is the click target.
            className="z-10 size-5 px-0 -me-2.5 hover:bg-transparent aria-pressed:bg-transparent aria-pressed:hover:bg-transparent"
          />
        }
      >
        <ZapIcon
          aria-hidden="true"
          data-composer-control-icon
          data-fast-mode-bolt
          className={cn(
            "size-2.75",
            on
              ? "fill-current text-foreground"
              : "text-foreground/40 [:hover>&]:text-foreground/80",
          )}
        />
      </TooltipTrigger>
      <TooltipPopup side="top">Fast mode {on ? "on" : "off"}</TooltipPopup>
    </Tooltip>
  );
});
