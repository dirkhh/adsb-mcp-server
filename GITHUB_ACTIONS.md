# GitHub Actions for ADS-B MCP Server

This repository includes several GitHub Actions workflows for automated testing, building, and releasing MCP bundles.

## Workflows Overview

### 1. Continuous Integration (`ci.yml`)
**Triggers**: Push to `main`, Pull Requests to `main`
**Purpose**: Run tests, linting, and basic validation

**What it does**:
- ✅ **Multi-Python testing** (Python 3.10, 3.11, 3.12)
- ✅ **Code formatting** (black, isort)
- ✅ **Linting** (flake8, mypy)
- ✅ **Import testing** - Verifies all modules can be imported
- ✅ **Bundle creation test** - Validates MCP bundle can be created
- ✅ **Quality checks** - Looks for TODO/FIXME, print statements, hardcoded paths

### 2. Release Automation (`release.yml`)
**Triggers**: Push of version tags (e.g., `v1.0.0`, `v2.1.3`)
**Purpose**: Automatically create GitHub releases with MCP bundles

**What it does**:
- 🏷️ **Detects version** from git tag
- 🔄 **Updates mcpb.toml** with correct version
- 📦 **Creates MCP bundle** using official `mcpb` tool
- 🚀 **Creates GitHub release** with bundle attached
- 📝 **Generates release notes** with features and installation instructions
- ✅ **Validates bundle** before release

### 3. Bundle Testing (`test-bundle.yml`)
**Triggers**: Pull Requests, Manual dispatch
**Purpose**: Comprehensive testing of MCP bundle creation

**What it does**:
- 🧪 **Tests bundle creation** with official `mcpb` tool
- 📋 **Validates bundle structure** and contents
- 🔍 **Tests mcpb.toml configuration**
- 📊 **Verifies bundle contents** and size
- 🧹 **Cleanup testing** - Ensures no artifacts remain

## How to Use

### Creating a Release

1. **Update version** in your code (if needed)
2. **Create and push a tag**:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```
3. **GitHub automatically**:
   - Detects the tag push
   - Runs the release workflow
   - Creates a GitHub release
   - Attaches the MCP bundle

### Manual Bundle Testing

You can manually trigger bundle testing:
1. Go to **Actions** tab in GitHub
2. Select **"Test MCP Bundle Creation"**
3. Click **"Run workflow"**
4. Choose branch and click **"Run workflow"**

### Checking CI Status

The CI workflow runs automatically on:
- Every push to `main` branch
- Every pull request to `main` branch

Check the **Actions** tab to see:
- ✅ **Green checkmark** = All tests passed
- ❌ **Red X** = Tests failed (check logs)
- 🟡 **Yellow circle** = Tests running

## Workflow Details

### Release Workflow Features

- **Smart versioning**: Automatically extracts version from git tag
- **Bundle validation**: Ensures bundle is created and has reasonable size
- **Release notes**: Auto-generates comprehensive release notes
- **Asset management**: Properly names and uploads MCP bundle
- **Error handling**: Fails gracefully if bundle creation fails

### Bundle Testing Features

- **Comprehensive validation**: Tests all aspects of bundle creation
- **Manifest verification**: Validates JSON structure and required fields
- **Version detection**: Tests git tag parsing and version extraction
- **Content verification**: Ensures all expected files are included
- **Size validation**: Checks bundle isn't suspiciously small

### CI Integration Features

- **Multi-version support**: Tests against Python 3.10, 3.11, 3.12
- **Code quality**: Runs formatting and linting checks
- **Import validation**: Ensures all modules can be imported
- **Bundle testing**: Basic bundle creation validation
- **Quality gates**: Prevents merge of problematic code

## Troubleshooting

### Common Issues

1. **Bundle creation fails**:
   - Check that `create_mcp_bundle.py` is executable
   - Verify all required files exist
   - Check Python dependencies are installed

2. **Release workflow fails**:
   - Ensure tag follows format `v*` (e.g., `v1.0.0`)
   - Check that bundle creation succeeds
   - Verify GitHub token permissions

3. **CI tests fail**:
   - Run `black .` and `isort .` to fix formatting
   - Fix any linting errors reported by flake8/mypy
   - Ensure all imports work correctly

### Debugging

- **Check workflow logs** in the Actions tab
- **Run locally** with `python create_mcp_bundle.py` to test bundle creation
- **Validate manually** by extracting and checking bundle contents

## Customization

### Adding New Tests

To add new tests to CI:
```yaml
- name: Your New Test
  run: |
    # Your test commands here
    echo "✅ New test passed"
```

### Modifying Release Process

To customize releases:
- Edit `.github/workflows/release.yml`
- Modify release notes template
- Add additional validation steps
- Customize bundle naming

### Bundle Contents

To modify what's included in bundles:
- Edit `create_mcp_bundle.py`
- Update `get_files_to_include()` function
- Modify file filtering logic

## Best Practices

1. **Always test locally** before pushing tags
2. **Use semantic versioning** for tags (v1.0.0, v1.1.0, v2.0.0)
3. **Review release notes** before publishing
4. **Keep workflows simple** and focused
5. **Monitor CI status** and fix issues promptly

## Support

For workflow issues:
- Check GitHub Actions documentation
- Review workflow logs for specific errors
- Test bundle creation locally first
- Ensure all dependencies are properly specified
