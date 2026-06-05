#!/bin/bash
# Auto-sync script: stash local changes, pull from GitHub, restore
cd /home/jonas/Projects/bookswipe || exit 1

# Check if there are local changes
if ! git diff --quiet HEAD 2>/dev/null; then
  if git stash --quiet; then
    git pull --quiet
    git stash pop --quiet 2>/dev/null || echo "WARNING: stash pop had conflicts. Run: git stash list" >&2
  else
    git pull --quiet
  fi
else
  git pull --quiet
fi
