#!/bin/sh

# Turn on job control
set -m

# Start Node Manager (which will launch GOST)
echo "Starting Manager..."

# Wait for GOST to be ready (simple check)
sleep 2

# Start Node Manager
echo "Starting Manager..."
# Pass default env vars if not set, but allow override
export GOST_API_URL=${GOST_API_URL:-http://localhost:31132}
export GOST_PROXY_URL=${GOST_PROXY_URL:-http://localhost:31131}

node dist-server/server/index.js &

# Wait for any process to exit
wait -n
  
# Exit with status of process that exited first
exit $?
