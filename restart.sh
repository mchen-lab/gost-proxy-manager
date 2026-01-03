#!/bin/bash

# Get the absolute path of the project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if node_modules exists (dependencies installed)
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo "❌ Error: node_modules not found. Please run 'npm install' from the root directory first."
    # Optional: auto-install?
    # echo " इंस्टॉलिंग dependencies..."
    # npm install
    exit 1
fi

# Function to kill process on a specific port
kill_port() {
    local port=$1
    local process_name=$2

    echo "Checking for existing $process_name processes on port $port..."
    local pids=$(lsof -ti :$port -sTCP:LISTEN 2>/dev/null)
    
    if [ ! -z "$pids" ]; then
        echo "Found existing process(es) (PIDs:$pids) on port $port. Killing..."
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# start_gost function removed (Node.js manager handles process)

start_app() {
    echo "🚀 Starting Manager App (Dev Mode)..."
    
    # Ensure logs directory exists
    mkdir -p "$PROJECT_ROOT/logs"

    # Start dev server (Concurrent for backend + frontend usually)
    # package.json 'dev' runs 'vite', 'dev:server' runs 'tsx watch'
    # We need to run both?
    # Usually 'npm run dev' implies full stack dev if configured, but here:
    # "dev": "vite" (frontend only)
    # "dev:server": "tsx watch src/server/index.ts" (backend)
    
    echo "   Starting Backend..."
    npm run dev:server > "$PROJECT_ROOT/logs/backend.log" 2>&1 &
    BACKEND_PID=$!
    
    echo "   Starting Frontend (Vite)..."
    npm run dev > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
    FRONTEND_PID=$!

    echo "✅ Manager started!"
    echo "   - Backend PID: $BACKEND_PID"
    echo "   - Frontend PID: $FRONTEND_PID"
}

# Trap function to kill processes
cleanup() {
    echo ""
    echo "Cleaning up..."
    if [ ! -z "$GOST_PID" ]; then kill $GOST_PID 2>/dev/null; fi
    if [ ! -z "$BACKEND_PID" ]; then kill $BACKEND_PID 2>/dev/null; fi
    if [ ! -z "$FRONTEND_PID" ]; then kill $FRONTEND_PID 2>/dev/null; fi
    exit 0
}

trap cleanup INT TERM EXIT

# --- Main Execution ---

echo "🛑 Stopping any existing processes..."
kill_port 31130 "Frontend/Backend"
kill_port 31131 "GOST Proxy"
kill_port 31132 "GOST API"

echo ""
echo "🎯 Starting Development Environment..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🔎 Resolving GOST binary path..."
export GOST_BINARY_PATH=""

# Check common locations
if [ -f "$PROJECT_ROOT/bin/gost" ]; then
    export GOST_BINARY_PATH="$PROJECT_ROOT/bin/gost"
elif command -v gost >/dev/null 2>&1; then
    export GOST_BINARY_PATH=$(command -v gost)
fi

if [ -z "$GOST_BINARY_PATH" ]; then
    echo "⚠️  GOST binary not found in ./bin/gost or PATH."
    echo "   The manager UI might show errors connecting to proxy service."
else
    echo "✅ Found GOST: $GOST_BINARY_PATH"
fi

# Export ports for local dev
export PORT=31130
export GOST_PROXY_URL=http://localhost:31131
export GOST_API_URL=http://localhost:31132

start_app

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Environment is running!"
echo "   - Frontend: http://localhost:5173 (Default Vite)"
echo "   - Backend:  http://localhost:31130"
echo "   - GOST API: http://localhost:31132"
echo ""
echo "Logs are being written to ./logs/"
echo "Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Keep script running
wait
