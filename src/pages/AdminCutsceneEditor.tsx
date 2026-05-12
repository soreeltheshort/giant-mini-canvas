import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import SoundPicker from "@/components/cutscene/SoundPicker";

interface Slide {
  id: string;
  cutscene_id: string;
  order_index: number;
  image_url: string | null;
  text: string;
  text_2: string;
  text_3: string;
  fade_in_ms: number;
  hold_ms: number;
  fade_out_ms: number;
  word_speed_ms: number;
  slug_delay_ms: number;
}

interface Cutscene {
  id: string;
  name: string;
  description: string;
  audio_url: string | null;
  audio_volume: number;
}

export default function AdminCutsceneEditor() {
  const { id } = useParams<{ id: string }>();
  const [cutscene, setCutscene] = useState<Cutscene | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewSlideId, setPreviewSlideId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    if (!id) return;
    const [{ data: cs }, { data: sl }] = await Promise.all([
      (supabase as any).from("cutscenes").select("*").eq("id", id).single(),
      (supabase as any).from("cutscene_slides").select("*").eq("cutscene_id", id).order("order_index"),
    ]);
    setCutscene(cs);
    setSlides(sl || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const updateCutscene = async (patch: Partial<Cutscene>) => {
    if (!cutscene) return;
    setCutscene({ ...cutscene, ...patch });
    await (supabase as any).from("cutscenes").update(patch).eq("id", cutscene.id);
  };

  const addSlide = async () => {
    if (!id) return;
    const nextIdx = slides.length;
    const { data, error } = await (supabase as any)
      .from("cutscene_slides")
      .insert({ cutscene_id: id, order_index: nextIdx })
      .select()
      .single();
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    setSlides([...slides, data]);
  };

  const updateSlide = async (slideId: string, patch: Partial<Slide>) => {
    setSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, ...patch } : s)));
    await (supabase as any).from("cutscene_slides").update(patch).eq("id", slideId);
  };

  const removeSlide = async (slideId: string) => {
    if (!confirm("Delete this slide?")) return;
    await (supabase as any).from("cutscene_slides").delete().eq("id", slideId);
    setSlides((prev) => prev.filter((s) => s.id !== slideId));
  };

  const moveSlide = async (slideId: string, dir: -1 | 1) => {
    const idx = slides.findIndex((s) => s.id === slideId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= slides.length) return;
    const a = slides[idx], b = slides[swap];
    const newSlides = [...slides];
    newSlides[idx] = { ...b, order_index: idx };
    newSlides[swap] = { ...a, order_index: swap };
    setSlides(newSlides);
    await Promise.all([
      (supabase as any).from("cutscene_slides").update({ order_index: idx }).eq("id", b.id),
      (supabase as any).from("cutscene_slides").update({ order_index: swap }).eq("id", a.id),
    ]);
  };

  const uploadImage = async (slideId: string, file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${id}/${slideId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("cutscene-images").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
    const { data: pub } = supabase.storage.from("cutscene-images").getPublicUrl(path);
    await updateSlide(slideId, { image_url: pub.publicUrl });
  };

  if (loading) return <div className="min-h-screen bg-background"><Header /><main className="container py-12"><p>Loading…</p></main></div>;
  if (!cutscene) return <div className="min-h-screen bg-background"><Header /><main className="container py-12"><p>Not found</p></main></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-10">
        <Link to="/admin/cutscenes" className="text-xs font-heading uppercase tracking-wider text-bronze-dark hover:text-foreground">
          ← All Cutscenes
        </Link>

        <div className="mt-4 flex items-end justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-[260px]">
            <Input
              value={cutscene.name}
              onChange={(e) => updateCutscene({ name: e.target.value })}
              className="text-2xl font-heading font-bold h-auto py-2"
            />
            <Textarea
              value={cutscene.description}
              onChange={(e) => updateCutscene({ description: e.target.value })}
              placeholder="Description"
              className="mt-2"
              rows={2}
            />
            <div className="mt-3">
              <SoundPicker
                value={cutscene.audio_url}
                volume={cutscene.audio_volume ?? 0.5}
                onChange={(url) => updateCutscene({ audio_url: url })}
                onVolumeChange={(v) => updateCutscene({ audio_volume: v })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/cutscenes/${cutscene.id}/play`}>
              <Button variant="outline" className="font-heading uppercase tracking-wider">▶ Preview Full</Button>
            </Link>
            <Button onClick={addSlide} className="bg-crimson hover:bg-crimson-light text-primary-foreground font-heading uppercase tracking-wider">
              + Add Slide
            </Button>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          {slides.length === 0 && <p className="text-sm text-muted-foreground">No slides yet — add one to begin.</p>}
          {slides.map((s, i) => (
            <SlideRow
              key={s.id}
              slide={s}
              index={i}
              total={slides.length}
              onPatch={(p) => updateSlide(s.id, p)}
              onUpload={(f) => uploadImage(s.id, f)}
              onRemove={() => removeSlide(s.id)}
              onMove={(d) => moveSlide(s.id, d)}
              previewing={previewSlideId === s.id}
              onPreviewToggle={() => setPreviewSlideId(previewSlideId === s.id ? null : s.id)}
            />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function SlideRow({
  slide, index, total, onPatch, onUpload, onRemove, onMove, previewing, onPreviewToggle,
}: {
  slide: Slide;
  index: number;
  total: number;
  onPatch: (p: Partial<Slide>) => void;
  onUpload: (f: File) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  previewing: boolean;
  onPreviewToggle: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border-2 border-bronze/40 bg-ivory rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-heading text-sm font-bold text-bronze-dark uppercase tracking-wider">Slide {index + 1}</div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={index === 0} onClick={() => onMove(-1)}>▲</Button>
          <Button size="sm" variant="outline" disabled={index === total - 1} onClick={() => onMove(1)}>▼</Button>
          <Button size="sm" variant="outline" onClick={onPreviewToggle}>{previewing ? "Stop" : "Preview"}</Button>
          <Button size="sm" variant="destructive" onClick={onRemove}>×</Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="aspect-video bg-muted border border-border rounded-sm overflow-hidden flex items-center justify-center">
            {slide.image_url ? (
              <img src={slide.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">No image</span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => fileRef.current?.click()}>
            {slide.image_url ? "Replace Image" : "Upload Image"}
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-heading uppercase tracking-wider text-bronze-dark">Text Slug 1</label>
            <Textarea value={slide.text} onChange={(e) => onPatch({ text: e.target.value })} rows={2} placeholder="First narration line…" />
          </div>
          <div>
            <label className="text-xs font-heading uppercase tracking-wider text-bronze-dark">Text Slug 2</label>
            <Textarea value={slide.text_2} onChange={(e) => onPatch({ text_2: e.target.value })} rows={2} placeholder="(optional)" />
          </div>
          <div>
            <label className="text-xs font-heading uppercase tracking-wider text-bronze-dark">Text Slug 3</label>
            <Textarea value={slide.text_3} onChange={(e) => onPatch({ text_3: e.target.value })} rows={2} placeholder="(optional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Fade In (ms)" value={slide.fade_in_ms} onChange={(v) => onPatch({ fade_in_ms: v })} />
            <NumField label="Total slide length (ms)" value={slide.hold_ms} onChange={(v) => onPatch({ hold_ms: v })} />
            <NumField label="Fade Out (ms)" value={slide.fade_out_ms} onChange={(v) => onPatch({ fade_out_ms: v })} />
            <NumField label="Word Speed (ms/word)" value={slide.word_speed_ms} onChange={(v) => onPatch({ word_speed_ms: v })} />
            <NumField label="Slug Delay (ms)" value={slide.slug_delay_ms} onChange={(v) => onPatch({ slug_delay_ms: v })} />
          </div>
        </div>
      </div>

      {previewing && (
        <div className="mt-5 border-t border-border pt-4">
          <SlidePreview slide={slide} />
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs font-heading uppercase tracking-wider text-bronze-dark">{label}</label>
      <Input type="number" min={0} value={value} onChange={(e) => onChange(parseInt(e.target.value || "0", 10))} />
    </div>
  );
}

import SlidePlayer from "@/components/cutscene/SlidePlayer";
function SlidePreview({ slide }: { slide: Slide }) {
  const [k, setK] = useState(0);
  return (
    <div>
      <div className="aspect-video bg-black rounded-sm overflow-hidden">
        <SlidePlayer key={k} slide={slide} onComplete={() => {}} />
      </div>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => setK(k + 1)}>↻ Replay</Button>
    </div>
  );
}
