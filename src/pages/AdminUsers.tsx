import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Shield, ShieldOff, FlaskConical, FlaskConicalOff, LogIn, Mail, MailX, Plus, Trash2 } from "lucide-react";

interface UserWithRole {
  user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  roles: string[];
}

const AdminUsers = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/dashboard");
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (user && isAdmin) loadUsers();
  }, [user, isAdmin]);

  const loadUsers = async () => {
    setLoadingData(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, email, created_at").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (!profiles) { setLoadingData(false); return; }

    const roleMap = new Map<string, string[]>();
    for (const r of (roles || [])) {
      const arr = roleMap.get(r.user_id) || [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    }

    setUsers(profiles.map(p => ({
      user_id: p.user_id,
      display_name: p.display_name,
      email: (p as any).email ?? null,
      created_at: p.created_at,
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
      toast({ title: `${role.charAt(0).toUpperCase() + role.slice(1)} role removed` });
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: targetUserId, role });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: `${role.charAt(0).toUpperCase() + role.slice(1)} role granted` });
    }
    await loadUsers();
  };

  const impersonate = async (targetUserId: string, displayName: string | null) => {
    if (targetUserId === user?.id) {
      toast({ title: "You're already logged in as yourself", variant: "destructive" });
      return;
    }

    const confirmed = window.confirm(`Log in as ${displayName || "this user"}? You will be signed out of your admin account.`);
    if (!confirmed) return;

    try {
      const { data, error } = await supabase.functions.invoke("impersonate", {
        body: { target_user_id: targetUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Store admin user ID for switch-back
      localStorage.setItem("impersonating_from_admin", user!.id);

      // Sign out current session first
      await supabase.auth.signOut();

      // Verify the magic link token to create a session
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });

      if (verifyError) throw verifyError;

      toast({ title: `Now logged in as ${displayName || data.email}` });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Impersonation failed", description: err.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="container py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-16">
        <h1 className="font-heading text-2xl font-bold text-foreground mb-6">User Management (Admin)</h1>

        {loadingData ? (
          <p className="text-muted-foreground text-sm">Loading users...</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Display Name</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">User ID</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Joined</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Roles</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const hasAdmin = u.roles.includes("admin");
                  const hasTester = u.roles.includes("tester");
                  const hasOptIn = u.roles.includes("opt_in");
                  const isSelf = u.user_id === user?.id;
                  return (
                    <tr key={u.user_id} className="border-b border-border">
                      <td className="px-4 py-2 text-foreground">
                        {u.display_name || <span className="text-muted-foreground italic">No name</span>}
                        {isSelf && <span className="ml-2 text-xs text-primary">(you)</span>}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{u.email || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs font-mono">{u.user_id.slice(0, 8)}…</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {u.roles.map(r => (
                            <span key={r} className={`px-2 py-0.5 text-xs rounded ${
                              r === "admin" ? "bg-primary text-primary-foreground" :
                              r === "tester" ? "bg-accent text-accent-foreground" :
                              r === "opt_in" ? "bg-crimson/20 text-crimson-dark" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant={hasAdmin ? "outline" : "default"}
                            className="text-xs"
                            disabled={isSelf && hasAdmin}
                            onClick={() => toggleRole(u.user_id, "admin", hasAdmin)}
                          >
                            {hasAdmin ? (<><ShieldOff className="mr-1 h-3 w-3" /> Remove Admin</>) : (<><Shield className="mr-1 h-3 w-3" /> Make Admin</>)}
                          </Button>
                          <Button
                            size="sm"
                            variant={hasTester ? "outline" : "secondary"}
                            className="text-xs"
                            onClick={() => toggleRole(u.user_id, "tester", hasTester)}
                          >
                            {hasTester ? (<><FlaskConicalOff className="mr-1 h-3 w-3" /> Remove Tester</>) : (<><FlaskConical className="mr-1 h-3 w-3" /> Make Tester</>)}
                          </Button>
                          <Button
                            size="sm"
                            variant={hasOptIn ? "outline" : "secondary"}
                            className="text-xs"
                            onClick={() => toggleRole(u.user_id, "opt_in", hasOptIn)}
                          >
                            {hasOptIn ? (<><MailX className="mr-1 h-3 w-3" /> Opt Out</>) : (<><Mail className="mr-1 h-3 w-3" /> Opt In</>)}
                          </Button>
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={() => impersonate(u.user_id, u.display_name)}
                            >
                              <LogIn className="mr-1 h-3 w-3" /> Log in as
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
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

interface Subscriber {
  id: string;
  email: string;
  source: string;
  created_at: string;
}

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
      if (/duplicate key/i.test(error.message)) {
        toast({ title: "Already subscribed", variant: "destructive" });
      } else {
        toast({ title: "Failed to add", description: error.message, variant: "destructive" });
      }
      return;
    }
    setNewEmail("");
    toast({ title: "Subscriber added" });
    load();
  };

  const remove = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from the dispatch list?`)) return;
    const { error } = await (supabase as any).from("newsletter_subscribers").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed" });
    load();
  };

  return (
    <div className="mt-12">
      <h2 className="font-heading text-xl font-bold text-foreground mb-4">
        Newsletter Subscribers <span className="text-muted-foreground text-sm font-normal">(emails without accounts)</span>
      </h2>
      <form onSubmit={add} className="flex gap-2 mb-4 max-w-md">
        <Input
          type="email"
          placeholder="email@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
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
