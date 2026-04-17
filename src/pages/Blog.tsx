import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface BlogPostListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  published_at: string | null;
  created_at: string;
}

const Blog = () => {
  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Blog — Third Republic";
    (async () => {
      const { data } = await (supabase as any)
        .from("blog_posts")
        .select("id, slug, title, excerpt, cover_image_url, published_at, created_at")
        .eq("published", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      setPosts(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="border-b border-border">
        <div className="container py-16">
          <p className="text-xs font-medium uppercase tracking-widest text-gold">Devlog</p>
          <h1 className="mt-2 font-heading text-4xl font-bold text-foreground">Blog</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Updates, design notes, and stories from the development of Third Republic.
          </p>
        </div>
      </section>

      <section>
        <div className="container py-12">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet. Check back soon.</p>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="group flex flex-col border border-border hover:border-primary transition-colors"
                >
                  {post.cover_image_url && (
                    <div className="aspect-video overflow-hidden bg-muted">
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      {new Date(post.published_at || post.created_at).toLocaleDateString(undefined, {
                        year: "numeric", month: "long", day: "numeric",
                      })}
                    </p>
                    <h2 className="mt-2 font-heading text-xl font-semibold text-foreground group-hover:text-primary">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}
                    <span className="mt-4 text-xs font-medium uppercase tracking-wider text-gold">
                      Read →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Blog;
