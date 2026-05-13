import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { games } from "@/games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/mini-giant-games-logo.png";

const Index = () => {
  const inDev = games.find((g) => g.inDevelopment) ?? games[0];
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleEnterGame = async (e: React.MouseEvent) => {
    if (!user) return; // let the Link navigate to game detail
    e.preventDefault();
    const { data } = await (supabase as any)
      .from("cutscenes")
      .select("id")
      .eq("name", "GameIntro")
      .maybeSingle();
    if (data?.id) {
      navigate(`/cutscenes/${data.id}/play?next=/new-game`);
    } else {
      navigate("/new-game");
    }
  };
  const enterGameTo = user ? "#" : `/games/${inDev.id}`;

  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="Mini Giant Games — Strategy & Simulation Game Studio"
        description="Independent studio building deep, replayable strategy and simulation games."
        path="/"
      />
      <Header />
      <main>
        {/* Studio mark */}
        <section>
          <div className="container py-16 flex justify-center">
            <img
              src={logo}
              alt="Mini Giant Games"
              className="w-full max-w-md h-auto rounded-sm shadow-[0_8px_30px_-12px_hsl(var(--bronze)/0.5)]"
            />
          </div>
        </section>

        {/* Now in Development */}
        {inDev && (
          <section className="border-t-2 border-bronze/40">
            <div className="container py-16">
              <div className="flex items-baseline justify-between flex-wrap gap-3">
                <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
                  Now in Development
                </p>
                <Link
                  to="/games"
                  className="text-xs font-heading font-semibold uppercase tracking-wider text-crimson hover:text-crimson-light"
                >
                  All Games →
                </Link>
              </div>

              <Link
                to={enterGameTo}
                onClick={handleEnterGame}
                className="mt-6 group grid gap-8 md:grid-cols-[3fr_2fr] items-center border-2 border-bronze/40 bg-ivory rounded-sm overflow-hidden hover:border-bronze transition-colors shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)]"
              >
                <div className="aspect-video overflow-hidden bg-muted">
                  <img
                    src={inDev.image}
                    alt={inDev.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="p-6 md:p-8">
                  <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground group-hover:text-crimson transition-colors tracking-tight text-slate-500">
                    {inDev.title}
                  </h2>
                  <div className="mt-3 h-px w-16 bg-gradient-to-r from-bronze via-crimson to-transparent" />
                  {inDev.pitch && (
                    <p className="mt-4 text-sm md:text-base leading-relaxed text-muted-foreground line-clamp-5">
                      {inDev.pitch}
                    </p>
                  )}
                  <span className="mt-6 inline-block text-xs font-heading font-semibold uppercase tracking-wider text-crimson">
                    Enter Game →
                  </span>
                </div>
              </Link>
            </div>
          </section>
        )}

        {/* Engagement CTAs */}
        <section className="border-t-2 border-bronze/40">
          <div className="container py-16">
            <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
              Get Involved
            </p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <SignupCard
                kind="forum"
                title="Join the Forum"
                description="Be first in line when our community forum opens. We'll email you the invite."
                cta="Notify Me"
                successMessage="You're on the forum list."
              />
              <SignupCard
                kind="beta"
                title="Beta Tester Signup"
                description="Help shape our games. Get early builds and a direct line to the design team."
                cta="Apply"
                successMessage="Thanks — we'll be in touch with playtest invites."
              />
              <ContactCard />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

// ============================================================================
// Forum opt-in / Beta tester opt-in card (shared)
// ============================================================================

const optInSchema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email." }).max(255),
});

interface SignupCardProps {
  kind: "forum" | "beta";
  title: string;
  description: string;
  cta: string;
  successMessage: string;
}

function SignupCard({ kind, title, description, cta, successMessage }: SignupCardProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = optInSchema.safeParse({ email });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any)
      .from("studio_signups")
      .insert({ kind, email: parsed.data.email.toLowerCase() });
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not submit", description: error.message, variant: "destructive" });
      return;
    }
    setEmail("");
    toast({ title: successMessage });
  };

  return (
    <div className="flex flex-col border-2 border-bronze/40 bg-ivory p-6 rounded-sm shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)]">
      <h3 className="font-heading text-xl font-bold text-foreground tracking-tight text-slate-500">{title}</h3>
      <div className="mt-3 h-px w-12 bg-gradient-to-r from-bronze via-crimson to-transparent" />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground flex-1">{description}</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-background"
        />
        <Button type="submit" disabled={submitting} className="font-heading uppercase tracking-wider">
          {submitting ? "Submitting…" : cta + " →"}
        </Button>
      </form>
    </div>
  );
}

// ============================================================================
// Send a message to the team
// ============================================================================

const messageSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }).max(100),
  email: z.string().trim().email({ message: "Enter a valid email." }).max(255),
  message: z.string().trim().min(1, { message: "Message is required." }).max(2000),
});

function ContactCard() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = messageSchema.safeParse({ name, email, message });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any)
      .from("studio_signups")
      .insert({
        kind: "message",
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        message: parsed.data.message,
      });
    setSubmitting(false);
    if (error) {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
      return;
    }
    setName("");
    setEmail("");
    setMessage("");
    toast({ title: "Message sent. We'll reply soon." });
  };

  return (
    <div className="flex flex-col border-2 border-bronze/40 bg-ivory p-6 rounded-sm shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)]">
      <h3 className="font-heading text-xl font-bold text-foreground tracking-tight text-slate-500">Message the Team</h3>
      <div className="mt-3 h-px w-12 bg-gradient-to-r from-bronze via-crimson to-transparent" />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Questions, feedback, or partnership inquiries — we read every message.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <Input
          type="text"
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="bg-background"
        />
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
          className="bg-background"
        />
        <Textarea
          required
          placeholder="Your message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={4}
          className="bg-background resize-none"
        />
        <Button type="submit" disabled={submitting} className="font-heading uppercase tracking-wider">
          {submitting ? "Sending…" : "Send →"}
        </Button>
      </form>
    </div>
  );
}

export default Index;
