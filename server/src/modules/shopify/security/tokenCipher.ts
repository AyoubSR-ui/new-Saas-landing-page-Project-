import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../../config/env.js";

// AES-256-GCM: authenticated encryption. A 12-byte random IV is generated
// per encryption (NIST-recommended size for GCM); the 16-byte auth tag
// Prevents ciphertext tampering from ever decrypting successfully — a
// corrupted or forged blob throws instead of returning wrong plaintext.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const BLOB_VERSION = "v1";
const KEY_LENGTH_BYTES = 32;

function loadKey(): Buffer {
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
}

export class TokenDecryptionError extends Error {
  constructor(message = "Failed to decrypt token: invalid key or corrupted ciphertext") {
    super(message);
    this.name = "TokenDecryptionError";
  }
}

export class InvalidEncryptionKeyError extends Error {
  constructor() {
    super(`Encryption key must decode to exactly ${KEY_LENGTH_BYTES} bytes`);
    this.name = "InvalidEncryptionKeyError";
  }
}

// env.ts already validates TOKEN_ENCRYPTION_KEY's shape at process startup;
// this is a defense-in-depth guard so a key sourced or constructed any other
// way (tests, future call sites) still fails safely instead of silently
// truncating/padding into a usable-but-wrong key.
function assertValidKey(key: Buffer): void {
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new InvalidEncryptionKeyError();
  }
}

/**
 * Encrypts a plaintext secret (e.g. a Shopify offline access token) into a
 * single self-describing string safe to persist: `v1.<iv>.<authTag>.<ciphertext>`,
 * each segment base64-encoded.
 */
export function encryptToken(plaintext: string, key: Buffer = loadKey()): string {
  assertValidKey(key);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    BLOB_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/**
 * Decrypts a blob produced by {@link encryptToken}. Throws {@link TokenDecryptionError}
 * on a malformed blob, wrong key, or tampered ciphertext/auth tag — callers must not
 * treat a caught error as "empty token", only as "token unusable."
 */
export function decryptToken(blob: string, key: Buffer = loadKey()): string {
  assertValidKey(key);
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== BLOB_VERSION) {
    throw new TokenDecryptionError();
  }

  const [, ivPart, authTagPart, ciphertextPart] = parts;

  try {
    const iv = Buffer.from(ivPart as string, "base64");
    const authTag = Buffer.from(authTagPart as string, "base64");
    const ciphertext = Buffer.from(ciphertextPart as string, "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenDecryptionError();
  }
}
