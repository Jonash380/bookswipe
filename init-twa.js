const {init} = require('@bubblewrap/cli');
const path = require('path');

async function main() {
  const manifestPath = 'http://localhost:3000/static/manifest.json';
  const directory = path.resolve(__dirname, 'twa');
  
  const args = {
    manifestUrl: new URL(manifestPath),
    directory: directory,
  };
  
  await init(args);
  console.log('TWA project initialized successfully');
}

main().catch(console.error);
