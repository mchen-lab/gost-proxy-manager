#!/bin/bash
# setup_gost_v2.sh

# This script downloads GOST v2.11.5 which is required for this application.
# (Homebrew installs v3.x which has a different API and is incompatible).

GOST_VERSION="2.11.5"
PLATFORM="darwin"
ARCH="arm64" # Assuming Apple Silicon based on 'uname -m' check earlier
URL="https://github.com/ginuerzh/gost/releases/download/v${GOST_VERSION}/gost_${GOST_VERSION}_${PLATFORM}_${ARCH}.tar.gz"
DEST_DIR="./bin"
DEST_FILE="$DEST_DIR/gost"

echo "🛠️  Setting up GOST v${GOST_VERSION}..."

# Create bin directory
mkdir -p "$DEST_DIR"

# Download
echo "⬇️  Downloading from $URL..."
curl -L "$URL" -o gost.tar.gz

if [ $? -ne 0 ]; then
    echo "❌ Download failed."
    echo "   Please manually download the file from:"
    echo "   $URL"
    echo "   Extract it and place the 'gost' binary in $DEST_DIR/gost"
    exit 1
fi

# Extract
echo "📦 Extracting..."
tar -xzf gost.tar.gz
rm gost.tar.gz README* LICENSE* 2>/dev/null

# Move to bin if it extracted to current dir
if [ -f "gost" ]; then
    mv gost "$DEST_FILE"
fi

# Make executable
chmod +x "$DEST_FILE"

echo "✅ GOST v${GOST_VERSION} installed to $DEST_FILE"
echo "   Release: $(./$DEST_FILE -V)"
echo ""
echo "🚀 You can now run ./restart.sh"
