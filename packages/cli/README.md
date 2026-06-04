# angular-render-scan-cli

CLI installer for [angular-render-scan](https://www.npmjs.com/package/angular-render-scan).

## Usage

```sh
npx angular-render-scan-cli init
```

The CLI detects Angular CLI and Nx workspaces (`angular.json`, `workspace.json`, `nx.json`, or `project.json`), finds your `main.ts` or `app.config.ts`, installs `angular-render-scan`, and injects `provideAngularRenderScan()` into your Angular providers.

## Options

```sh
npx angular-render-scan-cli init --dry-run
npx angular-render-scan-cli init --script-tag
npx angular-render-scan-cli --help
```

- `--dry-run`: preview changes without writing files.
- `--script-tag`: add the CDN script tag instead of provider setup.
- `--force`: patch even if `angular-render-scan` is already present.

## Docs

https://github.com/edisonaugusthy/angular-render-scan
