// TODO: make this dynamic based on which environment we're in, for now it's
// hardcoded to only work locally
import { CONFIG } from '../../configs/config.test';
import { TransformedArticle } from '../models/TransformedArticle';
import { getBackendUrlFromEnvironmentAndVersion } from '../utils/constants';

export async function getTransformation(
  url: string,
  author: string,
): Promise<TransformedArticle | undefined> {
  try {
    const params = new URLSearchParams({ url, author });
    const result = await makeRequest<TransformedArticle>(
      'GET',
      `/transformedHeadline?${params.toString()}`,
    );

    console.log(`background::sendResponse: ${JSON.stringify(result, null, 2)}`);

    return result;
  } catch (error) {
    console.error('Error fetching transformed headline:', error);
    throw error;
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function makeRequest<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = getBackendUrlFromEnvironmentAndVersion(
    CONFIG.BACKEND_URL,
    undefined,
  );
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const reason = await response
      .json()
      .then((data: { error: string }) => data.error)
      .catch(() => `Error retrieving data: ${response.statusText}`);
    throw new Error(reason);
  }

  return (await response.json()) as T;
}
