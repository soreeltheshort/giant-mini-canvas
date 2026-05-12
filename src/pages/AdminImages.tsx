import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Upload, Pencil, Trash2, RefreshCw } from "lucide-react";
import Header from "@/components/Header";

type ImageItem = {
  name: string;
  publicUrl: string;
  updated_at?: string;
};

const BUCKET = "images";

export default function AdminImages() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: 1000,
      sortBy: { column: "updated_at", order: "desc" },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const mapped = (data ?? [])
      .filter((f) => f.name && !f.name.endsWith("/") && f.name !== ".emptyFolderPlaceholder")
      .map((f) => ({
        name: f.name,
        publicUrl: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
        updated_at: f.updated_at,
      }));
    setItems(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (file: File, nameOverride?: string) => {
    const ext = file.name.split(".").pop() ?? "";
    const base = (nameOverride || uploadName || file.name.replace(/\.[^.]+$/, "")).trim();
    if (!base) {
      toast.error("Please provide a name");
      return;
    }
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalName = safe.includes(".") ? safe : `${safe}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(finalName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Uploaded ${finalName}`);
    setUploadName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
  };

  const handleReplace = async (file: File, targetName: string) => {
    const { error } = await supabase.storage.from(BUCKET).upload(targetName, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Replaced ${targetName}`);
    setReplaceTarget(null);
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    load();
  };

  const handleRename = async (oldName: string) => {
    const next = window.prompt("New name (with extension):", oldName);
    if (!next || next === oldName) return;
    const safe = next.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error } = await supabase.storage.from(BUCKET).move(oldName, safe);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Renamed to ${safe}`);
    load();
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    const { error } = await supabase.storage.from(BUCKET).remove([name]);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted ${name}`);
    load();
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-heading text-4xl text-gold mb-2">Images</h1>
        <p className="text-muted-foreground mb-8">Upload, name, replace, and copy URLs of stored images.</p>

        <Card className="p-6 mb-8 bg-card/50">
          <h2 className="font-heading text-xl text-gold mb-4">Upload new image</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Name (optional)</label>
              <Input
                placeholder="my-image-name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Choose & Upload
            </Button>
          </div>
        </Card>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl text-gold">Stored images ({items.length})</h2>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && replaceTarget) handleReplace(f, replaceTarget);
          }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.name} className="overflow-hidden bg-card/50">
              <div className="aspect-video bg-muted/30 flex items-center justify-center overflow-hidden">
                <img src={item.publicUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="p-3 space-y-2">
                <div className="font-medium truncate" title={item.name}>{item.name}</div>
                <div className="flex items-center gap-1">
                  <Input readOnly value={item.publicUrl} className="text-xs h-8" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="icon" variant="ghost" onClick={() => copyUrl(item.publicUrl)} title="Copy URL">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleRename(item.name)}>
                    <Pencil className="h-3 w-3 mr-1" /> Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplaceTarget(item.name);
                      replaceInputRef.current?.click();
                    }}
                  >
                    <Upload className="h-3 w-3 mr-1" /> Replace
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(item.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {!loading && items.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">No images yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
