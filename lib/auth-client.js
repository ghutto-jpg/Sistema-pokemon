import { SignJWT, jwtVerify } from 'jose';

const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error('Missing SESSION_SECRET');
const secretKey = new TextEncoder().encode(secret);

export async function signToken(payload, expiresIn = '8h') {
  return await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(expiresIn).sign(secretKey);
}

export async function verifyToken(token) {
  try { const { payload } = await jwtVerify(token, secretKey); return payload; } catch (e) { return null; }
}
