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

export type User = {
  id: string;
  name: string;
  email: string;
}

export async function getUser(): Promise<User | null> {
  const response = await makeRequest('GET', '/api/user');
  if (response.status === 401) {
    return null;
  }
  return await response.json();
}

export async function login(token: string): Promise<User> {
  const response = await makeRequest(
    'POST',
    '/api/login',
    { token }
  );
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