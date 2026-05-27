import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'auto.global': 'packages/angular-render-scan/src/infrastructure/angular/auto.ts' },
    format: ['iife'],
    globalName: 'AngularRenderScan',
    sourcemap: true,
    outDir: 'packages/angular-render-scan/dist',
    clean: false,
    external: ['@angular/core', '@angular/common'],
    noExternal: []
  }
]);
