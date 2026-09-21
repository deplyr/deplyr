import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Single envelope-encryption helper for every sensitive column (GitHub
 * tokens, SSH credentials, secret values, Slack webhook URLs). AES-256-GCM,
 * key from DEPLYR_MASTER_KEY (32 bytes, base64). One code path so sensitive
 * columns never grow divergent, ad-hoc handling.
 */

function loadMasterKey(): Buffer {
  const raw = process.env.DEPLYR_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "DEPLYR_MASTER_KEY is not set — required to encrypt/decrypt stored secrets",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DEPLYR_MASTER_KEY must decode to exactly 32 bytes (AES-256)");
  }
  return key;
}

const IV_LENGTH = 12; // GCM standard nonce size
const AUTH_TAG_LENGTH = 16;

export function encryptSecret(plaintext: string): Buffer {
  const key = loadMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptSecret(stored: Buffer): string {
  const key = loadMasterKey();
  const iv = stored.subarray(0, IV_LENGTH);
  const authTag = stored.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = stored.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
