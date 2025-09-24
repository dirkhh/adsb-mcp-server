#!/usr/bin/env node
/**
 * Update version information in package.json and manifest.json based on latest git tag
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function getLatestGitTag() {
  try {
    // Get the latest tag, sorted by version
    const latestTag = execSync('git tag --sort=-version:refname | head -1', {
      encoding: 'utf8',
      cwd: projectRoot
    }).trim();

    if (!latestTag) {
      console.warn('No git tags found. Using default version 0.1.0');
      return '0.1.0';
    }

    // Remove 'v' prefix if present
    return latestTag.startsWith('v') ? latestTag.slice(1) : latestTag;
  } catch (error) {
    console.warn('Failed to get git tag:', error.message);
    return '0.1.0';
  }
}

function updatePackageJson(version) {
  const packageJsonPath = join(projectRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  const oldVersion = packageJson.version;
  packageJson.version = version;
  packageJson.name = 'adsb-mcp-server'; // Ensure consistent naming

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated package.json: ${oldVersion} → ${version}`);
}

function updateManifestJson(version) {
  const manifestPath = join(projectRoot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const oldVersion = manifest.version;
  manifest.version = version;
  manifest.name = 'adsb-mcp-server'; // Ensure consistent naming

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Updated manifest.json: ${oldVersion} → ${version}`);
}

function main() {
  console.log('Updating version information...');

  const version = getLatestGitTag();
  console.log(`Using version: ${version}`);

  updatePackageJson(version);
  updateManifestJson(version);

  console.log('✅ Version update complete!');
  console.log(`📦 Project name: adsb-mcp-server`);
  console.log(`🏷️  Version: ${version}`);
}

if (import.meta.main) {
  main();
}
