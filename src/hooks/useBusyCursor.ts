import { useEffect } from "react";
import { pushBusy, popBusy } from "@/lib/ui/busyCursor";

/**
 * Mirrors a boolean "busy" flag into the global imperial wait cursor.
 * Safe with StrictMode double-invoke because push/pop are balanced.
 */
export function useBusyCursor(active: boolean) {
  useEffect(() => {
    if (!active) return;
    pushBusy();
    return () => popBusy();
  }, [active]);
}
