import fs from 'fs';
import path from 'path';

const root = process.cwd();
const src = path.join(root, 'server', 'data');
const dest = path.join(root, 'dist', 'server', 'data');

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const data = fs.readFileSync(path.join(src, entry));
    fs.writeFileSync(path.join(dest, entry), data);
  }
}
