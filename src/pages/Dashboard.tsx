import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Fleet {
  id: string;
  name: string;
  revision: number;
  points_budget: number;
  created_at: string;
  owner_user_id: string;
  owner_display_name?: string;
}

const Dashboard = () => {
  const { user, loading, isAdmin, isTester } = useAuth();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fetching, setFetching] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const canSeeAll = isAdmin || isTester;

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user && !loading) fetchFleets();
  }, [user, loading, canSeeAll]);

  const fetchFleets = async () => {
    let query = supabase
      .from("fleets")
      .select("id, name, revision, points_budget, created_at, owner_user_id")
      .order("updated_at", { ascending: false });

    if (!canSeeAll) {
      query = query.eq("owner_user_id", user!.id);
    }

    const { data, error } = await query;
    if (error || !data) { setFetching(false); return; }

    // Fetch owner display names
    const ownerIds = [...new Set(data.map(f => f.owner_user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds);
    const nameMap = new Map((profiles || []).map(p => [p.user_id, p.display_name]));

    setFleets(data.map(f => ({ ...f, owner_display_name: nameMap.get(f.owner_user_id) || undefined })));
    setFetching(false);
  };

  const deleteFleet = async (id: string) => {
    const { error } = await supabase.from("fleets").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setFleets(f => f.filter(fl => fl.id !== id));
    }
  };

  const duplicateFleet = async (fleet: Fleet) => {
    const { data: newFleet, error } = await supabase
      .from("fleets")
      .insert({ owner_user_id: user!.id, name: `${fleet.name} (copy)`, points_budget: fleet.points_budget })
      .select()
      .single();
    if (error || !newFleet) { toast({ title: "Error", description: error?.message, variant: "destructive" }); return; }
    // Copy ships
    const { data: ships } = await supabase.from("fleet_ships").select("ship_type_id, quantity, tactical_group, notes").eq("fleet_id", fleet.id);
    if (ships && ships.length > 0) {
      await supabase.from("fleet_ships").insert(ships.map(s => ({ ...s, fleet_id: newFleet.id })));
    }
    fetchFleets();
  };

  if (loading || fetching) {
    return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-foreground">{canSeeAll ? "All Fleets" : "Your Fleets"}</h1>
          <div className="flex gap-3">
            <Button onClick={() => navigate("/fleet-builder")}>New Fleet</Button>
            <Button variant="outline" onClick={() => navigate("/battle")}>Simulate Battle</Button>
          </div>
        </div>

        {fleets.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-muted-foreground">No fleets yet. Create your first fleet to get started.</p>
            <Button className="mt-4" onClick={() => navigate("/fleet-builder")}>Create Fleet</Button>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {fleets.map(fleet => {
              const isOwn = fleet.owner_user_id === user?.id;
              const canEdit = isOwn || canSeeAll;
              return (
                <div key={fleet.id} className="flex items-center justify-between border border-border p-4">
                  <div>
                    <p className="font-heading font-semibold text-foreground">
                      {fleet.name}
                      {canSeeAll && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          by {isOwn ? "you" : (fleet.owner_display_name || "Unknown")}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Rev {fleet.revision} · {fleet.points_budget} pts</p>
                  </div>
                  <div className="flex gap-2">
                    {canEdit && <Button variant="ghost" size="sm" onClick={() => navigate(`/fleet-builder?edit=${fleet.id}`)}>Edit</Button>}
                    <Button variant="ghost" size="sm" onClick={() => duplicateFleet(fleet)}>Duplicate</Button>
                    {canEdit && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteFleet(fleet.id)}>Delete</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Dashboard;
