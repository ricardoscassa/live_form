# Weekly inspection — first test build

Open [the test application](https://ricardoscassa.github.io/live_form/testing/). The existing [testing.html link](https://ricardoscassa.github.io/live_form/testing.html) forwards here, including shared-data parameters.

This build retains the existing inspection design, dropdown editor, room navigation, camera, stamps, JSON/sharing and download controls. Its local storage, photo database, recovery database and `/testing/` service worker are separate from the main application. `index.html` and the root `sw.js` are unchanged.

## First walkthrough

1. Choose **ECS Inspection** and **Load example**. The preview should show two planned ECS, one additional ECS and two rooms. One out-of-room row and one wrong-commodity row are discarded.
2. Choose **Start Inspection**. In Room A, select an inspection status and the `2PREP_TACK` gate for ECS-001. Its fixed cumulative percentage becomes 50%.
3. Take a photo, review its stamp and save. The card should show **Ready**. Open ECS-002: the previous card collapses and keeps its values and photo count.
4. Try **+ Add ECS**. Room A offers ELEC-SUPPORT only. An existing code opens its saved card; a new code is marked **Not in weekly plan / Manual** and requires reference review for verified progress.
5. Switch between List and Search, move between rooms, then close/reopen the page. Saved fields and photos should remain.
6. Export CSV, JSON and Photos using the existing buttons. CSV includes recorded work with validation status. Photo ZIPs retain filenames/stamps and contain `inspection_photos/Building - YYYY-MM-DD/` folders based on the London capture date.
7. Return to setup and reset. Open **⋯ → Recovery backups**. Download the archived session, restore it or import its recovery ZIP. Archived work stays outside ordinary active exports.
8. Wait for **Offline ready**, enable airplane mode, reopen the `/testing/` page, save another photo and generate the ZIP. On a phone, save it to OneDrive and verify the extracted folder structure before uploading it later.

## Real pasted data

Weekly-data defines the planned items and exact **Building + Room + Commodity** combinations. The second ECS-data paste adds eligible work outside that plan. Planned duplicates, other rooms/buildings and other commodity types are excluded. Commodities from another loaded room do not grant access in the current room.

Spreadsheet tab-separated rows are preferred. CSV with proper quoting is also supported. Weekly input accepts the previously agreed four-column order:

```text
Week    Building    Commodity       ECS-code
42      1HL4        ELEC-SUPPORT    EXAMPLE-001
```

Room must be supplied on a weekly row or resolved by matching its Building + ECS-code in ECS-data. Use **Year for week numbers** for bare week numbers. Choose one reporting week when multiple weeks are pasted.

ECS-data should include headers such as:

```text
Building    Room       Commodity       ECS-code     GateStatusStructure       GateStatus    PercentComplete
1HL4        ROOM-A     ELEC-SUPPORT    EXAMPLE-001  HPC-BIP-ALL-SUPPORTS      1ENDS_CUT     10
```

Additional columns can include Description and SourceUpdatedAt. The column-mapping panel supports different source headings. Neither input is required to contain an identical set of columns. Missing/conflicting source structure or percentage is retained for review; it cannot silently become verified progress.

## Configuration and retained evidence

**Commodity fields** edits labels, type, options, order, visibility, required/conditional fields and numeric limits. It supports family defaults and commodity overrides. Commodities with several workflow families, such as MECH-PIPE, have separate Pipework and Mechanical profiles. Retiring a field/option preserves existing answers; configuration versions travel in JSON/shared data and remain in the work history.

GateStatus rules are bundled in `gate-config.js`: the 62-rule MPOWER snapshot confirmed on 2 October, the 43 structure/commodity mappings and 19 aliases from the local Production Control V2.9.16 source. ELEC-SUPPORT uses Mechanical fields and All Supports, preserving its raw source structure. Fixed/variable percentage policies are validated centrally. Updating SharePoint does not change this bundled snapshot.

CSV separates source progress from new progress, preserves planned/manual work origin, and excludes untouched candidates from reported work. An invalid progress draft keeps its proposed gate/percentage in Draft columns, while validated NewGateStatus/NewPercent remain blank. JSON retains the complete prepared state and audit metadata. Browser downloads are recorded as **download-started**, not proof of a file saved to OneDrive.

Recovery snapshots contain answers, source records, configuration and full photo bytes, verified with SHA-256 before replacement. Reset only clears active test data. Recovery ZIPs carry a manifest and photo files and can be imported from the recovery menu. This protects against the app's reset/replacement actions; the independent ZIP is needed after browser-data deletion or device loss.

## Verification and device limits

Run the checks from `tests/` as described in its README. `tests/weekly-results.json` records the browser results. The first test covers imports, scope, aliases, gates, percentages, manual additions, collapsible cards, editable requirements, camera saving, exports, reset/rollback, interruption recovery and JSON/sharing.

First verification on 15 October 2026: **60 checks passed** — 16 rule/data tests, 28 workflow browser checks and 16 camera recovery checks. JavaScript parsing and the staged whitespace check also passed. The test dependency is pinned to Playwright 1.61.1 with a lockfile.

Chromium verifies offline reopening and ZIP creation. WebKit verifies the offline shell/dependencies; this host's headless WebKit cannot execute the simulated offline navigation. Desktop camera tests use injected images and suspension events. Actual iOS/Android camera capture, overnight suspension, OneDrive saving and the final Power BI link collection remain device/operational tests.

Bundled JSZip, Pako and QRCode.js have their original licenses in `vendor/`. They are local files so exports/sharing do not require a CDN connection in the field.
