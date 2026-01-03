#!/bin/bash
set -e

# Help / Usage
if [ "$1" == "--help" ]; then
    echo "Usage: ./release.sh [patch|minor|major|<version>]"
    echo "       ./release.sh           # Re-release current version"
    exit 0
fi

BUMP_TYPE=$1

# 1. Ensure git is clean
if [[ -n $(git status -s) ]]; then
    echo "❌ Error: Git working directory is not clean. Please commit or stash changes first."
    exit 1
fi

# 2. Ensure we're on the main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ Error: You must be on the 'main' branch to release. Currently on '$CURRENT_BRANCH'."
    exit 1
fi

# 3. Ensure local main is up-to-date with remote
echo "🔄 Fetching latest from origin..."
git fetch origin main
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "❌ Error: Local 'main' is not in sync with 'origin/main'."
    echo "   Local:  $LOCAL_COMMIT"
    echo "   Remote: $REMOTE_COMMIT"
    echo "   Please run 'git pull' or 'git push' first."
    exit 1
fi

if [ -z "$BUMP_TYPE" ]; then
    echo "=== 🚀 Re-Releasing Current Version ==="
    # Read version from package.json
    VERSION_NUM=$(node -p "require('./package.json').version")
    echo "ℹ️  Current version: $VERSION_NUM"
    FORCE_RE_RELEASE="true"
else
    echo "=== 🚀 Starting Release: $BUMP_TYPE ==="
    
    # 2. Bump version
    NEW_VERSION=$(npm version $BUMP_TYPE --no-git-tag-version)
    VERSION_NUM=${NEW_VERSION#v}
    echo "📝 Bumped version to $VERSION_NUM"
fi

# 3. Git Commit and Tag
echo "📦 Committing and Tagging..."
git add package.json package-lock.json

# Only commit if there are changes
if ! git diff-index --quiet HEAD; then
    git commit -m "chore: release v$VERSION_NUM" || echo "⚠️  Nothing to commit."
else
    echo "ℹ️  No changes to commit (version unchanged)."
fi

TAG_NAME="v$VERSION_NUM"

# If this is a re-release (no bump arg), we might need to purge the old tag to trigger CI
if [ "$FORCE_RE_RELEASE" = "true" ]; then
    echo "🔥 Re-release mode: Removing existing tag '$TAG_NAME' from remote and local..."
    git push origin --delete "$TAG_NAME" || echo "   (Remote tag didn't exist or failed to delete)"
    git tag -d "$TAG_NAME" || echo "   (Local tag didn't exist)"
fi

# Create tag
git tag -f -a "$TAG_NAME" -m "Release $TAG_NAME"

echo "✅ Created local tag: $TAG_NAME"

# 4. Push to Remote
echo "⬆️  Pushing to origin..."
git push origin main
git push origin "$TAG_NAME"

echo ""
echo "🎉 Release $TAG_NAME completed successfully!"
echo "   - package.json updated"
echo "   - Git tag pushed (CI should trigger)"
