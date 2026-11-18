# Jesus Office

Public 3D office: https://office.petrushandika.com
Source: https://github.com/petrushandika/Jesus-Office

## Textless spatial interface

No visible text, titles, labels, tooltips, loading copy or laptop glyphs on desktop/mobile. Accessible region name remains nonvisual. Drag or one finger orbits through 360 degrees; right-drag or two fingers pan; scroll/pinch zooms. Initial framing fits the whole town to the current aspect ratio; resizing preserves the relative zoom and viewing angle. Keyboard arrows pan, +/- zoom, 0 reset, Enter selects a visual ring, Escape clears it. Perspective camera, open-roof rooms and original procedural stone materials. The canvas tracks the full dynamic viewport with no document scrollbar. Pan and zoom-out have no artificial city-edge clamps; a view-following ground prevents slab edges. Minimum dolly distance and above-ground tilt remain to prevent inverted/below-ground views. The authored town is finite, not an infinitely generated city. Eight distinct volumetric civic/market/garden landmarks supplement the homes and live-worker core; ambient architecture does not represent additional agents.

## Ambient citizens

Jesus Office includes decorative NPC citizens walking around the town, pausing and carrying baskets or staffs. They are not AI agents, never use laptops, never display task output and never enter the worker-room routes. Their animation is intentionally independent of `/api/agents`; an API outage freezes real workers but does not mean ambient citizens must disappear. Reduced-motion and hidden-tab pause freeze NPC poses. Inspection metadata explicitly marks them decorative; no visible UI text is added.

## Observed activity, not decorative worker loops

The frontend polls `/api/agents` every three seconds. Sanitized Hermes delegation manifests/logs provide run/task identity, tool name, timestamps and state. Seven visual slots bind stably to real running tasks; these are visual personas, not claims of seven configured named agents. More than seven simultaneous workers cannot all be represented by this scene.

Distinct observed tool events (run, tool, timestamp and count) initiate door/lane/different-room routes. Identical polling responses never retrigger a trip; observations during travel are consumed rather than queued. Typing represents observed explicit file-edit tools; reading, thinking and waiting have separate poses. A completed tool observation remains visible up to eight seconds so polling can capture it. This is visualization of recently observed activity, not proof that a tool is still executing. File-edit tools do not guarantee that the file contains source code. Terminal is not automatically classified as coding. Inactive, disconnected, stale or completed workers freeze all body/head/limb transforms, not just translation. A 120-second transcript silence threshold is conservative freshness, not a process-liveness guarantee.

No invented pairwise conversation: this source does not provide structured sender/recipient/message events. No fake speech bubbles. Routing between work areas is a spatial interpretation of tool categories, not a claim of real agent-to-agent dispatch. New tool events in the same category can trigger another trip after arrival. A replacement worker retains spatial position without teleporting but cancels the previous worker route and plans only from its own observed event. Ambient trees/water are decorative only. Laptop bars never show actual source or secrets.

## Operations: report first, human approval, then read-only execution

`operations/` is a stdlib Python service (`python3 operations/server.py`, loopback `:18160`, bearer `OFFICE_OPS_TOKEN`). Every 15 minutes it reads failed GitHub Actions runs (repo allowlist `OFFICE_REPOS`; TradeGenZ denied), Jira (`OFFICE_JIRA_JQL`) and Techcare (`OFFICE_TECHCARE_ASSIGNEE`). First poll imports at most 3 items per source; older backlog is marked seen. Each task: read-only evidence → Astronacci 9Router analysis (`OFFICE_LLM_MODEL` comma list = fallback order, hourly budget) → documenter report → `awaiting_approval`. Nothing further runs until a human approves the exact `report_hash` once. Approved work runs only a bounded read-only follow-up (failed job logs, ticket comments) and an implementation plan. Writing code, push/PR, ticket updates and deploys are not implemented. The model never receives tools and cannot approve. Reports are redacted; email goes to the single fixed `OFFICE_REPORT_EMAIL` (SMTP app password or Gmail OAuth). Opening a link never approves.

Private dashboard: `/operations` (operator password, HMAC session, `__Host-` Secure cookie, exact-origin CSRF, `OFFICE_PUBLIC_ORIGIN`). Kill switch: dashboard Pause, `POST /pause`, or file `$OFFICE_OPS_DATA/PAUSE`. Real worker runs (`ops-*`) are merged into `/api/agents` with titles/sources removed, so characters move only while a worker is actually running. Secrets live outside the repo in systemd EnvironmentFiles.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

Current browser acceptance:
- `npc.browser-test.cjs`: exact Jesus Office title, actual full 360-degree input sweep, NPC movement/freeze, full viewport including ultrawide and mobile landscape.
- `textless.browser-test.cjs`: desktop, compact and mobile fullscreen, selection with no labels.
- `city.browser-test.cjs`: actual geometry bounds/volume, eight building types, beyond-city pan and zoom, rear orbit, mobile touch pan/pinch.
- `scene.browser-test.cjs`: perspective orbit/pan/zoom/reset and masonry.
- `runtime.browser-test.cjs`: real `/api/agents` polling, observed run bindings, actual world-space crossings and source-outage stop. Requires a real working delegated task. It does not fabricate manifests or fulfill fake successful API responses.
- `operations.browser-test.cjs`: private API closed without session, CSRF/wrong-password rejection, dashboard styles applied, real connector statuses.
- `ops-motion.browser-test.cjs`: queues one real read-only task and asserts a character bound to the real `ops-*` run physically moves. Uses real 9Router quota.
- `cd operations && python3 -m unittest test_operations` (fixture-only, no network).

Set `OFFICE_PLAYWRIGHT`, `OFFICE_TEST_URL`, `OFFICE_TEST_OUTPUT`. Historical `map`, `motion`, `rooms`, `office` browser scripts target old decorative behavior and are not acceptance for this release. Unit fixtures remain isolated from the live runtime source.

Build standalone output and copy `public` plus `.next/static`. Run `server.js` with `NODE_ENV=production`, loopback HOSTNAME, PORT, OFFICE_RUNS_DIR and OFFICE_GATEWAY_FILE. Verify immutable candidate before switching the service; retain previous release for rollback. No credentials/raw logs in this repository.
