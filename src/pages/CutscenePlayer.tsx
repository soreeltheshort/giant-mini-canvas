import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SlidePlayer, { SlideLike } from "@/components/cutscene/SlidePlayer";
import { Button } from "@/components/ui/button";

interface Slide extends SlideLike {
  id: string;
  order_index: number;
}

export default function CutscenePlayer() {
  const { id } = useParams<{ id: string }>();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState<number>(0.5);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [done, setDone] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/";
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [{ data: cs }, { data }] = await Promise.all([
        (supabase as any).from("cutscenes").select("audio_url, audio_volume").eq("id", id).single(),
        (supabase as any)
          .from("cutscene_slides")
          .select("id, order_index, image_url, text, text_2, text_3, fade_in_ms, hold_ms, fade_out_ms, word_speed_ms, slug_delay_ms")
          .eq("cutscene_id", id)
          .order("order_index"),
      ]);
      setAudioUrl(cs?.audio_url ?? null);
      setAudioVolume(cs?.audio_volume ?? 0.5);
      setSlides(data || []);
      setLoading(false);
    })();
  }, [id]);

  // Preload audio; gate slides until it can play through (or fallback timeout).
  useEffect(() => {
    if (loading) return;
    if (!audioUrl) {
      setAudioReady(true);
      return;
    }
    const a = new Audio();
    a.loop = true;
    a.volume = audioVolume;
    a.preload = "auto";
    a.src = audioUrl;
    audioRef.current = a;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      a.play()
        .then(() => setAudioReady(true))
        .catch(() => {
          setAudioReady(true);
          const resume = () => { a.play().catch(() => {}); };
          window.addEventListener("pointerdown", resume, { once: true });
          window.addEventListener("keydown", resume, { once: true });
        });
    };

    a.addEventListener("canplaythrough", start, { once: true });
    a.addEventListener("error", () => setAudioReady(true), { once: true });
    const fallback = window.setTimeout(start, 4000);
    a.load();

    return () => {
      window.clearTimeout(fallback);
      a.pause();
      a.src = "";
      audioRef.current = null;
    };
  }, [audioUrl, loading]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = audioVolume;
  }, [audioVolume]);

  const skip = () => navigate(next);

  if (loading || !audioReady) return <div className="min-h-screen bg-black" />;
  if (slides.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-ivory">
        <div className="text-center">
          <p>No slides in this cutscene.</p>
          <Button className="mt-4" onClick={skip}>Continue →</Button>
        </div>
      </div>
    );
  }

  const current = slides[idx];

  return (
    <div className="fixed inset-0 bg-black z-50">
      <SlidePlayer
        key={current.id}
        slide={current}
        onComplete={() => {
          if (idx < slides.length - 1) {
            setIdx(idx + 1);
          } else if (!done) {
            setDone(true);
            navigate(next);
          }
        }}
      />
      <button
        onClick={skip}
        className="absolute top-4 right-4 text-xs font-heading uppercase tracking-wider text-ivory/70 hover:text-ivory border border-ivory/30 hover:border-ivory/60 px-3 py-1.5 rounded-sm bg-black/40 backdrop-blur"
      >
        Skip →
      </button>
    </div>
  );
}
