import { ArticleData } from "@extractus/article-extractor";

export async function getHello(): Promise<string> {
  const respose = await makeRequest('GET', '/api');
  return await respose.text();
}

export async function getParsedArticle(url: string): Promise<ArticleData | null> {
  const path = `/api/parsedArticle?url=${encodeURIComponent(url)}`;
  const response = await makeRequest('GET', path);
  return await response.json();
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

function makeRequest(method: HttpMethod, url: string, data?: any): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  })
}