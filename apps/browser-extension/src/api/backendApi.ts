// TODO: make this dynamic based on which environment we're in, for now it's
// hardcoded to only work locally
import { CONFIG } from '../../configs/config.test';
import { TransformedArticle } from '../models/TransformedArticle';
import { getBackendUrlFromEnvironmentAndVersion } from '../utils/constants';

export async function getTransformations(
  url: string,
): Promise<TransformedArticle[] | undefined> {
  try {
    const result = await makeRequest<TransformedArticle[]>(
      'POST',
      '/headlines',
      {
        url,
      },
    );

    console.log(`background::sendResponse: ${JSON.stringify(result, null, 2)}`);

    return result;
  } catch (error) {
    console.error('Error fetching transformed headline:', error);
    throw error;
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

function makeRequest<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = getBackendUrlFromEnvironmentAndVersion(
    CONFIG.BACKEND_URL,
    CONFIG.API_VERSION,
  );
  const url = `${baseUrl}${path}`;
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
    .then((response) => response.json())
    .then((data: T) => data);
}
