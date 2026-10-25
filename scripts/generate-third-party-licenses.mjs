#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoRoot = path.join(repoRoot, 'src-tauri');
const outputPath = path.join(repoRoot, 'THIRD_PARTY_LICENSES.txt');
const licenseFilePattern = /^(license|licence|copying|copyright|notice|unlicense)([.-].*)?$/i;
const allowedLicenseIds = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSL-1.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Unicode-3.0',
  'Unlicense',
  'Zlib',
]);

function readCargoMetadata() {
  const rustcInfo = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const target = rustcInfo.match(/^host:\s+(.+)$/m)?.[1];
  if (!target) {
    throw new Error('Could not determine the Rust host target.');
  }

  const metadata = execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--filter-platform', target, '--locked'],
    { cwd: cargoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return { metadata: JSON.parse(metadata), target };
}

function collectRuntimeCargoPackages(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const rootId = metadata.resolve.root;
  const visited = new Set([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const node = nodes.get(queue.shift());
    if (!node) continue;

    for (const dependency of node.deps) {
      const isNormalDependency = dependency.dep_kinds.some(({ kind }) => kind === null);
      if (isNormalDependency && !visited.has(dependency.pkg)) {
        visited.add(dependency.pkg);
        queue.push(dependency.pkg);
      }
    }
  }

  return [...visited]
    .filter((id) => id !== rootId)
    .map((id) => packages.get(id))
    .filter(Boolean)
    .filter((pkg) => !pkg.targets.every((target) => target.kind.includes('proc-macro')))
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

async function collectNpmRuntimePackages() {
  const lock = JSON.parse(await fs.readFile(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  return Object.entries(lock.packages)
    .filter(([packagePath, metadata]) => packagePath && metadata.dev !== true)
    .map(([packagePath, metadata]) => ({
      name: packagePath.replace(/^node_modules\//, ''),
      version: metadata.version,
      license: metadata.license,
      directory: path.join(repoRoot, packagePath),
      source: `https://www.npmjs.com/package/${packagePath.replace(/^node_modules\//, '')}/v/${metadata.version}`,
    }))
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

async function collectLicenseFiles(directory, explicitLicenseFile) {
  const names = await fs.readdir(directory);
  const candidates = names
    .filter((name) => licenseFilePattern.test(name))
    .map((name) => path.join(directory, name));

  if (explicitLicenseFile) {
    candidates.push(path.resolve(directory, explicitLicenseFile));
  }

  const unique = [...new Set(candidates)].sort();
  const files = [];
  for (const file of unique) {
    const stat = await fs.stat(file).catch(() => null);
    if (stat?.isFile()) {
      const content = (await fs.readFile(file, 'utf8'))
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n');
      files.push({ name: path.basename(file), content });
    }
  }
  return files;
}

function validateLicenses(packages) {
  const invalid = packages.filter(({ license }) => {
    if (!license) return true;
    const ids = license
      .replace(/[()]/g, ' ')
      .split(/\s+(?:AND|OR)\s+|\/|\s+/)
      .filter(Boolean);
    return ids.some((id) => !allowedLicenseIds.has(id));
  });
  if (invalid.length > 0) {
    const details = invalid.map(({ name, version, license }) => `${name}@${version}: ${license || 'UNKNOWN'}`);
    throw new Error(`Blocked or unknown runtime licenses:\n${details.join('\n')}`);
  }
}

function renderPackage(entry) {
  const lines = [
    '',
    '='.repeat(80),
    `${entry.ecosystem}: ${entry.name}@${entry.version}`,
    `License expression: ${entry.license}`,
    `Source: ${entry.source}`,
  ];
  if (entry.authors?.length) {
    lines.push(`Authors: ${entry.authors.join(', ')}`);
  }
  if (entry.license.includes('MPL-2.0')) {
    lines.push('MPL source availability: the exact covered source is available at the Source URL above.');
  }
  if (entry.files.length === 0) {
    lines.push('No license file was packaged with this dependency; metadata, authors, and source location are provided above.');
  }
  for (const file of entry.files) {
    lines.push('', `--- ${file.name} ---`, '', file.content.trim());
  }
  return lines.join('\n');
}

async function main() {
  const { metadata, target } = readCargoMetadata();
  const cargoPackages = collectRuntimeCargoPackages(metadata);
  const npmPackages = await collectNpmRuntimePackages();

  const cargoEntries = await Promise.all(cargoPackages.map(async (pkg) => ({
    ecosystem: 'Rust crate',
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    authors: pkg.authors,
    source: `https://crates.io/crates/${pkg.name}/${pkg.version}`,
    files: await collectLicenseFiles(path.dirname(pkg.manifest_path), pkg.license_file),
  })));
  const npmEntries = await Promise.all(npmPackages.map(async (pkg) => ({
    ecosystem: 'npm package',
    ...pkg,
    files: await collectLicenseFiles(pkg.directory),
  })));
  const entries = [...cargoEntries, ...npmEntries];
  validateLicenses(entries);

  const mplEntries = entries.filter(({ license }) => license.includes('MPL-2.0'));
  const noticeFileCount = entries.reduce(
    (count, entry) => count + entry.files.filter(({ name }) => /^notice([.-]|$)/i.test(name)).length,
    0,
  );
  const header = [
    'GreenPeas Third-Party Licenses and Notices',
    '',
    'This file applies only to third-party components included in GreenPeas.',
    'GreenPeas itself is distributed under the MIT License in the separate',
    'LICENSE file.',
    '',
    `Generated for Rust target: ${target}`,
    `Runtime Rust crates listed: ${cargoEntries.length}`,
    `Runtime npm packages listed: ${npmEntries.length}`,
    `Packaged NOTICE files included: ${noticeFileCount}`,
    '',
    'No GPL, AGPL, LGPL, SSPL, or BUSL runtime dependency was detected.',
    '',
    'MPL-2.0 covered components:',
    ...mplEntries.map(({ name, version, source }) => `- ${name}@${version}: ${source}`),
    '',
    'The MPL-covered components are unmodified third-party dependencies. Their',
    'exact source code is available from the URLs above. GreenPeas does not limit',
    'rights granted for those components under the Mozilla Public License 2.0.',
  ].join('\n');

  await fs.writeFile(outputPath, `${header}\n${entries.map(renderPackage).join('\n')}\n`);
  console.log(`Generated ${path.relative(repoRoot, outputPath)} with ${entries.length} runtime dependencies.`);
}

await main();
