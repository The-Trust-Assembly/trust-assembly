import { useSuspenseQuery } from "@tanstack/react-query";
import { getParsedArticle } from "./backend/api";
import { useMemo, useState } from "react";

// Minimal HTML sanitizer for scraped article content. Strips <script>,
// <style>, <iframe>, inline event handlers, and javascript: URLs. This
// is intentionally conservative; swap in DOMPurify once it is added to
// the dependency tree.
function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  const doc = new DOMParser().parseFromString(dirty, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach(n => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name === "src" || name === "xlink:href") && value.startsWith("javascript:")) el.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}

export default function ParsedArticle() {
  const [url, setUrl] = useState<string | undefined>();
  const [urlResult, setUrlResult] = useState<string | undefined>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      setUrlResult(url);
    }
  };

  return (urlResult ? (
    <Article url={urlResult} />
  ) : (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Parse URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit">Parse</button>
      </div>
    </form>
  ));
}

function Article({ url }: { url: string }) {
  const { data: article } = useSuspenseQuery({
    queryKey: ["parsedArticle", url],
    queryFn: () => getParsedArticle(url),
  });

  const safeHtml = useMemo(() => sanitizeHtml(article?.content || ""), [article?.content]);

  if (!article) {
    return <div>No data</div>
  }

  return (
    <div>
      <h1>{article.title}</h1>
      <h2>{article.author}</h2>
      <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
    </div>
  )
}