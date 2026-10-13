#!/usr/bin/env sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 20+ first: https://nodejs.org/'; exit 1; }
echo 'Open http://127.0.0.1:3000 in your browser.'
node server/index.js
