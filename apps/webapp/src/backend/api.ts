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

export async function getReplacementHeadlines(): Promise<Replacement[]> {
  const path = `/api/replacements`;
  const response = await makeRequest('GET', path);
  return await response.json();
}

export type Replacement = {
  originalHeadline: string;
  replacementHeadline: string;
  status: "Pending";
  url: string;
}

export type User = {
  id: string;
  name: string;
  email: string;
}

export async function getUser(): Promise<User | null> {
  try {
    const response = await makeRequest('GET', '/api/me');
    return await response.json();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return null;
    }
    throw error;
  }
}

export async function login(token: string): Promise<User> {
  const response = await makeRequest(
    'POST',
    '/api/login',
    { token }
  );
  return await response.json();
}

export async function register(token: string): Promise<User> {
  const response = await makeRequest(
    'POST',
    '/api/register',
    { token }
  );
  return await response.json();
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function makeRequest(method: HttpMethod, url: string, data?: any): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new UnauthorizedError();
    }
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
  }

  return response;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized error");
  }
}