import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isTester, isOptIn, refreshRoles, signOut } = useAuth();
  const { toast } = useToast();
  const [switchingBack, setSwitchingBack] = useState(false);
  const [togglingOptIn, setTogglingOptIn] = useState(false);

  const impersonatingFromAdmin = localStorage.getItem("impersonating_from_admin");
  const isImpersonating = !!impersonatingFromAdmin && user && impersonatingFromAdmin !== user.id;

  const canAccessGameFeatures = isAdmin || isTester;
  const isCombatTestingMode = location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/fleet-builder") || location.pathname.startsWith("/battle") || location.pathname.startsWith("/admin/battle") || location.pathname.startsWith("/admin/weapons") || location.pathname.startsWith("/admin/ships");
  const isMapTestingMode = location.pathname.startsWith("/map-testing");
  const isPlanetTestingMode = location.pathname.startsWith("/planet-testing");
  
  const isGameMode = location.pathname.startsWith("/admin/games");
  const isForumActive = location.pathname.startsWith("/blog") || location.pathname === "/admin/blog" || location.pathname === "/unsubscribe";

  // Studio mode = Mini Giant Games marketing surface (home, about, public games index/detail).
  // Renders a simplified nav: Games, About Us, Sign In/Out only.
  const isStudioMode =
    !isAdmin && (
      location.pathname === "/" ||
      location.pathname === "/about" ||
      location.pathname === "/games" ||
      location.pathname.startsWith("/games/")
    );

  const toggleOptIn = async () => {
    if (!user) return;
    setTogglingOptIn(true);
    try {
      if (isOptIn) {
        await supabase.from("user_roles").delete().eq("user_id", user.id).eq("role", "opt_in");
        toast({ title: "Unsubscribed from communications" });
      } else {
        await supabase.from("user_roles").insert({ user_id: user.id, role: "opt_in" });
        toast({ title: "Subscribed to communications" });
      }
      await refreshRoles();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setTogglingOptIn(false);
    }
  };

  const switchBackToAdmin = async () => {
    if (!impersonatingFromAdmin) return;
    setSwitchingBack(true);
    try {
      const { data, error } = await supabase.functions.invoke("impersonate", {
        body: { return_to_admin_id: impersonatingFromAdmin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      localStorage.removeItem("impersonating_from_admin");
      await supabase.auth.signOut();

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });
      if (verifyError) throw verifyError;

      toast({ title: "Switched back to admin account" });
      navigate("/admin/users");
    } catch (err: any) {
      toast({ title: "Switch back failed", description: err.message, variant: "destructive" });
      setSwitchingBack(false);
    }
  };

  return (
    <>
      {isImpersonating && (
        <div className="bg-yellow-600 text-black text-center text-sm py-2 px-4 flex items-center justify-center gap-3">
          <span className="font-medium">
            ⚠ Impersonating: {user?.user_metadata?.display_name || user?.email}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs bg-black/10 border-black/30 text-black hover:bg-black/20"
            disabled={switchingBack}
            onClick={switchBackToAdmin}
          >
            {switchingBack ? "Switching..." : "Switch back to Admin"}
          </Button>
        </div>
      )}
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="font-heading text-lg font-semibold tracking-tight text-foreground">
            {isStudioMode ? "Mini Giant Games" : "Third Republic"}
          </Link>
          <nav className="flex items-center gap-6">
            {isStudioMode ? (
              <>
                <Link
                  to="/games"
                  className={`text-sm font-medium transition-colors hover:text-foreground ${location.pathname === "/games" || location.pathname.startsWith("/games/") ? "text-foreground" : "text-muted-foreground"}`}
                >
                  Games
                </Link>
                <Link
                  to="/about"
                  className={`text-sm font-medium transition-colors hover:text-foreground ${location.pathname === "/about" ? "text-foreground" : "text-muted-foreground"}`}
                >
                  About Us
                </Link>
                {user ? (
                  <Button variant="ghost" size="sm" onClick={() => {
                    localStorage.removeItem("impersonating_from_admin");
                    signOut();
                    navigate("/");
                  }}>
                    Sign Out
                  </Button>
                ) : (
                  <Link to="/login">
                    <Button variant="outline" size="sm">Log In</Button>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link
                  to="/"
                  className={`text-sm font-medium transition-colors hover:text-foreground ${location.pathname === "/" ? "text-foreground" : "text-muted-foreground"}`}
                >
                  Home
                </Link>
                {user && canAccessGameFeatures && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className={`flex items-center gap-1 text-sm font-medium transition-colors hover:text-foreground ${isCombatTestingMode || isMapTestingMode || isPlanetTestingMode ? "text-foreground" : "text-muted-foreground"}`}>
                      Testing
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-background z-50">
                      <DropdownMenuItem asChild>
                        <Link to="/dashboard">Combat Testing</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/map-testing">Map Testing</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/map-testing/config">Map Testing Config</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/planet-testing">Planet Testing</Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {user && isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className={`flex items-center gap-1 text-sm font-medium text-gold transition-colors hover:text-foreground ${location.pathname === "/admin/weapons" || location.pathname === "/admin/ships" || location.pathname === "/admin/battle-config" ? "text-foreground" : ""}`}>
                      Assets
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-background z-50">
                      <DropdownMenuItem asChild>
                        <Link to="/admin/battle-debug">Debug</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/weapons">Weapons</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/ships">Ships</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/facilities">Facilities</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/cutscenes">Cutscenes</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/images">Images</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/sounds">Sounds</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/battle-config">Battle Config</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/map-config">Map Config</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/admin/ai-config">AI Config</Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {user && isAdmin && (
                  <Link to="/admin/games" className={`text-sm font-medium text-gold transition-colors hover:text-foreground ${location.pathname.startsWith("/admin/games") ? "text-foreground" : ""}`}>
                    Games
                  </Link>
                )}
                {user && canAccessGameFeatures && (
                  <Link to="/tester" className={`text-sm font-medium text-gold transition-colors hover:text-foreground ${location.pathname.startsWith("/tester") ? "text-foreground" : ""}`}>
                    Tester
                  </Link>
                )}
                {user && isAdmin && (
                  <Link to="/admin/users" className={`text-sm font-medium text-gold transition-colors hover:text-foreground ${location.pathname === "/admin/users" ? "text-foreground" : ""}`}>
                    Users
                  </Link>
                )}
                {user && canAccessGameFeatures && (
                  <Link to="/manual" className={`text-sm font-medium transition-colors hover:text-foreground ${location.pathname === "/manual" ? "text-foreground" : "text-muted-foreground"}`}>
                    Manual
                  </Link>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger className={`flex items-center gap-1 text-sm font-medium transition-colors hover:text-foreground ${isForumActive ? "text-foreground" : "text-muted-foreground"}`}>
                    Forum
                    <ChevronDown className="h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-background z-50">
                    <DropdownMenuItem asChild>
                      <Link to="/blog">Blog</Link>
                    </DropdownMenuItem>
                    {user && isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin/blog">Manage Blog</Link>
                      </DropdownMenuItem>
                    )}
                    {user && (
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleOptIn(); }} disabled={togglingOptIn}>
                        {isOptIn ? "Unsubscribe from dispatches" : "Subscribe to dispatches"}
                      </DropdownMenuItem>
                    )}
                    {!user && (
                      <DropdownMenuItem asChild>
                        <Link to="/unsubscribe">Unsubscribe</Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {user ? (
                  <Button variant="ghost" size="sm" onClick={() => {
                    localStorage.removeItem("impersonating_from_admin");
                    signOut();
                    navigate("/");
                  }}>
                    Sign Out
                  </Button>
                ) : (
                  <Link to="/login">
                    <Button variant="outline" size="sm">Sign In</Button>
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
    </>
  );
};

export default Header;
