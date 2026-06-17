import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { forkGameFromSnapshot } from "@/lib/forkGameFromSnapshot";

interface SnapshotRow {
  id: string;
  game_id: string;
  turn_number: number;
  label: string;
  created_at: string;
}

interface GameRow {
  id: string;
  name: string;
  parent_game_id: string | null;
}

const AdminSnapshots = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [forking, setForking] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: snaps }, { data: gs }] = await Promise.all([
        (supabase as any).from("game_snapshots").select("id, game_id, turn_number, label, created_at").order("created_at", { ascending: false }),
        (supabase as any).from("games").select("id, name, parent_game_id"),
      ]);
      setSnapshots(snaps || []);
      setGames(gs || []);
      setLoading(false);
    })();
  }, []);

  if (!isAdmin) { navigate("/"); return null; }

  const gameById = new Map(games.map(g => [g.id, g] as const));
  const filterLower = filter.trim().toLowerCase();
  const visible = snapshots.filter(s => {
    if (!filterLower) return true;
    const g = gameById.get(s.game_id);
    return (
      (g?.name || "").toLowerCase().includes(filterLower) ||
      (s.label || "").toLowerCase().includes(filterLower)
    );
  });

  const handleFork = async (s: SnapshotRow) => {
    if (!user) return;
    const g = gameById.get(s.game_id);
    if (!g) { toast({ title: "Parent game missing", variant: "destructive" }); return; }
    if (!confirm(`Fork new branch from "${g.name}" snapshot "${s.label}" (turn ${s.turn_number})?`)) return;
    setForking(s.id);
    try {
      const result = await forkGameFromSnapshot({
        parentGameId: s.game_id,
        snapshotId: s.id,
        createdBy: user.id,
      });
      toast({ title: "Forked", description: result.newGameName });
      navigate("/admin/games");
    } catch (e: any) {
      toast({ title: "Fork failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setForking(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this snapshot?")) return;
    await (supabase as any).from("game_snapshots").delete().eq("id", id);
    setSnapshots(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="container py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Snapshots</h1>
          <Button variant="outline" onClick={() => navigate("/admin/games")}>← Back to Games</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Every saved snapshot across every game. Use <strong>Fork</strong> to create a new branched game from a point in time — the original game is preserved.
        </p>

        <Input
          placeholder="Filter by game name or snapshot label..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="max-w-sm"
        />

        <div className="border border-border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead>Snapshot</TableHead>
                <TableHead className="w-16">Turn</TableHead>
                <TableHead className="w-44">Saved</TableHead>
                <TableHead className="text-right w-56">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : visible.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No snapshots</TableCell></TableRow>
              ) : visible.map(s => {
                const g = gameById.get(s.game_id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {g?.name || <span className="text-muted-foreground italic">(deleted game)</span>}
                        {g?.parent_game_id && <Badge variant="outline" className="text-[10px]">SS</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{s.label}</TableCell>
                    <TableCell className="text-xs">{s.turn_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!g || forking === s.id}
                        onClick={() => handleFork(s)}
                      >
                        {forking === s.id ? "Forking..." : "Fork"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(s.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default AdminSnapshots;
