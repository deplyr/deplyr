import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (last one wins) —
 * needed once components start conditionally overriding each other's
 * classes (e.g. a caller passing `p-4` to override a component's own
 * `p-6`), which a plain join can't do. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
