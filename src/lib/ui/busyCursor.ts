/**
 * Global "busy" cursor manager. Any code path that runs a
 * user-visible async action can wrap itself in `withBusyCursor`
 * (or push/pop manually) to show the imperial waiting cursor
 * across the entire app until the work resolves.
 *
 * Uses a reference count so overlapping operations play nicely.
 */

let busyCount = 0;

function apply() {
  if (typeof document === "undefined") return;
  if (busyCount > 0) {
    document.body.classList.add("app-busy");
  } else {
    document.body.classList.remove("app-busy");
  }
}

export function pushBusy() {
  busyCount += 1;
  apply();
}

export function popBusy() {
  busyCount = Math.max(0, busyCount - 1);
  apply();
}

export function setBusy(active: boolean) {
  if (active) pushBusy();
  else popBusy();
}

export async function withBusyCursor<T>(fn: () => Promise<T>): Promise<T> {
  pushBusy();
  try {
    return await fn();
  } finally {
    popBusy();
  }
}
