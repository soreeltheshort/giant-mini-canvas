import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TextRequest {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the destructive style. */
  destructive?: boolean;
}

interface Pending {
  mode: "text" | "confirm";
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

/**
 * In-app replacements for the browser's prompt()/confirm(), which render with
 * the "An embedded page at ... says" chrome. Resolves like the native calls:
 * ask() -> string | null, askConfirm() -> boolean.
 */
export function usePromptDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const resolveRef = useRef<((result: string | null) => void) | null>(null);

  const open = useCallback((next: Pending, initial: string) => {
    setValue(initial);
    setPending(next);
  }, []);

  const settle = useCallback((result: string | null) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const ask = useCallback(
    (req: TextRequest) =>
      new Promise<string | null>((resolve) => {
        resolveRef.current = resolve;
        open(
          {
            mode: "text",
            title: req.title,
            message: req.message,
            placeholder: req.placeholder,
            confirmLabel: req.confirmLabel ?? "OK",
            cancelLabel: "Cancel",
            destructive: false,
          },
          req.defaultValue ?? "",
        );
      }),
    [open],
  );

  const askConfirm = useCallback(
    (req: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = (result) => resolve(result === "confirmed");
        open(
          {
            mode: "confirm",
            title: req.title,
            message: req.message,
            confirmLabel: req.confirmLabel ?? "Confirm",
            cancelLabel: req.cancelLabel ?? "Cancel",
            destructive: req.destructive ?? false,
          },
          "confirmed",
        );
      }),
    [open],
  );

  const dialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(next) => {
        if (!next) settle(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {pending && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              settle(pending.mode === "text" ? value.trim() || null : "confirmed");
            }}
          >
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-[0.15em]">
                {pending.title}
              </DialogTitle>
              {pending.message ? (
                <DialogDescription className="text-sm text-muted-foreground">
                  {pending.message}
                </DialogDescription>
              ) : null}
            </DialogHeader>

            {pending.mode === "text" && (
              <div className="py-4">
                <Input
                  autoFocus
                  value={value}
                  placeholder={pending.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  className="font-body"
                />
              </div>
            )}

            <DialogFooter className="mt-4 gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => settle(null)}
              >
                {pending.cancelLabel}
              </Button>
              <Button
                type="submit"
                size="sm"
                variant={pending.destructive ? "destructive" : "default"}
              >
                {pending.confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );

  return { ask, askConfirm, dialog };
}
