#!/usr/bin/env node
// Enforces the engine/UI boundary: src/engine must never import from
// reference-ui (or any other UI layer). Run via `npm run check:boundary`.
// Portable (no grep dependency) so it works the same in CI on any OS.
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.join(__dirname, '..', 'src', 'engine');
const FORBIDDEN = ['reference-ui'];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const files = await walk(engineRoot);
const violations = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  for (const term of FORBIDDEN) {
    if (content.includes(term)) {
      violations.push({ file: path.relative(process.cwd(), file), term });
    }
  }
}

if (violations.length > 0) {
  console.error('Engine/UI boundary violated — src/engine must not reference reference-ui:');
  for (const { file, term } of violations) console.error(`  ${file}: contains "${term}"`);
  process.exit(1);
}

console.log(`OK — ${files.length} engine files checked, no reference-ui references found.`);
