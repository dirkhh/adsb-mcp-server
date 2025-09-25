#!/usr/bin/env node
/**
 * Custom version script that properly handles manifest.json sync
 * This ensures the tag points to the correct commit with both files updated
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function bumpVersion(versionType) {
  try {
    // Read current package.json
    const packageJsonPath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;

    // Parse version
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    let newVersion;

    switch (versionType) {
      case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
      case 'patch':
      default:
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
    }

    // Update package.json
    packageJson.version = newVersion;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    console.log(`📦 Updated package.json: ${currentVersion} → ${newVersion}`);
    return newVersion;
  } catch (error) {
    console.error('❌ Failed to bump version:', error.message);
    process.exit(1);
  }
}

function syncManifestVersion(version) {
  try {
    // Read manifest.json
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    const oldVersion = manifest.version;
    manifest.version = version;

    // Write updated manifest.json
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    console.log(`🔄 Synced manifest.json: ${oldVersion} → ${version}`);
  } catch (error) {
    console.error('❌ Failed to sync manifest version:', error.message);
    process.exit(1);
  }
}

function main() {
  const versionType = process.argv[2] || 'patch';

  console.log(`🚀 Starting version bump: ${versionType}`);

  // Step 1: Bump version in package.json
  const packageJsonPath = join(projectRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const oldVersion = packageJson.version;

  const newVersion = bumpVersion(versionType);

  // Step 2: Sync manifest.json with new version
  syncManifestVersion(newVersion);

  // Step 3: Update package-lock.json to match new version
  console.log('📦 Updating package-lock.json...');
  execSync('npm install --package-lock-only', { stdio: 'inherit' });

  // Step 4: Commit the changed files
  console.log('💾 Committing version changes...');
  execSync('git add package.json package-lock.json manifest.json', { stdio: 'inherit' });
  execSync(`git commit -m "bump version from ${oldVersion} to ${newVersion}"`, { stdio: 'inherit' });

  // Step 4: Create git tag
  console.log('🏷️  Creating git tag...');
  execSync(`git tag -a v${newVersion} -m "bump version from ${oldVersion} to ${newVersion}"`, { stdio: 'inherit' });

  console.log(`✅ Version bump complete: v${newVersion}`);
  console.log('📤 Run: git push --follow-tags');
}

if (import.meta.main) {
  main();
}
