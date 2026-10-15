# Weekly workflow and camera regression checks

From this directory, run `npm install`, `npx playwright install chromium webkit`,
then `npm test`. The scripts start and close their own local HTTP servers and use
isolated browser profiles; they do not touch inspection data in your browser.

The default target is `testing/index.html`. `npm run test:core` checks parsing,
building/room/commodity scope, workflow mappings, fixed/variable gates and data
validation. `npm run test:weekly` exercises the real setup, cards, configuration,
manual additions, CSV/photo exports, recovery/rollback and sharing in Chromium and
WebKit. It writes `weekly-results.json`. `npm run test:camera` runs the existing
camera recovery checks against that same test application.

An existing Playwright or Playwright Core installation can be selected with `PLAYWRIGHT_MODULE`.
Optional `CHROMIUM_EXECUTABLE_PATH` and `WEBKIT_EXECUTABLE_PATH` select browser
binaries. `APP_ROOT` can point to another checkout for regression comparisons.
`APP_ENTRY` changes the camera suite's entry file. `SCREENSHOT_DIR` writes desktop
and mobile workflow screenshots. `TEST_FILTER` runs matching weekly browser cases
while diagnosing a failure; remove it for the complete verification report.

The checks exercise ECS camera recovery across multiple rows, missing lifecycle
events, an immediate tap after focus, abandoned pickers, delayed file delivery,
slow file reads, cancellation, retaking, IndexedDB persistence, and idle resume.
Chromium also performs an offline reload and saves a photo offline. WebKit checks
the offline cache; it does not claim a native iOS offline or camera test.

These are desktop browser tests using injected images and simulated suspension.
Before claiming the native phone issue is resolved, also test the installed app
on the affected phone after overnight suspension, including airplane mode,
multiple ECS rows, cancellation, retaking, saving, and reopening saved photos.
