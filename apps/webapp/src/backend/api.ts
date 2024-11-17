export async function getHello(): Promise<string> {
  const respose = await makeRequest('GET', '/api');
  return await respose.text();
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