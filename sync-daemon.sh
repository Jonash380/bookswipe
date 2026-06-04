#!/bin/bash
# Auto-sync daemon: pulls from GitHub every 5 minutes
cd /home/jonas/Projects/bookswipe || exit 1
echo "Auto-sync started at $(date)" >> sync.log
while true; do
  bash sync.sh >> sync.log 2>&1
  sleep 300
done
