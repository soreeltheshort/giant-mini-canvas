import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNamingConventions } from "@/hooks/useNamingConventions";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function MapPlanetNamingSection({ isAdmin }: { isAdmin: boolean }) {
  const { conventions } = useNamingConventions();
  const { toast } = useToast();
  const [currentId, setCurrentId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("planet_naming_convention_id")
        .eq("id", "global")
        .maybeSingle();
      setCurrentId(data?.planet_naming_convention_id ?? "");
      setLoaded(true);
    })();
  }, []);

  const planetConvs = conventions.filter((c) => c.kind === "planet");

  const save = async (val: string) => {
    setCurrentId(val);
    const { error } = await (supabase as any)
      .from("app_settings")
      .upsert({ id: "global", planet_naming_convention_id: val || null }, { onConflict: "id" });
    if (error) toast({ title: "Failed to save", description: error.message, variant: "destructive" });
  };

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Map Planet Naming</h2>
      <p className="text-xs text-muted-foreground">
        Shared across all players. Planet names are drawn from this single list during map generation.
      </p>
      <div>
        <Label className="text-[10px] text-muted-foreground">Planet naming convention</Label>
        <select
          value={currentId}
          disabled={!isAdmin || !loaded}
          onChange={(e) => save(e.target.value)}
          className="h-8 w-full rounded border border-border bg-background px-2 text-sm"
        >
          <option value="">— none —</option>
          {planetConvs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
