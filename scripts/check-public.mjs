import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';

const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const rules = [
  ['private-key', /-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['provider-token', /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})/],
  ['personal-path', /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//],
  ['literal-secret', /(?:PAYLOAD_SECRET|SEED_PASSWORD)\s*=\s*["']?[A-Za-z0-9_+/=-]{16,}/],
];
const forbidden = /(?:^|\/)(?:\.env(?:\..+)?|runtime\.env|initial-login\.txt|id_rsa|id_ed25519|\.backups|media)(?:\/|$)|\.(?:pem|key|p12|pfx|dump|sql|sqlite3?|db|zip|tar|gz|docx|png|jpe?g|webp)$/i;
const findings = [];
for (const file of files) {
  if (file !== '.env.example' && forbidden.test(file)) findings.push(`${file}: prohibited-file`);
  const stat = await lstat(file);
  if (!stat.isFile()) { findings.push(`${file}: non-regular-file`); continue; }
  const bytes = await readFile(file);
  if (bytes.includes(0)) { findings.push(`${file}: binary-file`); continue; }
  const lines = bytes.toString('utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [name, pattern] of rules) if (pattern.test(line)) findings.push(`${file}:${i + 1}: ${name}`);
    for (const match of line.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
      const ip = match[0], octets = ip.split('.').map(Number);
      if (octets.some(value => value > 255)) continue;
      if (ip === '0.0.0.0' || ip.startsWith('127.') || /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip)) continue;
      findings.push(`${file}:${i + 1}: non-example-ip`);
    }
    for (const match of line.matchAll(/(?:postgres(?:ql)?|mysql):\/\/[^\s"'`]+/g)) {
      try {
        const url = new URL(match[0]);
        if (url.password && !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) && !url.hostname.endsWith('.example.com')) findings.push(`${file}:${i + 1}: database-credential`);
      } catch { /* Incomplete code expressions are not connection values. */ }
    }
  }
}
if (findings.length) {
  console.error(findings.join('\n')); // Locations and categories only; never print matching values.
  process.exitCode = 1;
} else console.log(`Public-file check passed: ${files.length} files; no matching sensitive content.`);
