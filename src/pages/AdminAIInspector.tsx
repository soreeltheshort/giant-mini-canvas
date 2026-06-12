import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import AIInspector from "@/components/admin/ai/AIInspector";

export default function AdminAIInspector() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  if (loading)
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center text-muted-foreground">Loading...</div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-5xl py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-accent">AI Testing</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          The Inspector shows what each AI thought, planned, and did on past turns.
        </p>
        <AIInspector />
      </div>
    </div>
  );
}
