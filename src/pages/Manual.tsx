import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Plus, Save, Trash2, Pencil, X, ChevronRight } from "lucide-react";

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  sort_order: number;
  parent_slug: string | null;
}

// Simple markdown-ish renderer (headings, bold, code blocks, lists)
function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let key = 0;

  const processInline = (text: string) => {
    // Bold
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
    );
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={key++} className="my-3 rounded border border-border bg-muted/50 p-3 text-xs font-mono overflow-x-auto text-foreground">
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={key++} className="mt-6 mb-3 text-2xl font-bold font-heading text-foreground">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="mt-5 mb-2 text-xl font-semibold font-heading text-foreground">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="mt-4 mb-2 text-lg font-semibold font-heading text-foreground">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={key++} className="flex gap-2 ml-4 my-0.5 text-sm text-foreground">
          <span className="text-muted-foreground">•</span>
          <span>{processInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(<p key={key++} className="text-sm leading-relaxed text-foreground my-1">{processInline(line)}</p>);
    }
  }

  return elements;
}

const Manual = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editOrder, setEditOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPages(); }, []);

  const loadPages = async () => {
    const { data } = await supabase.from("wiki_pages").select("*").order("sort_order");
    if (data) {
      setPages(data);
      const slug = searchParams.get("page");
      const target = slug ? data.find(p => p.slug === slug) : data[0];
      if (target) setActivePage(target);
      else if (data.length > 0) setActivePage(data[0]);
    }
  };

  const selectPage = (page: WikiPage) => {
    setActivePage(page);
    setSearchParams({ page: page.slug });
    setEditing(false);
  };

  const startEdit = () => {
    if (!activePage) return;
    setEditTitle(activePage.title);
    setEditSlug(activePage.slug);
    setEditContent(activePage.content);
    setEditOrder(activePage.sort_order);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const savePage = async () => {
    if (!activePage) return;
    setSaving(true);
    const { error } = await supabase.from("wiki_pages").update({
      title: editTitle,
      slug: editSlug,
      content: editContent,
      sort_order: editOrder,
    }).eq("id", activePage.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved" });
      setEditing(false);
      await loadPages();
    }
    setSaving(false);
  };

  const addPage = async () => {
    const maxOrder = pages.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const slug = `new-page-${Date.now()}`;
    const { error } = await supabase.from("wiki_pages").insert({
      slug,
      title: "New Page",
      content: "# New Page\n\nWrite your content here.",
      sort_order: maxOrder + 1,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await loadPages();
    }
  };

  const deletePage = async () => {
    if (!activePage) return;
    if (!confirm(`Delete "${activePage.title}"?`)) return;
    const { error } = await supabase.from("wiki_pages").delete().eq("id", activePage.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      setActivePage(null);
      setEditing(false);
      await loadPages();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="w-56 shrink-0">
            <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Manual</h2>
            <nav className="space-y-0.5">
              {pages.map(page => (
                <button
                  key={page.id}
                  onClick={() => selectPage(page)}
                  className={`w-full flex items-center gap-2 rounded px-3 py-1.5 text-sm text-left transition-colors ${
                    activePage?.id === page.id
                      ? "bg-primary/10 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${activePage?.id === page.id ? "rotate-90" : ""}`} />
                  {page.title}
                </button>
              ))}
            </nav>
            {isAdmin && (
              <Button size="sm" variant="outline" className="mt-4 w-full" onClick={addPage}>
                <Plus className="mr-1 h-3 w-3" /> Add Page
              </Button>
            )}
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {activePage && !editing && (
              <div>
                {isAdmin && (
                  <div className="flex gap-2 mb-4">
                    <Button size="sm" variant="outline" onClick={startEdit}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={deletePage}>
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </div>
                )}
                <article className="max-w-none">
                  {renderContent(activePage.content)}
                </article>
              </div>
            )}

            {activePage && editing && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button size="sm" onClick={savePage} disabled={saving}>
                    <Save className="mr-1 h-3 w-3" /> {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>
                    <X className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Title</label>
                    <Input className="mt-1" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Slug</label>
                    <Input className="mt-1" value={editSlug} onChange={e => setEditSlug(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Sort Order</label>
                    <Input className="mt-1" type="number" value={editOrder} onChange={e => setEditOrder(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Content (Markdown)</label>
                  <textarea
                    className="mt-1 w-full min-h-[400px] rounded border border-input bg-background p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                  />
                </div>
                {/* Live preview */}
                <div>
                  <label className="text-xs text-muted-foreground">Preview</label>
                  <div className="mt-1 rounded border border-border p-4">
                    {renderContent(editContent)}
                  </div>
                </div>
              </div>
            )}

            {!activePage && (
              <p className="text-muted-foreground text-sm">Select a page from the sidebar, or add a new one.</p>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Manual;
