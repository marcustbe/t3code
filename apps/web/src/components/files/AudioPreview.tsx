import { LoaderCircleIcon, PauseIcon, PlayIcon, TriangleAlertIcon } from "lucide-react";
import { createContext, useContext, useRef, useState, type CSSProperties } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";
import { cn } from "~/lib/utils";
import { ContextChip, ContextChipAction, ContextChipLabel } from "../ContextChip";
import { claimExclusivePlayback } from "../media/exclusivePlayback";
import { middleTruncateAttachmentName } from "../composerInlineChip";

export const AudioPreviewUnmountContext = createContext<((audio: HTMLAudioElement) => void) | null>(
  null,
);

type AudioPreviewProps = {
  readonly src: string;
  readonly name: string;
  readonly revision?: string | null;
  readonly onError?: () => void;
  readonly compact?: boolean;
  readonly variant?: "chip" | "bubble" | "card";
  readonly failed?: boolean;
  readonly onOpen?: (() => void) | undefined;
  readonly onRetry?: () => void;
};

export function AudioPreview(props: AudioPreviewProps) {
  return props.compact ? (
    <AudioChip key={`${props.revision ?? props.src}:${!!props.failed}`} {...props} />
  ) : (
    <StandardAudioPreview {...props} />
  );
}

function StandardAudioPreview(props: AudioPreviewProps) {
  const onUnmount = useContext(AudioPreviewUnmountContext);
  const audioRef = useStableCallback((audio: HTMLAudioElement | null) => {
    if (audio) return () => onUnmount?.(audio);
  });
  const [loadedSource, setLoadedSource] = useState<{ src: string; revision: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const revision = props.revision ?? null;
  // Changed files load once playback pauses.
  if (loadedSource !== null && loadedSource.revision !== revision && !playing) {
    setLoadedSource(revision === null ? null : { src: props.src, revision });
  }
  const src = loadedSource?.src ?? props.src;
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={src}
        aria-label={props.name}
        className="w-full max-w-xl"
        onLoadedMetadata={() => {
          if (revision !== null && loadedSource === null) setLoadedSource({ src, revision });
        }}
        onPlay={(event) => {
          claimExclusivePlayback(event.currentTarget);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setLoadedSource(null);
          if (src === props.src) props.onError?.();
        }}
      />
    </div>
  );
}

// The track fills to `--audio-progress`; Chromium/WebKit and Firefox style ranges through separate pseudo-elements.
const AUDIO_SEEK_CLASS_NAME = cn(
  "block h-3 w-full cursor-pointer appearance-none bg-transparent text-foreground focus-visible:outline-none disabled:cursor-default",
  "[&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,currentColor_var(--audio-progress),color-mix(in_srgb,currentColor_25%,transparent)_var(--audio-progress))]",
  "[&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[linear-gradient(to_right,currentColor_var(--audio-progress),color-mix(in_srgb,currentColor_25%,transparent)_var(--audio-progress))]",
  "[&::-webkit-slider-thumb]:-mt-[3.5px] [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current",
  "[&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-current",
  "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-current/40",
);

function audioTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function AudioChip(props: AudioPreviewProps) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const onUnmount = useContext(AudioPreviewUnmountContext);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const src = loadedSource ?? props.src;
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useStableCallback((element: HTMLAudioElement | null) => {
    audio.current = element;
    if (element)
      return () => {
        element.pause();
        onUnmount?.(element);
        audio.current = null;
      };
  });
  const loading = !props.failed && !ready;
  const open = props.onOpen ?? (props.failed ? props.onRetry : undefined);
  const action = props.failed
    ? props.onOpen
      ? "Open"
      : "Retry"
    : loading
      ? "Loading"
      : playing
        ? "Pause"
        : "Play";
  const Icon = props.failed
    ? TriangleAlertIcon
    : loading
      ? LoaderCircleIcon
      : playing
        ? PauseIcon
        : PlayIcon;

  const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const toggle = () => {
    if (props.failed) {
      open?.();
      return;
    }
    const element = audio.current;
    if (!element) return;
    if (!element.paused) element.pause();
    else
      void element.play().catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) props.onError?.();
      });
  };
  const timeLabel = props.failed
    ? "Unavailable"
    : loading
      ? "..."
      : duration > 0
        ? elapsed > 0 || playing
          ? `${audioTime(elapsed)} / ${audioTime(duration)}`
          : audioTime(duration)
        : audioTime(elapsed);
  const audioElement =
    props.src && !props.failed ? (
      <audio
          ref={audioRef}
          hidden
          preload="metadata"
          src={src}
          aria-label={props.name}
          onLoadedMetadata={(event) => {
            setLoadedSource(src);
            setReady(true);
            const value = event.currentTarget.duration;
            setDuration(Number.isFinite(value) ? value : 0);
          }}
          onLoadedData={() => setReady(true)}
          onCanPlay={() => setReady(true)}
          onDurationChange={(event) => {
            const value = event.currentTarget.duration;
            setDuration(Number.isFinite(value) ? value : 0);
          }}
          onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
          onPlay={(event) => {
            claimExclusivePlayback(event.currentTarget);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            if (src === props.src) props.onError?.();
            else {
              setPlaying(false);
              setReady(false);
              setLoadedSource(null);
            }
          }}
        />
    ) : null;

  if (props.variant === "card") {
    return (
      <span
        className="flex w-full max-w-[min(100%,30rem)] items-center gap-3 rounded-xl border border-black/10 bg-black/[0.04] px-3 py-2.5 dark:border-white/20 dark:bg-white/[0.06]"
        title={props.failed ? "Audio unavailable. Open the file or retry playback." : props.name}
      >
        <button
          type="button"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background disabled:cursor-default disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&_svg]:size-3.5"
          aria-label={`${props.failed ? "Audio unavailable. " : ""}${action} ${props.name}`}
          disabled={loading}
          onClick={toggle}
        >
          <Icon
            aria-hidden
            className={cn(
              loading && props.src && "animate-spin",
              Icon === PlayIcon && "translate-x-px fill-current",
              Icon === PauseIcon && "fill-current",
            )}
          />
        </button>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-3">
            {open ? (
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate rounded-sm text-left text-sm text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
                onClick={open}
                aria-label={`${props.failed && !props.onOpen ? "Retry" : "Preview"} ${props.name}`}
              >
                {props.name}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{props.name}</span>
            )}
            <span dir="ltr" className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {timeLabel}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step="any"
            value={Math.min(elapsed, duration)}
            disabled={loading || props.failed || duration <= 0}
            aria-label={`Seek ${props.name}`}
            aria-valuetext={`${audioTime(elapsed)} of ${audioTime(duration)}`}
            className={AUDIO_SEEK_CLASS_NAME}
            style={{ "--audio-progress": `${progress}%` } as CSSProperties}
            onChange={(event) => {
              const element = audio.current;
              if (!element) return;
              element.currentTime = Number(event.currentTarget.value);
              setElapsed(element.currentTime);
            }}
          />
        </span>
        {audioElement}
      </span>
    );
  }

  return (
    <ContextChip
      kind="file"
      {...(props.failed ? { state: "invalid" as const } : {})}
      {...(props.variant === "bubble" ? { shape: "bubble" as const } : {})}
      className="relative isolate overflow-hidden"
      title={props.failed ? "Audio unavailable. Open the file or retry playback." : props.name}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 -z-10 bg-(--context-chip-accent)/17"
        style={{ width: `${progress}%` }}
      />
      <ContextChipAction
        className="ml-0 [&_svg]:size-[1em]"
        aria-label={`${props.failed ? "Audio unavailable. " : ""}${action} ${props.name}`}
        disabled={loading}
        onClick={toggle}
      >
        <Icon aria-hidden className={loading && props.src ? "animate-spin" : undefined} />
      </ContextChipAction>
      <ContextChipLabel className={props.variant === "bubble" ? "flex-1" : "max-w-72"}>
        {open ? (
          <button
            type="button"
            className="block max-w-full cursor-pointer truncate rounded-sm text-left focus-visible:outline-2 focus-visible:outline-foreground"
            onClick={open}
            aria-label={`${props.failed && !props.onOpen ? "Retry" : "Preview"} ${props.name}`}
          >
            {middleTruncateAttachmentName(props.name)}
          </button>
        ) : (
          middleTruncateAttachmentName(props.name)
        )}
      </ContextChipLabel>
      <span dir="ltr" className="shrink-0 self-baseline text-3xs text-current">
        {timeLabel}
      </span>
      {audioElement}
    </ContextChip>
  );
}
