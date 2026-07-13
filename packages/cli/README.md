# angular-render-scan-cli

CLI installer and CI report generator for [angular-render-scan](https://www.npmjs.com/package/angular-render-scan).

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

## CI performance report

Save the `InteractionReport` returned by `report.interactionReport()` in a Playwright test, then render or compare it:

```sh
npx angular-render-scan-cli report --input candidate.json --format markdown
npx angular-render-scan-cli report \
  --input candidate.json \
  --baseline baseline.json \
  --github-summary \
  --fail-on-regression
```

`--format` accepts `markdown`, `html`, or `json`; `--output` writes to a file. In GitHub Actions, `--github-summary` appends the result to the job summary. `--fail-on-regression` exits with status 1 when total or maximum cycle time rises more than 10%, no-mutation check share rises more than 5 points, or new budget violations appear.

## Docs

https://github.com/edisonaugusthy/angular-render-scan
