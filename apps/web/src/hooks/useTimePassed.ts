import { useSyncExternalStore } from "react";

const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * True once `iso` is in the past; re-renders when it passes. Null or invalid stays false.
 * Ghost: lets a usage window read as reset at its reset time instead of after the next refresh.
 */
export function useTimePassed(iso: string | null | undefined): boolean {
  const target = iso ? Date.parse(iso) : Number.NaN;
  const subscribe = (onChange: () => void) => {
    if (!Number.isFinite(target)) return () => {};
    const remaining = target - Date.now();
    if (remaining <= 0) return () => {};
    const timer = setTimeout(onChange, Math.min(remaining + 50, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  };
  const read = () => Number.isFinite(target) && Date.now() >= target;
  return useSyncExternalStore(subscribe, read, read);
}
