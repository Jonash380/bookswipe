#!/bin/bash
# Migrate all test files from jsdom to happy-dom
cd /home/jonas/Documents/bookswipe

for f in tests/*.test.js; do
  # Replace jsdom import with happy-dom
  sed -i "s/import { JSDOM } from 'jsdom';/import { Window } from 'happy-dom';/" "$f"
  
  # Replace JSDOM constructor pattern with Window pattern
  # Pattern: const dom = new JSDOM('<!DOCTYPE html>...', { url: '...', pretendToBeVisual: true, });
  # With:    const window = new Window({ url: 'http://localhost' });
  sed -i "s/const dom = new JSDOM('<!DOCTYPE html><html><body><\/body><\/html>', {$/const window = new Window({/" "$f"
  sed -i "s/const dom = new JSDOM('<!DOCTYPE html><div id=\"card\"><\/div>', {$/const window = new Window({/" "$f"
  
  # Remove pretendToBeVisual lines and close the constructor
  sed -i "/pretendToBeVisual: true,/d" "$f"
  sed -i "s/  url: 'http:\/\/localhost',/  url: 'http:\/\/localhost'/" "$f"
  sed -i "s/  url: 'http:\/\/localhost'$/  url: 'http:\/\/localhost'});/" "$f"
  
  # Replace dom.window references with window directly
  sed -i "s/global\.window = dom\.window;/global.window = window;/" "$f"
  sed -i "s/global\.document = dom\.window\.document;/global.document = window.document;/" "$f"
  sed -i "s/global\.performance = dom\.window\.performance;/global.performance = window.performance;/" "$f"
  
  echo "Migrated: $f"
done
