import { useEffect, useRef } from "react";

/**
 * Runs `fn` when `open` turns true — and only then. Edit dialogs use this to
 * fill their fields from the record being edited.
 *
 * Don't put the record in an effect's dependency list for that: pages poll, so
 * the record is a new object every few seconds, and the effect would wipe
 * whatever the person has typed since. `fn` always sees the latest props.
 */
export function useOnOpen(open: boolean, fn: () => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (open) latest.current();
  }, [open]);
}
