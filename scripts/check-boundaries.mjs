import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const restrictions = {
  core: ['three', '@dimforge', '../physics', '../rendering', '../simulation', '../tools'],
  physics: ['three', '../rendering', '../simulation', '../tools'],
  rendering: ['@dimforge', '../physics', '../simulation', '../tools'],
  simulation: ['three', '@dimforge', '../rendering', '../tools'],
};

let checked = 0;
for (const [layer, forbidden] of Object.entries(restrictions)) {
  for (const filename of readdirSync(join(root, layer)).filter((name) => name.endsWith('.ts'))) {
    const path = join(root, layer, filename);
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (forbidden.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
        throw new Error(`${relative(root, path)} imports forbidden dependency ${specifier}`);
      }
    }
    checked++;
  }
}
console.log(`Architecture boundaries passed (${checked} TypeScript files)`);
