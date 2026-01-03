#!/bin/bash

# Build and publish script for gost-proxy-manager Docker image
# Supports multi-platform build for amd64 and arm64

set -e  # Exit on any error

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running or not accessible."
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Image names
GHCR_IMAGE="ghcr.io/mchen-lab/gost-proxy-manager"
DOCKERHUB_IMAGE="xychenmsn/gost-proxy-manager"
INPUT_TAG="${1:-dev}"

# Tag logic
TAGS=""
# Helper to add tags
add_tag() {
    local tag=$1
    TAGS="$TAGS -t $GHCR_IMAGE:$tag -t $DOCKERHUB_IMAGE:$tag"
}

if [[ "$INPUT_TAG" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    MAJOR="${BASH_REMATCH[1]}"
    MINOR="${BASH_REMATCH[2]}"
    PATCH="${BASH_REMATCH[3]}"
    VERSION="$MAJOR.$MINOR.$PATCH"
    
    echo "Detected version tag: v$VERSION"
    add_tag "$VERSION"
    add_tag "$MAJOR.$MINOR"
    add_tag "$MAJOR"
    add_tag "latest"
else
    # Just use the input tag as is (e.g. "dev", "v1.0.0-rc1")
    add_tag "$INPUT_TAG"
fi

echo "=== 🐳 Building gost-proxy-manager ==="
echo "Tags to push:"
echo "$TAGS" | sed 's/-t //g' | tr ' ' '\n'

echo "Checking for Docker Buildx..."
if ! docker buildx inspect gost-manager-builder > /dev/null 2>&1; then
    echo "Creating new buildx builder..."
    docker buildx create --name gost-manager-builder --use
    docker buildx inspect --bootstrap
else
    echo "Using existing buildx builder."
    docker buildx use gost-manager-builder
fi

echo "Building and pushing multi-platform image..."
echo "Platforms: linux/amd64, linux/arm64"

# Generate build metadata
BUILD_META="-dev-$(date +%Y%m%d)"
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "Build Metadata: $BUILD_META"
echo "Commit Hash: $COMMIT_HASH"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg BUILD_METADATA="$BUILD_META" \
  --build-arg GIT_COMMIT="$COMMIT_HASH" \
  --build-arg GIT_COMMIT="$COMMIT_HASH" \
  $TAGS \
  --push \
  .

echo ""
echo "✅ Build and publish completed successfully!"
echo "   Images pushed to:"
echo "✅ Build and publish completed successfully!"
echo "   Images pushed with tags derived from: $INPUT_TAG"
