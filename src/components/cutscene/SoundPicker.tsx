import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Play, Pause, X } from "lucide-react";

export default function SoundPicker({
  value,
  volume,
  onChange,
  onVolumeChange,
}: {
  value: string | null;
  volume: number;
  onChange: (url: string | null) => void;
  onVolumeChange: (v: number) => void;
}) {
  const [items, setItems] = useState<{ name: string; publicUrl: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage.from("sounds").list("", {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });
      setItems(
        (data ?? [])
          .filter((f) => f.name && f.name !== ".emptyFolderPlaceholder")
          .map((f) => ({
            name: f.name,
            publicUrl: supabase.storage.from("sounds").getPublicUrl(f.name).data.publicUrl,
          }))
      );
    })();
  }, []);

  const togglePlay = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playing === url) {
      setPlaying(null);
      return;
    }
    const a = new Audio(url);
    a.volume = volume;
    a.play().catch(() => {});
    a.addEventListener("ended", () => setPlaying(null));
    audioRef.current = a;
    setPlaying(url);
  };

  const currentName = value ? value.split("/").pop() : null;

  return (
    <div className="border border-bronze/40 rounded-sm p-3 bg-ivory/50">
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-xs font-heading uppercase tracking-wider text-bronze-dark">
          Looping Sound
        </label>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
          {value ? "Change" : "Choose Sound"}
        </Button>
      </div>

      {value && (
        <div className="flex items-center gap-2 mb-2">
          <Button size="sm" variant="ghost" onClick={() => togglePlay(value)}>
            {playing === value ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <span className="text-xs flex-1 truncate" title={currentName ?? ""}>{currentName}</span>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-bronze-dark w-14">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs w-10 text-right">{Math.round(volume * 100)}%</span>
        </div>
      )}

      {open && (
        <div className="mt-3 max-h-48 overflow-y-auto border border-bronze/30 rounded-sm divide-y divide-bronze/20">
          {items.length === 0 && (
            <div className="text-xs text-muted-foreground p-3">
              No sounds yet — upload some on the Sounds asset page.
            </div>
          )}
          {items.map((s) => (
            <div key={s.name} className="flex items-center gap-2 p-2 hover:bg-ivory">
              <Button size="sm" variant="ghost" onClick={() => togglePlay(s.publicUrl)}>
                {playing === s.publicUrl ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </Button>
              <button
                className="flex-1 text-left text-xs truncate"
                onClick={() => {
                  onChange(s.publicUrl);
                  setOpen(false);
                }}
                title={s.name}
              >
                {s.name}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
