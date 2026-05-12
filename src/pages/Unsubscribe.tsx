import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    document.title = "Unsubscribe — Third Republic";
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setStatus("loading");
    const { data, error } = await supabase.functions.invoke("email-unsubscribe", { body: { email } });
    if (error || (data as any)?.error) {
      setStatus("error");
      setErrorMsg(error?.message || (data as any)?.error || "Failed to unsubscribe");
    } else {
      setStatus("done");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="container py-20 flex-1">
        <div className="max-w-md mx-auto border-2 border-bronze/40 bg-ivory rounded-sm p-8 shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)]">
          <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">Communications</p>
          <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">Unsubscribe</h1>

          {status === "done" ? (
            <p className="mt-6 text-sm text-foreground">
              <strong>{email}</strong> has been removed from Third Republic communications.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                Enter your email address to stop receiving dispatches from the Republic.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-3">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Button type="submit" disabled={status === "loading"} className="bg-crimson text-primary-foreground hover:bg-crimson-light font-heading uppercase tracking-wider">
                  {status === "loading" ? "Unsubscribing…" : "Unsubscribe"}
                </Button>
                {status === "error" && <p className="text-xs text-destructive">{errorMsg}</p>}
              </form>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Unsubscribe;
