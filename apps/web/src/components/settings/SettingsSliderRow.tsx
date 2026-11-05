import type { CSSProperties } from "react";
import {
  MAX_WINDOW_SURFACE_OPACITY,
  MIN_WINDOW_SURFACE_OPACITY,
} from "@t3tools/contracts/settings";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting, type SettingsSearchItemId } from "./settingsSearch";

/** A slider for the transparent window: a surface's opacity (0–100%) or the blur behind it. */
export function SettingsSliderRow({
  searchId,
  inputId,
  label,
  description,
  value,
  defaultValue,
  onChange,
  min = MIN_WINDOW_SURFACE_OPACITY,
  max = MAX_WINDOW_SURFACE_OPACITY,
  unit = "%",
  step = 5,
  format,
}: {
  searchId: SettingsSearchItemId;
  inputId: string;
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  step?: number;
  format?: (value: number) => string;
}) {
  const ratio = (value - min) / (max - min);
  const sliderStyle = {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
  return (
    <SettingsRow
      {...searchableSetting(searchId)}
      description={description}
      resetAction={
        value !== defaultValue ? (
          <SettingResetButton label={label.toLowerCase()} onClick={() => onChange(defaultValue)} />
        ) : null
      }
      control={
        <div className="flex w-full items-center gap-3 sm:w-52">
          <output
            className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
            htmlFor={inputId}
          >
            {format ? format(value) : `${value}${unit}`}
          </output>
          <input
            aria-label={label}
            className="settings-slider min-w-0 flex-1"
            id={inputId}
            max={max}
            min={min}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isInteger(next) && next >= min && next <= max) {
                onChange(next);
              }
            }}
            step={step}
            style={sliderStyle}
            type="range"
            value={value}
          />
        </div>
      }
    />
  );
}
