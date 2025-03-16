export enum BACKEND_URL {
  LOCAL = 'http://localhost:5173',
  PROD = 'https://trustassembly.org',
  DEV = 'https://dev.trust-assembly.com',
  STAGING = 'https://staging.trust-assembly.com',
}

export enum API_VERSION {
  V1 = 'v1',
}

export const getBackendUrlFromEnvironmentAndVersion = (
  environment: BACKEND_URL,
  version?: API_VERSION,
): string => {
  const url = new URL(environment);
  url.pathname = version ? `/api/${version}` : '/api';
  return url.toString();
};
