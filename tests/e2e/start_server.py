#!/usr/bin/env python3
"""Start BookSwipe server for E2E tests with proper signal handling."""
import os
import signal
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import server

os.environ['BOOKSWIPE_PORT'] = '3090'
server.RATE_MAX = 10000

h = server.ThreadedHTTP(('127.0.0.1', 3090), server.Handler)
signal.signal(signal.SIGTERM, lambda *_: h.shutdown())
signal.signal(signal.SIGINT, lambda *_: h.shutdown())

print('E2E server starting on http://127.0.0.1:3090')
h.serve_forever()
