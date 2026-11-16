# The Fellowship — Agent Office

Private source for https://office.petrushandika.com.

## Experience

Thirteen original stylized 3D personas: Jesus and twelve disciples, using Matthias in place of Judas Iscariot. Robed figures, distinct garment palettes, hair and silhouettes, articulated ambient gestures, a warm office, orbit controls and an accessible roster. Artistic interpretation, not historical likeness or religious authority.

Character animation does **not** claim that an AI worker is executing a task. Real sanitized Hermes telemetry is separate. No arbitrary persona-to-worker assignment is implied. Reduced-motion preferences are respected.

Project catalog UI and catalog data are not included in this release. Retired robot assets are not used.

## Development

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

Use a Node version supporting `--experimental-strip-types` and Next.js 16. Environment options: `OFFICE_RUNS_DIR`, `OFFICE_GATEWAY_FILE`. Missing source data is reported honestly. Never commit credentials or raw runtime logs.

## Browser acceptance

`office.browser-test.cjs` exercises the actual deployed WebGL page, all thirteen roster entries, selection, absence of project UI, API status, mobile width and reduced-motion preference. Set `OFFICE_TEST_URL`, `OFFICE_TEST_OUTPUT` and `OFFICE_PLAYWRIGHT` (path to your installed Playwright package). The fallback path is specific to the deployment host, not a portable dependency.

```sh
OFFICE_PLAYWRIGHT=/absolute/path/to/playwright OFFICE_TEST_URL=http://localhost:3000 node office.browser-test.cjs
```

## Deployment

Build standalone output, then copy `public` and `.next/static` into the corresponding `.next/standalone` locations. Start `server.js` with `NODE_ENV=production`, `HOSTNAME=127.0.0.1` and the configured `PORT`, behind an HTTPS reverse proxy. Production systemd/Nginx configuration and credentials remain outside the repository.

Use immutable release directories; verify the candidate before switching the service. Preserve the previous release for rollback.
