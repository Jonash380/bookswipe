#!/bin/bash
# Auto-sync script: stash local changes, pull from GitHub, restore
cd /home/jonas/Projects/bookswipe || exit 1

# Check if there are local changes
if ! git diff --quiet HEAD 2>/dev/null; then
  git stash --quiet
  git pull --quiet
  git stash pop --quiet 2>/dev/null
else
  git pull --quiet
fi
