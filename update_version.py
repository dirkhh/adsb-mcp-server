#!/usr/bin/env python3
"""
Script to update the version in mcpb.toml based on the latest git tag
"""

import json
import subprocess
import sys
from pathlib import Path


def get_version_from_git() -> str:
    """Get the latest git tag as version"""
    try:
        result = subprocess.run(["git", "describe", "--tags", "--abbrev=0"], capture_output=True, text=True, check=True)
        version = result.stdout.strip()

        # Remove 'v' prefix if present
        if version.startswith("v"):
            version = version[1:]

        return version
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "1.0.0"


def update_manifest_version(version: str) -> None:
    """Update the version in manifest.json"""
    manifest_file = Path("manifest.json")

    if not manifest_file.exists():
        print("Error: manifest.json not found!")
        sys.exit(1)

    # Read the file
    with open(manifest_file, "r") as f:
        manifest = json.load(f)

    # Update the version
    old_version = manifest.get("version", "unknown")
    manifest["version"] = version

    # Write the file back
    with open(manifest_file, "w") as f:
        json.dump(manifest, f, indent=2)

    if old_version != version:
        print(f"Updated manifest.json version from {old_version} to: {version}")
    else:
        print(f"Version in manifest.json is already: {version}")


def main():
    """Main entry point"""
    version = get_version_from_git()
    update_manifest_version(version)


if __name__ == "__main__":
    main()
