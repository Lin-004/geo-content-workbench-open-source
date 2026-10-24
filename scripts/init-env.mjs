import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const example = await readFile('.env.example', 'utf8');
const content = example
  .replace(/^PAYLOAD_SECRET=.*$/m, `PAYLOAD_SECRET=${randomBytes(32).toString('hex')}`)
  .replace(/^SEED_PASSWORD=.*$/m, `SEED_PASSWORD=${randomBytes(24).toString('base64url')}`);
await writeFile('.env.local', content, { flag: 'wx', mode: 0o600 });
console.log('已生成 .env.local；初始密码请从该文件读取。已有文件不会被覆盖。');
