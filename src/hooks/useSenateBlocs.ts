import { useCallback, useEffect, useState } from "react";
import {
  SenateBloc,
  listSenateBlocs,
  resolveGameSenateBlocSetId,
} from "@/lib/senateBlocs";

/**
 * Loads the senate blocs used by a game (or the global default set when no
 * game id is supplied). Senate blocs are unrelated to military factions.
 */
export function useSenateBlocs(gameId?: string | null) {
  const [blocs, setBlocs] = useState<SenateBloc[]>([]);
  const [setId, setSetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resolved = await resolveGameSenateBlocSetId(gameId);
      setSetId(resolved);
      setBlocs(resolved ? await listSenateBlocs(resolved) : []);
    } catch (e) {
      console.error("[SenateBlocs] load failed", e);
      setBlocs([]);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  return { blocs, setId, loading, refetch: load };
}
