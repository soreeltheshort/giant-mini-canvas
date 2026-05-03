import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, X, Loader2 } from "lucide-react";

interface AiResponse {
  narration: string;
  result: string;
  options: string[];
  mechanicalEffects: {
    cindersChange: number;
    influenceChange: number;
    reputationChange: number;
    flags: string[];
  };
}

interface Props {
  playerId: string;
  turnNumber: number;
  gameContext: Record<string, unknown>;
}

export default function AiTestPanel({ playerId, turnNumber, gameContext }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AiResponse | null>(null);

  const send = async () => {
    if (!input.trim()) {
      setError("Please enter player input.");
      return;
    }
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ai-game-response", {
        body: { playerId, turnNumber, gameContext, playerInput: input },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setResponse(data as AiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-2 bg-crimson text-primary-foreground rounded-sm font-heading text-xs uppercase tracking-wider border border-crimson hover:bg-crimson-light shadow-lg"
      >
        <Sparkles className="w-4 h-4" /> AI Oracle
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-40 w-[380px] max-h-[70vh] flex flex-col bg-marble border-2 border-bronze/60 rounded-sm shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-ivory-dark/50">
        <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-bronze-dark">
          AI Oracle — Test Panel
        </h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your action, question, or intent..."
          className="min-h-[80px] text-sm"
          disabled={loading}
        />
        <Button onClick={send} disabled={loading} className="w-full" size="sm">
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Consulting…</>
          ) : (
            <>Send to Oracle</>
          )}
        </Button>

        <div className="text-[10px] text-muted-foreground">
          Turn {turnNumber} · Player {playerId.slice(0, 8)}…
        </div>

        {error && (
          <div className="p-2 border border-crimson/40 bg-crimson/10 text-crimson text-xs rounded-sm">
            {error}
          </div>
        )}

        {response && (
          <div className="space-y-2 text-xs">
            <Section title="Narration">{response.narration}</Section>
            <Section title="Result">{response.result}</Section>
            {response.options?.length > 0 && (
              <Section title="Options">
                <ul className="list-disc pl-4 space-y-0.5">
                  {response.options.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </Section>
            )}
            <Section title="Proposed Mechanical Effects">
              <div className="grid grid-cols-3 gap-1 mb-1">
                <Stat label="Cinders" value={response.mechanicalEffects?.cindersChange ?? 0} />
                <Stat label="Influence" value={response.mechanicalEffects?.influenceChange ?? 0} />
                <Stat label="Reputation" value={response.mechanicalEffects?.reputationChange ?? 0} />
              </div>
              {response.mechanicalEffects?.flags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {response.mechanicalEffects.flags.map((f, i) => (
                    <span key={i} className="px-1.5 py-0.5 border border-bronze/40 rounded-sm text-[10px]">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1 italic">
                Proposed only — not applied to game state.
              </p>
            </Section>
            <details className="text-[10px]">
              <summary className="cursor-pointer text-muted-foreground">Raw JSON</summary>
              <pre className="mt-1 p-2 bg-ivory-dark/60 border border-border rounded-sm overflow-x-auto">
                {JSON.stringify(response, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-sm p-2 bg-ivory">
      <div className="font-heading text-[10px] uppercase tracking-wider text-bronze-dark mb-1">{title}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const sign = value > 0 ? "+" : "";
  const color = value > 0 ? "text-emerald-700" : value < 0 ? "text-crimson" : "text-muted-foreground";
  return (
    <div className="text-center border border-border rounded-sm p-1">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-heading text-sm font-semibold ${color}`}>{sign}{value}</div>
    </div>
  );
}
