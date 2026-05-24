import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'packages/angular-scan/src/public-api.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outDir: 'packages/angular-scan/dist',
    sourcemap: true,
    external: ['@angular/core', '@angular/common']
  },
  {
    entry: { 'auto.global': 'packages/angular-scan/src/auto.ts' },
    format: ['iife'],
    globalName: 'AngularScan',
    sourcemap: true,
    outDir: 'packages/angular-scan/dist',
    external: ['@angular/core', '@angular/common'],
    noExternal: []
  }
]);
