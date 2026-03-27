import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_VERSION = "v1";
const LOCAL_FALLBACK_SECRET = "local-dev-subscription-secret-change-me";

export function createSubscriptionToken(payload) {
  const secret = getSubscriptionSecret();
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_VERSION,
    toBase64Url(iv),
    toBase64Url(authTag),
    toBase64Url(ciphertext)
  ].join(".");
}

export function parseSubscriptionToken(token) {
  const secret = getSubscriptionSecret();
  const key = createHash("sha256").update(secret).digest();
  const [version, ivValue, authTagValue, ciphertextValue] = token.split(".");

  if (version !== TOKEN_VERSION || !ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("订阅 token 无效。");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    fromBase64Url(ivValue)
  );
  decipher.setAuthTag(fromBase64Url(authTagValue));

  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(ciphertextValue)),
    decipher.final()
  ]).toString("utf8");

  const parsed = JSON.parse(plaintext);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("订阅 token 内容无效。");
  }

  return parsed;
}

function getSubscriptionSecret() {
  const secret = process.env.SUBSCRIPTION_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NETLIFY || process.env.CONTEXT || process.env.NODE_ENV === "production") {
    throw new Error("缺少 SUBSCRIPTION_SECRET 环境变量。请先在部署平台配置后再生成订阅链接。");
  }

  return LOCAL_FALLBACK_SECRET;
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}
