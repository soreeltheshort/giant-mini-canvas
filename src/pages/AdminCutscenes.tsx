import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Cutscene {
  id: string;
  name: string;
  description: string;
  updated_at: string;
}

export default function AdminCutscenes() {
  const [items, setItems] = useState<Cutscene[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("cutscenes")
      .select("id, name, description, updated_at")
      .order("updated_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await (supabase as any)
      .from("cutscenes")
      .insert({ name: name.trim(), created_by: u.user.id })
      .select()
      .single();
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    setName("");
    navigate(`/admin/cutscenes/${data.id}`);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this cutscene?")) return;
    await (supabase as any).from("cutscenes").delete().eq("id", id);
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-12">
        <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">Assets</p>
        <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">Cutscenes</h1>
        <p className="mt-2 text-sm text-muted-foreground">Build narrative cutscenes with timed images and word-by-word text reveals.</p>

        <div className="mt-8 flex gap-3 max-w-md">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New cutscene name" />
          <Button onClick={create} className="bg-crimson hover:bg-crimson-light text-primary-foreground font-heading uppercase tracking-wider">
            Create
          </Button>
        </div>

        <div className="mt-10">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cutscenes yet.</p>
          ) : (
            <div className="grid gap-3 max-w-3xl">
              {items.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-2 border-bronze/40 bg-ivory rounded-sm p-4 hover:border-bronze transition-colors">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-foreground">{c.name}</h2>
                    <p className="text-xs text-muted-foreground">Updated {new Date(c.updated_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/cutscenes/${c.id}/play`}>
                      <Button size="sm" variant="outline" className="font-heading uppercase tracking-wider text-xs">Preview</Button>
                    </Link>
                    <Link to={`/admin/cutscenes/${c.id}`}>
                      <Button size="sm" className="font-heading uppercase tracking-wider text-xs">Edit</Button>
                    </Link>
                    <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
