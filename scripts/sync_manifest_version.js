#!/usr/bin/env node
/**
 * Sync version from package.json to manifest.json
 * This script reads the version from package.json and updates manifest.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function syncManifestVersion() {
  try {
    // Read package.json
    const packageJsonPath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const version = packageJson.version;

    // Read manifest.json
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    const oldVersion = manifest.version;
    manifest.version = version;

    // Write updated manifest.json
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    console.log(`✅ Synced manifest.json: ${oldVersion} → ${version}`);
    return version;
  } catch (error) {
    console.error('❌ Failed to sync manifest version:', error.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  syncManifestVersion();
}
