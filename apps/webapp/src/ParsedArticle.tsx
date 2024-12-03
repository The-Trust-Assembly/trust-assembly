import { useSuspenseQuery } from "@tanstack/react-query";
import { getParsedArticle } from "./backend/api";
import { useState } from "react";

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

  if (!article) {
    return <div>No data</div>
  }

  return (
    <div>
      <h1>{article.title}</h1>
      <h2>{article.author}</h2>
      <div
        dangerouslySetInnerHTML={{ __html: article.content || "" }}
      />
    </div>
  )
}