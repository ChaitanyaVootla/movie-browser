import { useSyncExternalStore } from "react";

// Server-safe hook to detect if component is mounted (hydrated)
// Uses useSyncExternalStore to avoid hydration mismatches
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useMounted() {
  return useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
}
