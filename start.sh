#!/bin/bash
# BookSwipe Launcher v3
# Usage: ./start.sh
# Optional env vars: TMDB_API_KEY, TRAKT_API_KEY, BOOKSWIPE_PORT, BOOKSWIPE_BIND
# For daemon mode: BOOKSWIPE_DAEMON=1 ./start.sh

cd "$(dirname "$0")"

# Load API keys from .env file (create one with your keys to enable TMDB/Trakt/IGDB)
if [ -f .env ]; then
  source .env
fi

# Check for TMDB key
if [ -z "$TMDB_API_KEY" ]; then
  echo "⚠️  TMDB_API_KEY not set. TMDB features (movies/TV) will not work."
  echo "   Set it: export TMDB_API_KEY=your_key"
  echo ""
fi

PORT="${BOOKSWIPE_PORT:-3000}"
BIND="${BOOKSWIPE_BIND:-127.0.0.1}"

echo "🎬 BookSwipe v3 starting on http://${BIND}:${PORT}"
echo "   Press Ctrl+C to stop"
echo ""

# Run in foreground (Ctrl+C to stop)
exec python3 server.py
