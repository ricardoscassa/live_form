# Camera recovery regression checks

From this directory, run `npm install`, `npx playwright install chromium webkit`,
then `npm test`. The script starts and closes its own local HTTP server and uses
isolated browser profiles; it does not touch inspection data in your browser.

An existing Playwright installation can be selected with `PLAYWRIGHT_MODULE`.
Optional `CHROMIUM_EXECUTABLE_PATH` and `WEBKIT_EXECUTABLE_PATH` select browser
binaries. `APP_ROOT` can point to another checkout for regression comparisons.

The checks exercise ECS camera recovery across multiple rows, missing lifecycle
events, an immediate tap after focus, abandoned pickers, delayed file delivery,
slow file reads, cancellation, retaking, IndexedDB persistence, and idle resume.
Chromium also performs an offline reload and saves a photo offline. WebKit checks
the offline cache; it does not claim a native iOS offline or camera test.

These are desktop browser tests using injected images and simulated suspension.
Before claiming the native phone issue is resolved, also test the installed app
on the affected phone after overnight suspension, including airplane mode,
multiple ECS rows, cancellation, retaking, saving, and reopening saved photos.
