import fs from 'fs';
import path from 'path';

const base = path.resolve(__dirname, '..', 'app'); // src/test/app

function requireAll(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  entries.forEach((entry) => {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      requireAll(full);
    } else if (entry.endsWith('.test.js')) {
      require(full);
    }
  });
}

requireAll(base);
