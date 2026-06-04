#!/usr/bin/env node
// Entry point for `npx angular-render-scan`
// This thin shim imports the compiled TypeScript and calls run().

import { run } from '../dist/index.js';

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
