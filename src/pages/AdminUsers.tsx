import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Shield, ShieldOff } from "lucide-react";

interface UserWithRole {
  user_id: string;
  display_name: string | null;
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

    // Load all profiles and all roles
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, created_at").order("created_at"),
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
      created_at: p.created_at,
      roles: roleMap.get(p.user_id) || [],
    })));

    setLoadingData(false);
  };

  const toggleAdmin = async (targetUserId: string, currentlyAdmin: boolean) => {
    if (targetUserId === user?.id && currentlyAdmin) {
      toast({ title: "Cannot remove your own admin role", variant: "destructive" });
      return;
    }

    if (currentlyAdmin) {
      const { error } = await supabase.from("user_roles").delete()
        .eq("user_id", targetUserId).eq("role", "admin");
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Admin role removed" });
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: targetUserId, role: "admin" });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Admin role granted" });
    }

    await loadUsers();
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
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">User ID</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Joined</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Roles</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isAdminUser = u.roles.includes("admin");
                  const isSelf = u.user_id === user?.id;
                  return (
                    <tr key={u.user_id} className="border-b border-border">
                      <td className="px-4 py-2 text-foreground">
                        {u.display_name || <span className="text-muted-foreground italic">No name</span>}
                        {isSelf && <span className="ml-2 text-xs text-primary">(you)</span>}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs font-mono">{u.user_id.slice(0, 8)}…</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          {u.roles.map(r => (
                            <span key={r} className={`px-2 py-0.5 text-xs rounded ${r === "admin" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          size="sm"
                          variant={isAdminUser ? "outline" : "default"}
                          className="text-xs"
                          disabled={isSelf && isAdminUser}
                          onClick={() => toggleAdmin(u.user_id, isAdminUser)}
                        >
                          {isAdminUser ? (
                            <><ShieldOff className="mr-1 h-3 w-3" /> Remove Admin</>
                          ) : (
                            <><Shield className="mr-1 h-3 w-3" /> Make Admin</>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default AdminUsers;
