import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/games", label: "Games" },
    { to: "/manual", label: "Manual" },
  ];

  const handleNewsletter = () => {
    if (location.pathname === "/") {
      document.getElementById("newsletter")?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/#newsletter");
    }
  };

  return (
    <header className="border-b border-border">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="font-heading text-lg font-semibold tracking-tight text-foreground">
          MiniGiantGames
        </Link>
        <nav className="flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                location.pathname === link.to ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <Link to="/dashboard" className={`text-sm font-medium transition-colors hover:text-foreground ${location.pathname.startsWith("/dashboard") ? "text-foreground" : "text-muted-foreground"}`}>
              Dashboard
            </Link>
          )}
          {user && isAdmin && (
            <>
              <Link to="/admin/battle-debug" className="text-sm font-medium text-gold transition-colors hover:text-foreground">
                Debug
              </Link>
              <Link to="/admin/weapons" className="text-sm font-medium text-gold transition-colors hover:text-foreground">
                Weapons
              </Link>
              <Link to="/admin/battle-config" className="text-sm font-medium text-gold transition-colors hover:text-foreground">
                Config
              </Link>
              <Link to="/admin/users" className="text-sm font-medium text-gold transition-colors hover:text-foreground">
                Users
              </Link>
            </>
          )}
          <button
            onClick={handleNewsletter}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Newsletter
          </button>
          {user ? (
            <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate("/"); }}>
              Sign Out
            </Button>
          ) : (
            <Link to="/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
