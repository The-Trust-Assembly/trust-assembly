export enum BACKEND_URL {
  LOCAL = 'http://localhost:5173',
  PROD = 'https://trust-assembly.com',
  DEV = 'https://dev.trust-assembly.com',
  STAGING = 'https://staging.trust-assembly.com',
  TEST = 'http://i8kww8kk00oogcg0cc88kkkc.5.78.111.152.sslip.io:8001',
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
