import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../.output/chrome-mv3/', import.meta.url));
const read = (name) => readFileSync(join(dist, name), 'utf8');
const failures = [];

const manifest = JSON.parse(read('manifest.json'));
if (manifest.manifest_version !== 3) failures.push('manifest is not version 3');
if (manifest.devtools_page !== 'devtools.html') failures.push('devtools_page is missing');
if (manifest.background) failures.push('a background worker is not needed');
const permissions = manifest.permissions ?? [];
if (permissions.length !== 1 || permissions[0] !== 'storage') {
  failures.push(`unexpected permissions: ${permissions.join(', ')}`);
}
const hosts = manifest.host_permissions ?? [];
const allowedHosts = new Set(['http://127.0.0.1/*', 'http://localhost/*']);
if (hosts.length !== allowedHosts.size || hosts.some((host) => !allowedHosts.has(host))) {
  failures.push(`host access must stay on loopback: ${hosts.join(', ') || 'none'}`);
}
for (const forbidden of ['content_scripts', 'web_accessible_resources']) {
  if (manifest[forbidden]) failures.push(`manifest should not include ${forbidden}`);
}

for (const page of ['devtools.html', 'devtools-panel.html']) {
  const html = read(page);
  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) failures.push(`${page} contains an inline script`);
  if (/https?:\/\//i.test(html)) failures.push(`${page} references a remote URL`);
  if (html.includes('crossorigin')) failures.push(`${page} uses crossorigin, which can block extension modules`);
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const scripts = walk(dist).filter((file) => file.endsWith('.js'));
for (const file of scripts) {
  const source = readFileSync(file, 'utf8');
  if (/\beval\s*\(/.test(source) || /new Function\s*\(/.test(source)) {
    failures.push(`${file} contains eval or new Function`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('extension output checks passed\n');
