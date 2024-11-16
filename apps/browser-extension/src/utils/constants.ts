export enum BACKEND_URL {
  LOCAL = 'http://localhost:8000',
  PROD = 'https://trust-assembly.com',
  DEV = 'https://dev.trust-assembly.com',
  STAGING = 'https://staging.trust-assembly.com',
  TEST = 'https://test.trust-assembly.com',
}

export enum API_VERSION {
  V1 = 'v1',
}

export const getBackendUrlFromEnvironmentAndVersion = (
  environment: BACKEND_URL,
  version: API_VERSION,
): string => {
  return `${environment}/api/${version}`;
};
