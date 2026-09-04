import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  InvalidEncryptionKeyError,
  TokenDecryptionError,
} from "./tokenCipher.js";

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);

describe("tokenCipher", () => {
  it("round-trips a plaintext token through the default (env) key", () => {
    const plaintext = "shpat_" + "a".repeat(32);
    const blob = encryptToken(plaintext);

    expect(blob).not.toContain(plaintext);
    expect(decryptToken(blob)).toBe(plaintext);
  });

  it("round-trips using an explicitly supplied key", () => {
    const plaintext = "shpat_explicit_key_token";
    const blob = encryptToken(plaintext, KEY_A);

    expect(decryptToken(blob, KEY_A)).toBe(plaintext);
  });

  it("produces a distinct ciphertext blob for the same plaintext each time (random IV)", () => {
    const plaintext = "shpat_same_plaintext";
    const blobA = encryptToken(plaintext, KEY_A);
    const blobB = encryptToken(plaintext, KEY_A);

    expect(blobA).not.toBe(blobB);
    expect(decryptToken(blobA, KEY_A)).toBe(plaintext);
    expect(decryptToken(blobB, KEY_A)).toBe(plaintext);
  });

  it("throws TokenDecryptionError when decrypting with the wrong key", () => {
    const blob = encryptToken("shpat_secret", KEY_A);

    expect(() => decryptToken(blob, KEY_B)).toThrow(TokenDecryptionError);
  });

  it("throws TokenDecryptionError on corrupted ciphertext", () => {
    const blob = encryptToken("shpat_secret", KEY_A);
    const parts = blob.split(".");
    const ciphertext = parts[3] as string;
    const flipped = ciphertext.slice(0, -1) + (ciphertext.at(-1) === "A" ? "B" : "A");
    const corrupted = [parts[0], parts[1], parts[2], flipped].join(".");

    expect(() => decryptToken(corrupted, KEY_A)).toThrow(TokenDecryptionError);
  });

  it("throws TokenDecryptionError on a malformed blob", () => {
    expect(() => decryptToken("not-a-valid-blob", KEY_A)).toThrow(TokenDecryptionError);
    expect(() => decryptToken("v1.only.two", KEY_A)).toThrow(TokenDecryptionError);
    expect(() => decryptToken("v2.a.b.c", KEY_A)).toThrow(TokenDecryptionError);
  });

  it("fails safely with InvalidEncryptionKeyError when the key is the wrong length", () => {
    const shortKey = randomBytes(16);

    expect(() => encryptToken("shpat_secret", shortKey)).toThrow(InvalidEncryptionKeyError);
    expect(() => decryptToken("v1.a.b.c", shortKey)).toThrow(InvalidEncryptionKeyError);
  });
});
