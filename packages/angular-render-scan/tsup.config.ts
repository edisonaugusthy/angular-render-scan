import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'packages/angular-render-scan/src/public-api.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outDir: 'packages/angular-render-scan/dist',
    sourcemap: true,
    external: ['@angular/core', '@angular/common']
  },
  {
    entry: { 'auto.global': 'packages/angular-render-scan/src/infrastructure/angular/auto.ts' },
    format: ['iife'],
    globalName: 'AngularRenderScan',
    sourcemap: true,
    outDir: 'packages/angular-render-scan/dist',
    external: ['@angular/core', '@angular/common'],
    noExternal: []
  }
]);
