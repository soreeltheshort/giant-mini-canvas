import { useEffect, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Shield, ShieldOff, FlaskConical, FlaskConicalOff, LogIn, Mail, MailX,
  Plus, Trash2, ChevronDown, ChevronRight, Save, Search,
} from "lucide-react";

interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  last_seen_at: string | null;
  last_game_id: string | null;
  active_games: any;
  admin_notes: string;
  billing_plan: string;
  credits_balance: number;
  roles: string[];
}

interface GamePosition {
  game_id: string;
  game_name: string;
  status: string;
  turn_number: number;
  player_slot: number;
  faction_name: string | null;
  treasury: number;
  orders_locked: boolean;
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const AdminUsers = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/dashboard");
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (user && isAdmin) loadUsers();
  }, [user, isAdmin]);

  const loadUsers = async () => {
    setLoadingData(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, display_name, email, created_at, last_seen_at, last_game_id, active_games, admin_notes, billing_plan, credits_balance")
        .order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (!profiles) { setLoadingData(false); return; }

    const roleMap = new Map<string, string[]>();
    for (const r of (roles || [])) {
      const arr = roleMap.get(r.user_id) || [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    }

    setUsers(profiles.map((p: any) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      email: p.email ?? null,
      created_at: p.created_at,
      last_seen_at: p.last_seen_at ?? null,
      last_game_id: p.last_game_id ?? null,
      active_games: p.active_games ?? [],
      admin_notes: p.admin_notes ?? "",
      billing_plan: p.billing_plan ?? "free",
      credits_balance: p.credits_balance ?? 0,
      roles: roleMap.get(p.user_id) || [],
    })));
    setLoadingData(false);
  };

  const toggleRole = async (targetUserId: string, role: "admin" | "tester" | "opt_in", hasRole: boolean) => {
    if (targetUserId === user?.id && role === "admin" && hasRole) {
      toast({ title: "Cannot remove your own admin role", variant: "destructive" });
      return;
    }
    if (hasRole) {
      const { error } = await supabase.from("user_roles").delete()
        .eq("user_id", targetUserId).eq("role", role);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: `${role} role removed` });
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: targetUserId, role });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: `${role} role granted` });
    }
    await loadUsers();
  };

  const impersonate = async (targetUserId: string, displayName: string | null) => {
    if (targetUserId === user?.id) {
      toast({ title: "You're already logged in as yourself", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Log in as ${displayName || "this user"}? You will be signed out of your admin account.`)) return;

    try {
      const { data, error } = await supabase.functions.invoke("impersonate", { body: { target_user_id: targetUserId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      localStorage.setItem("impersonating_from_admin", user!.id);
      await supabase.auth.signOut();
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
      if (verifyError) throw verifyError;
      toast({ title: `Now logged in as ${displayName || data.email}` });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Impersonation failed", description: err.message, variant: "destructive" });
    }
  };

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (u.display_name || "").toLowerCase().includes(s) || (u.email || "").toLowerCase().includes(s);
  });

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-12">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <h1 className="font-heading text-2xl font-bold text-foreground">User Management</h1>
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {loadingData ? (
          <p className="text-muted-foreground text-sm">Loading users...</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-2 py-2 w-8" />
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Joined</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last seen</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Games</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Plan</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Credits</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Roles</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isOpen = expanded === u.user_id;
                  const isSelf = u.user_id === user?.id;
                  const activeCount = Array.isArray(u.active_games) ? u.active_games.length : 0;
                  return (
                    <Fragment key={u.user_id}>
                      <tr
                        className="border-b border-border hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : u.user_id)}
                      >
                        <td className="px-2 py-2 text-muted-foreground">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {u.display_name || <span className="text-muted-foreground italic">No name</span>}
                          {isSelf && <span className="ml-2 text-xs text-primary">(you)</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{u.email || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : "Never"}</td>
                        <td className="px-3 py-2 text-foreground">{activeCount}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs capitalize">{u.billing_plan}</td>
                        <td className="px-3 py-2 text-foreground">{u.credits_balance}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {u.roles.map((r) => (
                              <span key={r} className={`px-2 py-0.5 text-[10px] rounded ${
                                r === "admin" ? "bg-primary text-primary-foreground" :
                                r === "tester" ? "bg-accent text-accent-foreground" :
                                r === "opt_in" ? "bg-crimson/20 text-crimson-dark" :
                                "bg-muted text-muted-foreground"
                              }`}>{r}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={() => impersonate(u.user_id, u.display_name)}
                            >
                              <LogIn className="mr-1 h-3 w-3" /> Log in as
                            </Button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/10 border-b border-border">
                          <td colSpan={10} className="p-0">
                            <UserDetailPanel
                              row={u}
                              isSelf={isSelf}
                              onRoleToggle={toggleRole}
                              onImpersonate={() => impersonate(u.user_id, u.display_name)}
                              onChanged={loadUsers}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <NewsletterSubscribersPanel />
      </div>
      <Footer />
    </div>
  );
};

/* -------------------- Per-user detail panel -------------------- */

interface DetailProps {
  row: UserRow;
  isSelf: boolean;
  onRoleToggle: (uid: string, role: "admin" | "tester" | "opt_in", has: boolean) => void;
  onImpersonate: () => void;
  onChanged: () => void;
}

const UserDetailPanel = ({ row, isSelf, onRoleToggle, onImpersonate, onChanged }: DetailProps) => {
  const [games, setGames] = useState<GamePosition[] | null>(null);
  const [notes, setNotes] = useState(row.admin_notes);
  const [plan, setPlan] = useState(row.billing_plan);
  const [credits, setCredits] = useState(String(row.credits_balance));
  const [saving, setSaving] = useState(false);

  const hasAdmin = row.roles.includes("admin");
  const hasTester = row.roles.includes("tester");
  const hasOptIn = row.roles.includes("opt_in");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("game_players")
        .select("player_slot, treasury, orders_locked, faction_id, factions(name), games!inner(id, name, status, turn_number)")
        .eq("user_id", row.user_id);
      if (cancelled) return;
      const rows: GamePosition[] = (data || []).map((r: any) => ({
        game_id: r.games?.id,
        game_name: r.games?.name ?? "—",
        status: r.games?.status ?? "—",
        turn_number: r.games?.turn_number ?? 0,
        player_slot: r.player_slot,
        faction_name: r.factions?.name ?? null,
        treasury: r.treasury ?? 0,
        orders_locked: !!r.orders_locked,
      }));
      setGames(rows);
    })();
    return () => { cancelled = true; };
  }, [row.user_id]);

  const saveProfile = async () => {
    setSaving(true);
    const c = parseInt(credits, 10);
    const { error } = await supabase
      .from("profiles")
      .update({
        admin_notes: notes,
        billing_plan: plan.trim() || "free",
        credits_balance: Number.isFinite(c) ? c : 0,
      })
      .eq("user_id", row.user_id);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Profile updated" });
    onChanged();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
      {/* Engagement */}
      <section className="border border-border rounded p-3 bg-background">
        <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground mb-2">Engagement</h3>
        <dl className="text-xs space-y-1 text-foreground">
          <div className="flex justify-between"><dt className="text-muted-foreground">Joined</dt><dd>{fmtDate(row.created_at)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Last seen</dt><dd>{row.last_seen_at ? fmtDate(row.last_seen_at) : "Never"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Active games</dt><dd>{Array.isArray(row.active_games) ? row.active_games.length : 0}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Last game</dt><dd className="font-mono text-[10px]">{row.last_game_id ? row.last_game_id.slice(0, 8) + "…" : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-[10px]">{row.user_id.slice(0, 8)}…</dd></div>
        </dl>

        <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
          <Button size="sm" variant={hasAdmin ? "outline" : "default"} className="text-xs h-7"
            disabled={isSelf && hasAdmin}
            onClick={() => onRoleToggle(row.user_id, "admin", hasAdmin)}>
            {hasAdmin ? <><ShieldOff className="mr-1 h-3 w-3" />Remove Admin</> : <><Shield className="mr-1 h-3 w-3" />Make Admin</>}
          </Button>
          <Button size="sm" variant={hasTester ? "outline" : "secondary"} className="text-xs h-7"
            onClick={() => onRoleToggle(row.user_id, "tester", hasTester)}>
            {hasTester ? <><FlaskConicalOff className="mr-1 h-3 w-3" />Remove Tester</> : <><FlaskConical className="mr-1 h-3 w-3" />Make Tester</>}
          </Button>
          <Button size="sm" variant={hasOptIn ? "outline" : "secondary"} className="text-xs h-7"
            onClick={() => onRoleToggle(row.user_id, "opt_in", hasOptIn)}>
            {hasOptIn ? <><MailX className="mr-1 h-3 w-3" />Opt Out</> : <><Mail className="mr-1 h-3 w-3" />Opt In</>}
          </Button>
          {!isSelf && (
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={onImpersonate}>
              <LogIn className="mr-1 h-3 w-3" /> Log in as
            </Button>
          )}
        </div>
      </section>

      {/* Games & positions */}
      <section className="border border-border rounded p-3 bg-background lg:col-span-1">
        <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground mb-2">Games & Positions</h3>
        {games === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : games.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Not a player in any game.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {games.map((g) => (
              <div key={g.game_id} className="text-xs border border-border rounded px-2 py-1.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground truncate">{g.game_name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                    g.status === "active" ? "bg-accent text-accent-foreground" :
                    g.status === "completed" ? "bg-muted text-muted-foreground" :
                    "bg-muted/60 text-muted-foreground"
                  }`}>{g.status}</span>
                </div>
                <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                  <span>Slot {g.player_slot}</span>
                  {g.faction_name && <span>{g.faction_name}</span>}
                  <span>Turn {g.turn_number}</span>
                  <span>₡{g.treasury}</span>
                  {g.orders_locked && <span className="text-crimson">Orders locked</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Billing + credits + notes */}
      <section className="border border-border rounded p-3 bg-background space-y-3">
        <div>
          <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground mb-2">Billing & Credits</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan</label>
              <Input value={plan} onChange={(e) => setPlan(e.target.value)} className="h-8 text-xs" placeholder="free" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits</label>
              <Input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 italic">Stub fields — wire to real billing provider when ready.</p>
        </div>

        <div>
          <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground mb-2">Admin Notes</h3>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="text-xs"
            placeholder="Internal notes only visible to admins…"
          />
        </div>

        <Button size="sm" onClick={saveProfile} disabled={saving} className="w-full">
          <Save className="mr-1 h-3 w-3" /> {saving ? "Saving…" : "Save changes"}
        </Button>
      </section>
    </div>
  );
};

/* -------------------- Newsletter subscribers (unchanged) -------------------- */

interface Subscriber { id: string; email: string; source: string; created_at: string; }

const NewsletterSubscribersPanel = () => {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("newsletter_subscribers")
      .select("id, email, source, created_at")
      .order("created_at", { ascending: false });
    setSubs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { error } = await (supabase as any)
      .from("newsletter_subscribers")
      .insert({ email: trimmed, source: "admin" });
    setAdding(false);
    if (error) {
      if (/duplicate key/i.test(error.message)) toast({ title: "Already subscribed", variant: "destructive" });
      else toast({ title: "Failed to add", description: error.message, variant: "destructive" });
      return;
    }
    setNewEmail("");
    toast({ title: "Subscriber added" });
    load();
  };

  const remove = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from the dispatch list?`)) return;
    const { error } = await (supabase as any).from("newsletter_subscribers").delete().eq("id", id);
    if (error) { toast({ title: "Failed to remove", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removed" });
    load();
  };

  return (
    <div className="mt-12">
      <h2 className="font-heading text-xl font-bold text-foreground mb-4">
        Newsletter Subscribers <span className="text-muted-foreground text-sm font-normal">(emails without accounts)</span>
      </h2>
      <form onSubmit={add} className="flex gap-2 mb-4 max-w-md">
        <Input type="email" placeholder="email@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <Button type="submit" disabled={adding} size="sm">
          <Plus className="w-4 h-4 mr-1" /> {adding ? "Adding…" : "Add"}
        </Button>
      </form>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : subs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No subscribers yet.</p>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Subscribed</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-b border-border">
                  <td className="px-4 py-2 text-foreground">{s.email}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{s.source}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => remove(s.id, s.email)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
