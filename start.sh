#!/bin/bash
# BookSwipe Launcher
# Usage: ./start.sh
# Optional env vars: TMDB_API_KEY, TRAKT_API_KEY, BOOKSWIPE_PORT, BOOKSWIPE_BIND

cd "$(dirname "$0")"

# Kill existing instance
pkill -f "python3.*server.py" 2>/dev/null
sleep 0.5

# Check for TMDB key
if [ -z "$TMDB_API_KEY" ]; then
  echo "⚠️  TMDB_API_KEY not set. TMDB features (movies/TV) will not work."
  echo "   Set it: export TMDB_API_KEY=your_key"
  echo ""
fi

PORT="${BOOKSWIPE_PORT:-3000}"
BIND="${BOOKSWIPE_BIND:-127.0.0.1}"

echo "🎬 BookSwipe starting on http://${BIND}:${PORT}"
python3 server.py &
sleep 1

# Check if server started
if curl -s "http://${BIND}:${PORT}/" > /dev/null 2>&1; then
  echo "✅ Server running at http://${BIND}:${PORT}"
  echo "   Open this URL in your browser"
else
  echo "❌ Server failed to start. Check server.log for details."
  cat server.log 2>/dev/null
fi
