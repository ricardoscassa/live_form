import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.APP_ROOT || fileURLToPath(new URL('../', import.meta.url));
const pngData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const png = { name: 'camera.png', mimeType: 'image/png', buffer: Buffer.from(pngData, 'base64') };
const server = createServer(async (request, response) => {
    try {
        let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const path = resolve(root, `.${pathname}`);
        if (!path.startsWith(resolve(root) + '/') || pathname.includes('/.')) { response.writeHead(403).end(); return; }
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        response.end(await readFile(path));
    } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];

async function prepare(page) {
    await page.goto(origin + '/testing/', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.ProductionUI);
    await page.locator('#codeInspectionBtn').click();
    await page.getByRole('button', { name: 'Load example', exact: true }).click();
    assert.match(await page.locator('#pcImportPreview').innerText(), /1 other commodities/);
    await page.locator('#startCodeInspection').click();
    await page.waitForFunction(() => !!appState.production);
    await page.waitForSelector('.pc-card');
}
async function inspectAndReport(page) {
    const row = page.locator('.pc-card').first();
    await row.locator('button.status-button').first().click();
    await row.locator('.status-option[data-status-index="0"]').first().click();
    await row.locator('[data-production-field="gate"]').selectOption('2PREP_TACK');
    assert.equal(await row.locator('[data-production-field="percent"]').inputValue(), '50');
    assert.equal(await row.locator('[data-production-field="percent"]').getAttribute('readonly'), '');
}
async function takePhoto(page) {
    const picker = page.waitForEvent('filechooser');
    await page.locator('.pc-card').first().locator('.camera-file-input').click();
    await (await picker).setFiles(png);
    await page.waitForFunction(() => !!_stampEditorState && !document.getElementById('stampSaveBtn').disabled);
    await page.locator('#stampSaveBtn').click();
    await page.waitForFunction(async () => (await getAllPhotos()).length > 0);
    await page.waitForFunction(() => document.getElementById('messageTitle').textContent === 'Photo Saved ✓' && document.getElementById('messageModal').classList.contains('active'));
    await page.locator('#messageOk').click();
    await page.evaluate(() => ProductionUI.refreshSummaries());
}

const cases = [
    ['prepare two pastes, enforce room/commodity scope, collapse and restore values', async page => {
        await prepare(page);
        assert.equal(await page.locator('.pc-card').count(), 2);
        assert.deepEqual(await page.evaluate(() => appState.production.items.map(item => item.ecsCode)), ['ECS-001', 'ECS-010', 'ECS-002']);
        await inspectAndReport(page);
        await page.locator('.pc-card').nth(1).locator('.pc-card-header').click();
        assert.equal(await page.locator('.pc-card').first().locator('.pc-card-body').isHidden(), true);
        assert.equal(await page.locator('.pc-card-header[aria-expanded="true"]').count(), 1);
        await page.locator('.pc-card').first().locator('.pc-card-header').click();
        assert.equal(await page.locator('.pc-card').first().locator('[data-production-field="gate"]').inputValue(), '2PREP_TACK');
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('.pc-card');
        assert.equal(await page.evaluate(() => appState.production.items[0].fields.gate), '2PREP_TACK');
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/weekly-desktop.png`, fullPage: true });
    }],
    ['camera save, source metadata and relevant CSV export', async page => {
        await prepare(page); await inspectAndReport(page); await takePhoto(page);
        assert.equal(await page.locator('.pc-card').first().locator('.pc-readiness').innerText(), 'Ready');
        const report = await page.evaluate(async () => {
            const csv = await ProductionUI.exportCsv(false), table = ProductionCore.parseTable(csv, 'ecs');
            const photos = await getAllPhotos();
            return { rows: table.rows, photos: photos.map(photo => ({ building: photo.building, captureDate: photo.captureDate, recordRevision: photo.recordRevision })) };
        });
        assert.equal(report.rows.length, 1);
        assert.equal(report.rows[0].raw.NewGateStatus, '2PREP_TACK');
        assert.equal(report.rows[0].raw.NewPercent, '50');
        assert.equal(report.rows[0].raw.ValidationState, 'Ready');
        assert.equal(report.photos[0].building, '1HL4');
        assert.match(report.rows[0].raw.PhotoRelativePaths, /inspection_photos\/1HL4 - \d{4}-\d{2}-\d{2}\//);
    }],
    ['manual add keeps current room and commodity and avoids duplicates', async page => {
        await prepare(page);
        await page.getByRole('button', { name: '+ Add ECS', exact: true }).click();
        assert.deepEqual(await page.locator('#pcAddCommodity option').allTextContents(), ['ELEC-SUPPORT']);
        await page.locator('#pcAddCode').fill('EXTRA-001');
        await page.getByRole('button', { name: 'Add and open', exact: true }).click();
        const manual = await page.evaluate(() => appState.production.items.find(item => item.ecsCode === 'EXTRA-001'));
        assert.equal(manual.manual, true); assert.equal(manual.room, 'ROOM-A'); assert.equal(manual.origin, 'ECS Search');
        await page.getByRole('button', { name: '+ Add ECS', exact: true }).click();
        await page.locator('#pcAddCode').fill('EXTRA-001');
        await page.getByRole('button', { name: 'Add and open', exact: true }).click();
        assert.equal(await page.evaluate(() => appState.production.items.filter(item => item.ecsCode === 'EXTRA-001').length), 1);
    }],
    ['Search view shares fields and restores data', async page => {
        await prepare(page); await inspectAndReport(page);
        await page.locator('#ecsQuickEntryToggle').click();
        await page.locator('#pcRoomSearch').fill('ECS-002');
        assert.equal(await page.locator('.pc-card:visible').count(), 1);
        await page.locator('.pc-card:visible .pc-card-header').click();
        assert.equal(await page.locator('.pc-card:visible [data-production-field="gate"]').count(), 1);
        await page.locator('#pcRoomSearch').fill('');
        await page.locator('.pc-card').first().locator('.pc-card-header').click();
        assert.equal(await page.locator('.pc-card').first().locator('[data-production-field="gate"]').inputValue(), '2PREP_TACK');
    }],
    ['commodity field requirements apply while previous answers remain', async page => {
        await prepare(page); await inspectAndReport(page);
        await page.evaluate(() => ProductionUI.showConfig());
        const field = page.locator('#pcConfigDialog .pc-editor').first();
        await field.getByLabel('Required', { exact: true }).check();
        await page.getByRole('button', { name: 'Apply configuration', exact: true }).click();
        const result = await page.evaluate(() => {
            const current = appState.production, item = current.items[0];
            return { gate: item.fields.gate, required: ProductionCore.fieldsFor(item, current.config)[0].required, history: current.configHistory.length };
        });
        assert.equal(result.gate, '2PREP_TACK'); assert.equal(result.required, true); assert.equal(result.history, 1);
        await page.evaluate(() => ProductionUI.refreshSummaries());
        assert.match(await page.locator('.pc-card').first().locator('.pc-validation').innerText(), /Field weld is required/);
    }],
    ['grouped ZIP exports physical photo once in Building - Date and preserves links', async page => {
        await prepare(page);
        const result = await page.evaluate(async data => {
            const targets = appState.production.items.filter(item => item.room === 'ROOM-A').map(item => ({ codeId: item.codeId, roomName: item.roomLabel, ecsCode: item.ecsCode }));
            await savePhotosForTargets(targets, 'data:image/png;base64,' + data, { groupPhotoId: 'group-fixture', groupEcsCodes: targets.map(value => value.ecsCode), exportEcsCode: targets.map(value => value.ecsCode).join('_') });
            const result = await ProductionUI.buildPhotoZip();
            const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
            const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
            return { files, links: result.entries[0].links.map(photo => photo.ecsCode), bytes: await zip.file(files[0]).async('base64'), captureDate: (await getAllPhotos())[0].captureDate };
        }, pngData);
        assert.equal(result.files.length, 1); assert.equal(result.links.length, 2); assert.equal(result.bytes, pngData);
        assert.ok(result.files[0].startsWith(`inspection_photos/1HL4 - ${result.captureDate}/`));
    }],
    ['same commodity keeps separate Pipework and Equipment field profiles', async page => {
        await page.goto(origin + '/testing/', { waitUntil: 'load' }); await page.locator('#codeInspectionBtn').click();
        await page.locator('#pcWeeklyInput').fill('Week\tBuilding\tCommodity\tECS-code\nWeek-42-2026\tA\tMECH-PIPE\tP1\nWeek-42-2026\tA\tMECH-PIPE\tP2');
        await page.locator('#pcEcsInput').fill('Building\tRoom\tCommodity\tECS-code\tGateStatusStructure\tPercentComplete\nA\tR1\tMECH-PIPE\tP1\tHPC-BIP-PIPEWORK\t10\nA\tR1\tMECH-PIPE\tP2\tHPC-BIP-EQUIPMENT\t10');
        await page.locator('#startCodeInspection').click(); await page.waitForSelector('.pc-card');
        await page.evaluate(() => ProductionUI.showConfig());
        const profile = page.locator('#pcConfigDialog select').first();
        assert.equal(await profile.locator('option[value="commodity:MECH-PIPE|Pipe"]').count(), 1);
        assert.equal(await profile.locator('option[value="commodity:MECH-PIPE|Mechanical"]').count(), 1);
        await profile.selectOption('commodity:MECH-PIPE|Pipe');
        await page.locator('#pcConfigDialog .pc-editor').filter({ hasText: 'Field ID: WelderID' }).getByLabel('Required', { exact: true }).check();
        await page.getByRole('button', { name: 'Apply configuration', exact: true }).click();
        const result = await page.evaluate(() => appState.production.items.map(item => ({ code: item.ecsCode, required: ProductionCore.fieldsFor(item, appState.production.config).find(field => field.id === 'WelderID').required })));
        assert.deepEqual(result, [{ code: 'P1', required: true }, { code: 'P2', required: false }]);
    }],
    ['reset archives data/photos, preserves live storage, and recovery ZIP verifies', async page => {
        await prepare(page); await inspectAndReport(page); await takePhoto(page);
        await page.evaluate(async () => {
            localStorage.setItem('roomInspectionApp', 'LIVE-DO-NOT-CHANGE');
            await new Promise((resolve, reject) => {
                const request = indexedDB.open('ecs_photos_db', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
                request.onsuccess = () => { const db = request.result, tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put({ id: 1, tag: 'LIVE-PHOTO' }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = reject; };
            });
            showResetModal('code');
        });
        await page.locator('#confirmReset').click();
        await page.waitForFunction(() => !appState.production && !document.getElementById('confirmReset').disabled);
        assert.equal(await page.evaluate(async () => (await getAllPhotos()).length), 0);
        const result = await page.evaluate(async () => {
            const archives = await ProductionUI.recoveryOperation('readonly', store => store.getAll());
            if (!archives[0] || archives[0].format !== 1) throw new Error('A committed recovery archive is missing.');
            const archive = await ProductionUI.verifyArchive(archives[0]);
            const zip = await JSZip.loadAsync(await (await ProductionUI.recoveryZip(archive)).arrayBuffer());
            return { count: archives.length, gate: archive.state.production.items[0].fields.gate, photos: archive.photos.length, files: Object.keys(zip.files), live: localStorage.getItem('roomInspectionApp') };
        });
        assert.equal(result.count, 1); assert.equal(result.gate, '2PREP_TACK'); assert.equal(result.photos, 1);
        assert.equal(result.live, 'LIVE-DO-NOT-CHANGE'); assert.ok(result.files.includes('recovery.json'));
        assert.ok(result.files.includes('recovery_photos/photo-1.bin'));
        const zipBytes = await page.evaluate(async () => {
            const archives = await ProductionUI.recoveryOperation('readonly', store => store.getAll());
            return [...new Uint8Array(await (await ProductionUI.recoveryZip(archives[0])).arrayBuffer())];
        });
        await page.evaluate(() => { hideMessageModal(); return ProductionUI.showRecovery(); });
        const chooser = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: 'Import recovery ZIP', exact: true }).click();
        await (await chooser).setFiles({ name: 'recovery.zip', mimeType: 'application/zip', buffer: Buffer.from(zipBytes) });
        await page.waitForFunction(() => document.querySelectorAll('#pcRecoveryDialog .pc-archive').length === 2);
        await page.evaluate(async () => { const archives = await ProductionUI.recoveryOperation('readonly', store => store.getAll()); await ProductionUI.restoreActive(archives[1]); });
        assert.equal(await page.evaluate(async () => (await getAllPhotos()).length), 1);
        assert.equal(await page.evaluate(() => appState.production.items[0].fields.gate), '2PREP_TACK');
    }],
    ['interrupted replacement recovers photo bytes on reopening', async page => {
        await prepare(page); await inspectAndReport(page); await takePhoto(page);
        await page.evaluate(async () => { await ProductionUI.archiveCurrent('Injected interrupted replacement'); await clearAndVerifyAllPhotos(); });
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => localStorage.getItem('roomInspectionTestingRecoveryPending.v1') === null);
        assert.equal(await page.evaluate(async () => (await getAllPhotos()).length), 1);
        assert.equal(await page.evaluate(() => appState.production.items[0].fields.gate), '2PREP_TACK');
    }],
    ['archive failure stops reset before any data or photo removal', async page => {
        await prepare(page); await inspectAndReport(page); await takePhoto(page);
        await page.evaluate(() => { crypto.subtle.digest = async () => { throw new Error('Injected backup failure'); }; showResetModal('code'); });
        await page.locator('#confirmReset').click();
        await page.waitForFunction(() => document.getElementById('confirmReset').disabled === false);
        assert.equal(await page.evaluate(() => appState.production.items[0].fields.gate), '2PREP_TACK');
        assert.equal(await page.evaluate(async () => (await getAllPhotos()).length), 1);
    }],
    ['failed replacement restores answers and photo bytes from the verified archive', async page => {
        await prepare(page); await inspectAndReport(page); await takePhoto(page);
        const result = await page.evaluate(async () => {
            const before = appState.production.sessionId, incoming = JSON.parse(JSON.stringify(appState));
            incoming.production.sessionId = 'injected-failed-session';
            const original = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
                if (key === 'roomInspectionTestingApp.v1' && value.includes('injected-failed-session')) throw new Error('Injected active save failure');
                return original.call(this, key, value);
            };
            try {
                const result = await replaceInspectionWithData(incoming, 'test');
                return { loaded: result.loaded, session: appState.production.sessionId, before, photos: (await getAllPhotos()).length, gate: appState.production.items[0].fields.gate };
            } finally { Storage.prototype.setItem = original; }
        });
        assert.equal(result.loaded, false); assert.equal(result.session, result.before); assert.equal(result.photos, 1); assert.equal(result.gate, '2PREP_TACK');
    }],
    ['JSON/share round trip retains scope, gates and manual provenance', async page => {
        await prepare(page); await inspectAndReport(page);
        const result = await page.evaluate(() => {
            const decoded = decodeShareData(encodeShareData(buildSharePayload()));
            const state = prepareIncomingInspectionData(decoded);
            return { scopes: state.production.scopes, originalScopes: appState.production.scopes, gate: state.production.items[0].fields.gate, rooms: Object.keys(state.roomCodes), ruleVersion: state.production.ruleVersion };
        });
        assert.deepEqual(result.scopes, result.originalScopes); assert.equal(result.gate, '2PREP_TACK'); assert.equal(result.rooms.length, 2);
    }],
    ['mobile layout keeps controls within viewport', async page => {
        await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        const box = await page.locator('.pc-card').first().boundingBox(); assert.ok(box.width <= 390);
        const gate = await page.locator('.pc-card').first().locator('[data-production-field="gate"]').boundingBox(); assert.ok(gate.height >= 44);
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/weekly-mobile.png`, fullPage: true });
    }]
];
let failures = 0;
try {
    for (const [name, type] of [['Chromium', chromium], ['WebKit', webkit]]) {
        const browser = await type.launch({ headless: true });
        try {
            for (const [description, run] of cases) {
                if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER).test(description)) continue;
                const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
                const page = await context.newPage(), errors = [];
                page.on('pageerror', error => errors.push(error.message));
                try {
                    await run(page); assert.deepEqual(errors, []);
                    results.push({ browser: name, check: description, status: 'passed' });
                    console.log(`PASS ${name}: ${description}`);
                } catch (error) {
                    failures += 1; results.push({ browser: name, check: description, status: 'failed', error: error.message });
                    console.error(`FAIL ${name}: ${description}\n${error.stack}\nPage errors: ${errors.join('; ')}`);
                } finally { await context.close(); }
            }
            if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER).test('offline')) continue;
            const context = await browser.newContext();
            const page = await context.newPage();
            try {
                await prepare(page); await inspectAndReport(page); await takePhoto(page);
                await page.evaluate(() => ensureOfflineAppReady());
                if (name === 'WebKit') {
                    const complete = await page.evaluate(async () => {
                        const cache = await caches.open('live-form-testing-2026-10-15-v1');
                        const files = ['./index.html', './production-core.js', './production-ui.js', './gate-config.js', './vendor/jszip.min.js'];
                        return (await Promise.all(files.map(async file => !!(await cache.match(file))))).every(Boolean);
                    });
                    assert.equal(complete, true);
                    console.log('PASS WebKit: offline shell and local export dependencies verified');
                    results.push({ browser: name, check: 'offline shell and local export dependencies verified', status: 'passed' });
                    continue;
                }
                await context.setOffline(true); await page.reload({ waitUntil: 'load' });
                await page.waitForSelector('.pc-card');
                assert.equal(await page.evaluate(() => appState.production.items[0].fields.gate), '2PREP_TACK');
                assert.equal(await page.evaluate(async () => (await getAllPhotos()).length), 1);
                const zipFiles = await page.evaluate(async () => (await ProductionUI.buildPhotoZip()).entries.length);
                assert.equal(zipFiles, 1);
                console.log(`PASS ${name}: offline reopen, saved progress/photo and ZIP generation`);
                results.push({ browser: name, check: 'offline reopen, saved progress/photo and ZIP generation', status: 'passed' });
            } catch (error) {
                failures += 1; console.error(`FAIL ${name}: offline\n${error.stack}`);
                results.push({ browser: name, check: 'offline reopen, saved progress/photo and ZIP generation', status: 'failed', error: error.message });
            } finally { await context.close(); }
        } finally { await browser.close(); }
    }
} finally {
    await new Promise(resolve => server.close(resolve));
    await writeFile(resolve(root, 'tests/weekly-results.json'), JSON.stringify({ build: 'weekly-inspection-test-1', ranAt: new Date().toISOString(), passed: results.filter(result => result.status === 'passed').length, failed: failures, limitations: ['Desktop automation uses injected images. Native iOS/Android camera and OneDrive saving require device testing.', 'WebKit offline coverage verifies cached files. This host\'s headless WebKit cannot perform the simulated offline navigation; full offline reopen is checked in Chromium.'], results }, null, 2) + '\n');
}
if (failures) process.exitCode = 1;
