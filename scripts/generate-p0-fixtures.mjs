import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = process.argv[2] || '/tmp/greenpeas-p0-fixtures';
await mkdir(outputDir, { recursive: true });

for (const [length, featureCount] of [[100_000, 100], [1_000_000, 1_000], [5_000_000, 10_000]]) {
  const sequence = 'ATGC'.repeat(length / 4);
  const annotations = Array.from({ length: featureCount }, (_, index) => {
    const start = Math.floor(index * length / featureCount);
    return {
      id: `feature-${index}`, name: `feature-${index}`, type: 'misc_feature',
      start, end: Math.min(length, start + 60), strand: 'Forward',
      color: null, display_shape: null
    };
  });
  const document = {
    id: `synthetic-${length}`, description: `Synthetic ${length} bp, ${featureCount} features`,
    sequence, annotations, primers: [], topology: 'Linear', trace: null,
    enzymes: null, enzymeSettings: null, alignmentResults: null,
    debug_hex: null, file_path: null
  };
  const path = join(outputDir, `synthetic-${length}-${featureCount}.gp`);
  await writeFile(path, JSON.stringify(document));
  console.log(path);
}

await writeFile(join(outputDir, 'empty.gp'), JSON.stringify({
  id: 'empty', description: 'Synthetic empty sequence', sequence: '',
  annotations: [], primers: [], topology: 'Linear', trace: null,
  enzymes: null, enzymeSettings: null, alignmentResults: null,
  debug_hex: null, file_path: null
}));
await writeFile(join(outputDir, 'short-circular.gp'), JSON.stringify({
  id: 'short-circular', description: 'Synthetic origin-crossing feature',
  sequence: 'ATGCATGC', annotations: [{ id: 'origin-feature', name: 'origin-feature',
    type: 'misc_feature', start: 6, end: 2, strand: 'Forward',
    color: null, display_shape: 'Arrow' }],
  primers: [], topology: 'Circular', trace: null, enzymes: null,
  enzymeSettings: null, alignmentResults: null, debug_hex: null, file_path: null
}));
console.log(join(outputDir, 'empty.gp'));
console.log(join(outputDir, 'short-circular.gp'));
