import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Plus, Save, Trash2, Pencil, X, Eye, Send } from "lucide-react";
import { Link } from "react-router-dom";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image_url: string | null;
  published: boolean;
  published_at: string | null;
  author_id: string;
  created_at: string;
  updated_at: string;
  mailed_at: string | null;
  mailed_count: number;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

const emptyDraft = (authorId: string): Partial<BlogPost> => ({
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image_url: "",
  published: false,
  author_id: authorId,
});

const AdminBlog = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<BlogPost> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load posts", description: error.message, variant: "destructive" });
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Admin — Blog";
    load();
  }, []);

  const startNew = () => {
    if (!user) return;
    setEditing(emptyDraft(user.id));
  };

  const startEdit = (p: BlogPost) => setEditing({ ...p });

  const save = async () => {
    if (!editing || !user) return;
    const title = (editing.title || "").trim();
    if (!title) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const slug = (editing.slug || slugify(title)).trim();
    if (!slug) {
      toast({ title: "Slug required", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload: any = {
      title,
      slug,
      excerpt: editing.excerpt || "",
      content: editing.content || "",
      cover_image_url: editing.cover_image_url || null,
      published: !!editing.published,
      author_id: editing.author_id || user.id,
    };

    // set published_at when first publishing
    if (payload.published && !editing.published_at) {
      payload.published_at = new Date().toISOString();
    } else if (!payload.published) {
      payload.published_at = null;
    } else {
      payload.published_at = editing.published_at;
    }

    let error;
    if (editing.id) {
      ({ error } = await (supabase as any).from("blog_posts").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await (supabase as any).from("blog_posts").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const { error } = await (supabase as any).from("blog_posts").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      load();
    }
  };

  const [mailing, setMailing] = useState(false);

  const mailPost = async (p: BlogPost) => {
    if (!p.published) {
      toast({ title: "Publish the post before mailing it.", variant: "destructive" });
      return;
    }
    if ((p.mailed_count || 0) > 0) {
      const ok = confirm(`⚠ This post was already mailed ${p.mailed_count} time(s)${p.mailed_at ? ` (last on ${new Date(p.mailed_at).toLocaleString()})` : ""}. Send again?`);
      if (!ok) return;
    }
    setMailing(true);
    const { data, error } = await supabase.functions.invoke("mail-blog-post", { body: { blog_post_id: p.id, force: (p.mailed_count || 0) > 0 } });
    setMailing(false);
    if (error || (data as any)?.error) {
      toast({ title: "Mail failed", description: error?.message || (data as any)?.error, variant: "destructive" });
      return;
    }
    toast({ title: `Sent to ${(data as any).sent} subscriber(s)`, description: (data as any).failed ? `${(data as any).failed} failed` : undefined });
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gold">Admin</p>
            <h1 className="font-heading text-3xl font-bold text-foreground">Blog Posts</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/blog">
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" /> View blog
              </Button>
            </Link>
            <Button size="sm" onClick={startNew}>
              <Plus className="w-4 h-4 mr-2" /> New post
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
          {/* List */}
          <div className="border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted/40">
              <h2 className="text-sm font-semibold text-accent">All Posts</h2>
            </div>
            <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {loading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
              ) : posts.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No posts yet.</p>
              ) : (
                posts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startEdit(p)}
                    className={`w-full text-left p-3 hover:bg-muted/40 transition-colors ${
                      editing?.id === p.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                        <p className="text-xs text-muted-foreground truncate">/{p.slug}</p>
                      </div>
                      <span
                        className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 ${
                          p.published
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.published ? "Live" : "Draft"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-accent">
                {editing ? (editing.id ? "Edit Post" : "New Post") : "Editor"}
              </h2>
              {editing && (
                <div className="flex gap-2">
                  {editing.id && (
                    <Button size="sm" variant="outline" onClick={() => remove(editing.id!)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={save} disabled={saving}>
                    <Save className="w-4 h-4 mr-1" /> {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
            </div>

            {!editing ? (
              <div className="p-6 text-sm text-muted-foreground">
                Select a post on the left or click <span className="font-medium">New post</span> to get started.
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div>
                  <Label htmlFor="title" className="text-xs uppercase tracking-wider">Title</Label>
                  <Input
                    id="title"
                    value={editing.title || ""}
                    onChange={(e) => {
                      const title = e.target.value;
                      setEditing((prev) => ({
                        ...prev!,
                        title,
                        slug: prev?.id ? prev.slug : slugify(title),
                      }));
                    }}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="slug" className="text-xs uppercase tracking-wider">Slug</Label>
                    <Input
                      id="slug"
                      value={editing.slug || ""}
                      onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cover" className="text-xs uppercase tracking-wider">Cover image URL</Label>
                    <Input
                      id="cover"
                      value={editing.cover_image_url || ""}
                      onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })}
                      placeholder="https://…"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="excerpt" className="text-xs uppercase tracking-wider">Excerpt</Label>
                  <Textarea
                    id="excerpt"
                    rows={2}
                    value={editing.excerpt || ""}
                    onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
                    placeholder="A short summary shown on the blog index."
                  />
                </div>
                <div>
                  <Label htmlFor="content" className="text-xs uppercase tracking-wider">
                    Content (Markdown: # ## ### **bold** - list ```code```)
                  </Label>
                  <Textarea
                    id="content"
                    rows={18}
                    value={editing.content || ""}
                    onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="published"
                    checked={!!editing.published}
                    onCheckedChange={(v) => setEditing({ ...editing, published: v })}
                  />
                  <Label htmlFor="published" className="text-sm">
                    Published {editing.published_at && `(since ${new Date(editing.published_at).toLocaleDateString()})`}
                  </Label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdminBlog;
