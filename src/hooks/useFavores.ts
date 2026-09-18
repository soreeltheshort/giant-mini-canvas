import { useCallback, useEffect, useState } from "react";
import { Favor, getDefaultFavorSetId, listFavors } from "@/lib/favores";

/** Loads the active Favores set for the player-facing Politics surface. */
export function useFavores() {
  const [favors, setFavors] = useState<Favor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const setId = await getDefaultFavorSetId();
      setFavors(setId ? await listFavors(setId) : []);
    } catch (error) {
      console.error("[Favores] load failed", error);
      setFavors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { favors, loading, refetch: load };
}