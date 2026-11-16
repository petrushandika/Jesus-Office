# Jesus-Office

Source for Jesus-Office: https://github.com/petrushandika/Jesus-Office.

Live demo: https://office.petrushandika.com.

## Full-screen city map

The 3D world fills the viewport on desktop and mobile. Drag to explore and scroll/pinch to zoom. There are no visible arrow controls, resident lists, or runtime panels. Focus the map to use arrow keys, +/- zoom, 0 reset, Enter to cycle roles, and Escape to clear selection. Decorative conversations and environmental motion are not live agent messages.

Run `map.browser-test.cjs` with the same browser test environment variables to verify viewport coverage, navigation and absence of dashboard controls.

## Experience

Seven role-based visual characters: Yesus (Leader), Petrus (Software Architect), Yohanes (Senior Engineer), Yakobus (QA & Security), Andreas (Research Engineer), Filipus (Product Planner), and Matius (Technical Writer). Original robed figures move between open-roof workrooms in an ancient Judean city inspired by Nazareth/Jerusalem. Artistic interpretation, not historical likeness or religious authority.

Character animation does **not** claim that an AI worker is executing a task. The map does not poll or display runtime telemetry. No arbitrary persona-to-worker assignment is implied. Reduced-motion preferences are respected.

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

`office.browser-test.cjs` exercises the actual deployed WebGL page, role selection, absence of dashboard UI, mobile width and reduced-motion preference. Set `OFFICE_TEST_URL`, `OFFICE_TEST_OUTPUT` and `OFFICE_PLAYWRIGHT` (path to your installed Playwright package). Without an override, tests use a locally installed `@playwright/test` package and write evidence under `test-results/`.

```sh
OFFICE_PLAYWRIGHT=/absolute/path/to/playwright OFFICE_TEST_URL=http://localhost:3000 node office.browser-test.cjs
```

`motion.browser-test.cjs` records real WebGL video and samples actual rendered character transforms under `?inspectScene=1`, checking translated positions, alternating typing hands, and reduced-motion freeze. Code displays are decorative loops, not real project source or execution evidence. Laptops are a deliberate anachronism within the ancient setting.

## Deployment

Build standalone output, then copy `public` and `.next/static` into the corresponding `.next/standalone` locations. Start `server.js` with `NODE_ENV=production`, `HOSTNAME=127.0.0.1` and the configured `PORT`, behind an HTTPS reverse proxy. Production systemd/Nginx configuration and credentials remain outside the repository.

Use immutable release directories; verify the candidate before switching the service. Preserve the previous release for rollback.
