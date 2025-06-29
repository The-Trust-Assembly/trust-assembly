import * as jose from "jsr:@panva/jose";

export class JwtDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtDecodeError";
  }
}

export class JwtVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtVerificationError";
  }
}

export type JwtPayload = {
  iss: string; // Issuer
  sub: string; // Subject
  aud: string; // Audience
  exp: number; // Expiration time
  iat: number; // Issued at time
  name: string;
  email: string;
};

export async function authenticateToken(token: string): Promise<JwtPayload> {
  const payload = decodeToken(token);

  const jwksUrl = getJwksUrl(payload.iss);
  try {
    const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
    const {
      payload: verifiedPayload,
    } = await jose.jwtVerify(token, jwks, {
      issuer: payload.iss,
      audience: payload.aud,
    });
  
    return verifiedPayload as JwtPayload;
  } catch (e) {
    console.log("Error verifying JWT:", e);
    const error = e instanceof Error ? e : new Error(String(e));
    throw new JwtVerificationError(error.message);
  }
}

function decodeToken(token: string): JwtPayload {
  try {
    return jose.decodeJwt(token);
  } catch (e) {
    console.log("Error decoding JWT:", e);
    const error = e instanceof Error ? e : new Error(String(e));
    throw new JwtDecodeError(error.message);
  }
}

function getJwksUrl(issuer: string): string {
  if (issuer === "https://accounts.google.com") {
    return "https://www.googleapis.com/oauth2/v3/certs";
  }

  throw new JwtVerificationError(`Unsupported issuer: ${issuer}`);
}
