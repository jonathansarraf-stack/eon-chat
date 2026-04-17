#!/bin/bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║          Eon Chat — Setup             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install Node.js 18+ first:"
  echo "   https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required (found: $(node -v))"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# Check Claude Code
if ! command -v claude &> /dev/null; then
  echo ""
  echo "❌ Claude Code CLI not found. Install it first:"
  echo "   npm install -g @anthropic-ai/claude-code"
  exit 1
fi
echo "✅ Claude Code $(claude --version 2>/dev/null || echo 'installed')"

# Check Claude auth
AUTH_STATUS=$(claude auth status 2>/dev/null || echo '{"loggedIn":false}')
LOGGED_IN=$(echo "$AUTH_STATUS" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).loggedIn)}catch{console.log(false)}})")

if [ "$LOGGED_IN" != "true" ]; then
  echo ""
  echo "⚠️  Claude Code not authenticated. Running 'claude login'..."
  claude login
fi
echo "✅ Claude authenticated"

# Install server dependencies
echo ""
echo "📦 Installing server dependencies..."
cd server
npm install --production
cd ..

# Install app dependencies
echo ""
echo "📦 Installing app dependencies..."
npm install

# Create .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
fi

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║           Setup complete!             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  Start the server:"
echo "    cd server && npm start"
echo ""
echo "  Start the app (in another terminal):"
echo "    npm start"
echo ""
echo "  Then open the Expo URL in your browser or phone."
echo ""
