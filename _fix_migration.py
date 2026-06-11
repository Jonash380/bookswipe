#!/usr/bin/env python3
"""Fix the broken jsdom->happy-dom migration in test files."""
import glob
import re

for f in glob.glob('tests/*.test.js'):
    with open(f) as fh:
        content = fh.read()
    
    # Fix the broken pattern where we have an extra });
    # Pattern: url: 'http://localhost'});
    # });  <-- extra closing
    content = content.replace(
        "  url: 'http://localhost'});\n});",
        "  url: 'http://localhost',\n});"
    )
    
    # Also fix: const window = new Window({ on same line as HTML
    # Pattern: const dom = new JSDOM('<!DOCTYPE html>...', {
    # Should be gone already, but check for any remaining JSDOM refs
    content = content.replace("from 'jsdom'", "from 'happy-dom'")
    content = content.replace("{ JSDOM }", "{ Window }")
    
    # Fix: new JSDOM( -> new Window(  (if any remain)
    # But we need to transform the constructor call pattern
    # new JSDOM('<!DOCTYPE html>...', { url: '...', pretendToBeVisual: true })
    # -> new Window({ url: '...' })
    
    # Replace remaining JSDOM patterns
    content = re.sub(
        r"const dom = new Window\('<!DOCTYPE html><html><body></body></html>', \{\s*\n\s*url: 'http://localhost',\s*\n\s*pretendToBeVisual: true,\s*\n\s*\}\);",
        "const window = new Window({\n  url: 'http://localhost',\n});",
        content
    )
    content = re.sub(
        r"const dom = new Window\('<!DOCTYPE html><div id=\"card\"></div>', \{\s*\n\s*url: 'http://localhost',\s*\n\s*pretendToBeVisual: true,\s*\n\s*\}\);",
        "const window = new Window({\n  url: 'http://localhost',\n});",
        content
    )
    
    # Replace dom.window references
    content = content.replace("global.window = dom.window;", "global.window = window;")
    content = content.replace("global.document = dom.window.document;", "global.document = window.document;")
    content = content.replace("global.performance = dom.window.performance;", "global.performance = window.performance;")
    
    # Replace window.getComputedStyle from dom.window
    content = content.replace("global.window.getComputedStyle", "global.window.getComputedStyle")
    
    with open(f, 'w') as fh:
        fh.write(content)
    
    print(f"Fixed: {f}")
