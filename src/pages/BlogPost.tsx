import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { renderMarkdown } from "@/lib/renderMarkdown";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image_url: string | null;
  published_at: string | null;
  created_at: string;
}

const BlogPostPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("blog_posts")
        .select("id, slug, title, excerpt, content, cover_image_url, published_at, created_at")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
      } else {
        setPost(data);
        document.title = `${data.title} — Third Republic Blog`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta && data.excerpt) meta.setAttribute("content", data.excerpt.slice(0, 160));
      }
      setLoading(false);
    })();
  }, [slug]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <article className="container py-12 max-w-3xl">
        <Link to="/blog" className="text-xs font-medium uppercase tracking-widest text-gold hover:underline">
          ← Back to blog
        </Link>

        {loading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

        {notFound && (
          <div className="mt-8">
            <h1 className="font-heading text-2xl font-bold text-foreground">Post not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This post may be unpublished or the URL is incorrect.
            </p>
          </div>
        )}

        {post && (
          <>
            <header className="mt-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {new Date(post.published_at || post.created_at).toLocaleDateString(undefined, {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
              <h1 className="mt-2 font-heading text-4xl font-bold text-foreground">{post.title}</h1>
              {post.excerpt && (
                <p className="mt-3 text-base text-muted-foreground">{post.excerpt}</p>
              )}
            </header>

            {post.cover_image_url && (
              <div className="mt-8 aspect-video overflow-hidden border border-border bg-muted">
                <img src={post.cover_image_url} alt={post.title} className="h-full w-full object-cover" />
              </div>
            )}

            <div className="mt-8">{renderMarkdown(post.content)}</div>
          </>
        )}
      </article>
      <Footer />
    </div>
  );
};

export default BlogPostPage;
