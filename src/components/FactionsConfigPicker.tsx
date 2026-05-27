import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  applyAndSetDefaultFactionsConfig,
  applyFactionsConfigBundle,
  getDefaultFactionsConfigId,
  listSavedFactionsConfigs,
  SavedFactionsConfigRow,
  setDefaultFactionsConfigId,
  uploadFactionsConfigFile,
  FactionsConfigBundle,
} from "@/lib/factionsConfig";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  /** When true, picking/uploading also applies the config to global tables. */
  applyOnSelect?: boolean;
  disabled?: boolean;
  label?: string;
}

/**
 * Picker for Factions Config used at game-creation time.
 * Defaults to the global last-loaded config; admins/testers can also upload a new file.
 */
export default function FactionsConfigPicker({
  value,
  onChange,
  applyOnSelect = false,
  disabled,
  label = "Factions Config",
}: Props) {
  const { user, isAdmin, isTester } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [configs, setConfigs] = useState<SavedFactionsConfigRow[]>([]);
  const [busy, setBusy] = useState(false);
  const canUpload = isAdmin || isTester;

  useEffect(() => {
    (async () => {
      const list = await listSavedFactionsConfigs().catch(() => []);
      setConfigs(list);
      if (!value) {
        const def = await getDefaultFactionsConfigId().catch(() => null);
        if (def) onChange(def);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (id: string) => {
    onChange(id);
    if (applyOnSelect) {
      setBusy(true);
      try {
        await applyAndSetDefaultFactionsConfig(id);
        toast({ title: "Factions Config applied" });
      } catch (e: any) {
        toast({ title: "Apply failed", description: e.message ?? String(e), variant: "destructive" });
      } finally {
        setBusy(false);
      }
    } else {
      // Still remember selection as the new default for next time.
      setDefaultFactionsConfigId(id).catch(() => {});
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setBusy(true);
    try {
      const text = await file.text();
      const bundle: FactionsConfigBundle = JSON.parse(text);
      if (!bundle || bundle.version !== 1 || !bundle.tables) {
        throw new Error("Unrecognized config file format");
      }
      if (applyOnSelect) await applyFactionsConfigBundle(bundle);
      const row = await uploadFactionsConfigFile({
        name: file.name.replace(/\.json$/i, ""),
        bundle,
        uploadedBy: user.id,
      });
      await setDefaultFactionsConfigId(row.id);
      setConfigs((prev) => [row, ...prev]);
      onChange(row.id);
      toast({ title: applyOnSelect ? "Factions Config uploaded & applied" : "Factions Config uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-heading uppercase tracking-[0.25em] text-bronze">{label}</div>
      <div className="flex items-center gap-2">
        <Select value={value ?? ""} onValueChange={pick} disabled={disabled || busy || configs.length === 0}>
          <SelectTrigger className="flex-1 min-w-[14rem]">
            <SelectValue placeholder={configs.length === 0 ? "No configs uploaded yet" : "Select a config"} />
          </SelectTrigger>
          <SelectContent>
            {configs.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canUpload && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || busy}
            >
              {busy ? "Working…" : "Upload…"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onFile}
            />
          </>
        )}
      </div>
    </div>
  );
}
