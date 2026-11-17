# Jesus-Office

Public 3D office: https://office.petrushandika.com
Source: https://github.com/petrushandika/Jesus-Office

## Textless spatial interface

No visible text, titles, labels, tooltips, loading copy or laptop glyphs on desktop/mobile. Accessible region name remains nonvisual. Drag pans, right-drag or two-finger gesture orbits, scroll/pinch zooms. Keyboard arrows pan, +/- zoom, 0 reset, Enter selects a visual ring, Escape clears it. Perspective camera, open-roof rooms and original procedural stone materials.

## Observed activity, not decorative worker loops

The frontend polls `/api/agents` every three seconds. Sanitized Hermes delegation manifests/logs provide run/task identity, tool name, timestamps and state. Seven visual slots bind stably to real running tasks; these are visual personas, not claims of seven configured named agents. More than seven simultaneous workers cannot all be represented by this scene.

Distinct observed tool events (run, tool, timestamp and count) initiate door/lane/different-room routes. Identical polling responses never retrigger a trip; observations during travel are consumed rather than queued. Typing represents observed explicit file-edit tools; reading, thinking and waiting have separate poses. A completed tool observation remains visible up to eight seconds so polling can capture it. This is visualization of recently observed activity, not proof that a tool is still executing. File-edit tools do not guarantee that the file contains source code. Terminal is not automatically classified as coding. Inactive, disconnected, stale or completed workers freeze all body/head/limb transforms, not just translation. A 120-second transcript silence threshold is conservative freshness, not a process-liveness guarantee.

No invented pairwise conversation: this source does not provide structured sender/recipient/message events. No fake speech bubbles. Routing between work areas is a spatial interpretation of tool categories, not a claim of real agent-to-agent dispatch. New tool events in the same category can trigger another trip after arrival. A replacement worker retains spatial position without teleporting but cancels the previous worker route and plans only from its own observed event. Ambient trees/water are decorative only. Laptop bars never show actual source or secrets.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

Current browser acceptance:
- `textless.browser-test.cjs`: desktop, compact and mobile fullscreen, selection with no labels.
- `scene.browser-test.cjs`: perspective orbit/pan/zoom/reset and masonry.
- `runtime.browser-test.cjs`: real `/api/agents` polling, observed run bindings, actual world-space crossings and source-outage stop. Requires a real working delegated task. It does not fabricate manifests or fulfill fake successful API responses.

Set `OFFICE_PLAYWRIGHT`, `OFFICE_TEST_URL`, `OFFICE_TEST_OUTPUT`. Historical `map`, `motion`, `rooms`, `office` browser scripts target old decorative behavior and are not acceptance for this release. Unit fixtures remain isolated from the live runtime source.

Build standalone output and copy `public` plus `.next/static`. Run `server.js` with `NODE_ENV=production`, loopback HOSTNAME, PORT, OFFICE_RUNS_DIR and OFFICE_GATEWAY_FILE. Verify immutable candidate before switching the service; retain previous release for rollback. No credentials/raw logs in this repository.
