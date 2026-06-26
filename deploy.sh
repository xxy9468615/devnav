#!/bin/bash
# DevNav Server Deployment Script
# Usage: bash deploy.sh

set -e

APP_DIR="/opt/devnav"
PORT=4321

echo "=== DevNav Deployment ==="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js not found"
    exit 1
fi

echo "Node: $(node -v)"

# Navigate to app directory
cd "$APP_DIR"

# Install dependencies
echo "Installing dependencies..."
npm install --production=false

# Build the project
echo "Building..."
npm run build

# Install only production deps for runtime
npm install --production

# Setup PM2
echo "Starting with PM2..."
if command -v pm2 &> /dev/null; then
    pm2 stop devnav 2>/dev/null || true
    pm2 delete devnav 2>/dev/null || true
    pm2 start ecosystem.config.json
    pm2 save
    echo "PM2 process started. Check: pm2 status"
else
    echo "PM2 not found. Starting with node directly..."
    echo "Run: node dist/server/entry.mjs"
fi

# Setup cron for data fetching
echo ""
echo "=== Cron Setup ==="
echo "Add this to your crontab (crontab -e):"
echo "17 * * * * cd $APP_DIR && node scripts/fetch-all.mjs >> /var/log/devnav-fetch.log 2>&1"
echo ""
echo "Or run manually: cd $APP_DIR && npm run fetch"

echo ""
echo "=== Done! ==="
echo "DevNav running at http://localhost:$PORT"
