export function getPayloadSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.PAYLOAD_SECRET;
  if (!secret || secret.length < 32 || /replace|change-me|development-only/i.test(secret) || new Set(secret).size < 8) {
    throw new Error("PAYLOAD_SECRET 必须设置为至少 32 字符的随机密钥，不能使用示例值");
  }
  return secret;
}

export function requireInitialPassword(password: string | undefined): string {
  if (!password || password.length < 12 || /^(change-me|password|admin|123456)/i.test(password)) {
    throw new Error("首次初始化必须通过 SEED_PASSWORD 提供至少 12 字符的非默认密码");
  }
  return password;
}
