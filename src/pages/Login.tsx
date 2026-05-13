import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="Sign In — MiniGiantGames"
        description="Sign in to your MiniGiantGames commander account to play Third Republic and access early playtests."
        path="/login"
      />
      <Header />
      <div className="container flex items-center justify-center py-20">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Sign In</h1>
            <p className="mt-1 text-sm text-muted-foreground">Welcome back, Commander.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link to="/signup" className="text-primary hover:underline">Create one free</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
