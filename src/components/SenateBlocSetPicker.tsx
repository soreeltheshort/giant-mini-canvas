import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SenateBlocSet,
  getDefaultSenateBlocSetId,
  listSenateBlocSets,
  setDefaultSenateBlocSetId,
} from "@/lib/senateBlocs";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  label?: string;
  /** Persist the chosen set as the new global default. Defaults to true. */
  rememberAsDefault?: boolean;
}

/**
 * Picker for a saved senate bloc set (Politics) used at game-creation time.
 * Defaults to the last-used set.
 */
export default function SenateBlocSetPicker({
  value,
  onChange,
  disabled,
  label = "Politics Set",
  rememberAsDefault = true,
}: Props) {
  const [sets, setSets] = useState<SenateBlocSet[]>([]);

  useEffect(() => {
    (async () => {
      const [rows, defId] = await Promise.all([
        listSenateBlocSets().catch(() => [] as SenateBlocSet[]),
        getDefaultSenateBlocSetId().catch(() => null),
      ]);
      setSets(rows);
      if (!value) {
        const def = rows.find((s) => s.id === defId) || rows[0] || null;
        if (def) onChange(def.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (id: string) => {
    onChange(id);
    if (rememberAsDefault) await setDefaultSenateBlocSetId(id).catch(() => {});
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-heading uppercase tracking-[0.25em] text-bronze">{label}</div>
      <Select value={value ?? ""} onValueChange={pick} disabled={disabled || sets.length === 0}>
        <SelectTrigger className="min-w-[14rem]">
          <SelectValue placeholder={sets.length === 0 ? "No politics sets yet" : "Select a politics set"} />
        </SelectTrigger>
        <SelectContent className="bg-background z-50">
          {sets.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
