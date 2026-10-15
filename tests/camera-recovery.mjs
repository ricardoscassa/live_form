import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.APP_ROOT || fileURLToPath(new URL('../', import.meta.url));
const entry = process.env.APP_ENTRY || 'testing/index.html';
const appDirectory = dirname(entry);
const html = await readFile(resolve(root, entry), 'utf8');
const expectedCache = html.match(/const OFFLINE_APP_CACHE_NAME = '([^']+)'/)[1];
assert.ok((await readFile(resolve(root, appDirectory, 'sw.js'), 'utf8')).includes(`'${expectedCache}'`));
const shellFiles = appDirectory === 'testing'
    ? ['./index.html', './production-core.js', './production-ui.js', './gate-config.js', './vendor/jszip.min.js']
    : ['./index.html', './new_test1506.html'];
const png = {
    name: 'camera.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
};
const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = pathname.endsWith('/') ? pathname.slice(1) + 'index.html' : pathname.slice(1);
    const allowed = file === entry || (appDirectory === 'testing' && file.startsWith('testing/') && /\.(html|js|css)$/.test(file) && !file.includes('..')) || ['index.html', 'new_test1506.html', 'sw.js'].includes(file);
    if (!allowed) {
        response.writeHead(404).end();
        return;
    }
    try {
        response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
        response.setHeader('Cache-Control', 'no-store');
        response.end(await readFile(resolve(root, file)));
    } catch {
        response.writeHead(500).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/${entry}`;

async function setupRows(page) {
    await page.evaluate(() => {
        appState.roomCodes = { 'ROOM-A': ['ECS-001', 'ECS-002'] };
        appState.currentCodeRoomIndex = 0;
        appState.checkData = { 'ROOM-A-ECS-001': 0, 'ROOM-A-ECS-002': 0 };
        const checkPage = document.getElementById('codeCheckPage');
        checkPage.classList.add('active');
        checkPage.style.cssText = 'display:block!important;visibility:visible!important;';
        const container = document.getElementById('codeChecksContainer');
        container.style.cssText = 'display:block!important;position:fixed;left:20px;top:20px;z-index:50000;background:white;padding:10px;';
        container.replaceChildren();
        for (const code of appState.roomCodes['ROOM-A']) {
            const row = document.createElement('div');
            row.className = 'grid-row';
            row.dataset.roomName = 'ROOM-A';
            row.innerHTML = `<div class="grid-cell code-cell">${code}</div><button data-code-id="ROOM-A-${code}">status</button>`;
            container.appendChild(row);
            addCameraButtonToRow(row, `ROOM-A-${code}`, 'ROOM-A', code);
        }
        window.testInputs = [...container.querySelectorAll('.camera-file-input')];
        window.testRenewals = [];
        const renew = renewNativePhotoInput;
        renewNativePhotoInput = input => { testRenewals.push(input.id); return renew(input); };
    });
}

async function choose(page, index = 0) {
    const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.locator('#codeChecksContainer .camera-file-input').nth(index).click();
    return chooser;
}
async function cancel(page, index = 0) {
    // Desktop automation intercepts the native picker; simulate its cancel event.
    await page.evaluate(index => testInputs[index].dispatchEvent(new Event('cancel')), index);
}
async function editorReady(page) {
    await page.waitForFunction(() => !!_stampEditorState && !document.getElementById('stampSaveBtn').disabled);
}
async function save(page, expectedCount = 1) {
    await editorReady(page);
    await page.locator('#stampSaveBtn').click();
    await page.waitForFunction(async count => (await getPhotosByCodeId('ROOM-A-ECS-001')).length === count, expectedCount);
    await page.evaluate(() => hideMessageModal());
}
async function originalConnected(page) {
    return page.evaluate(() => testInputs[0].isConnected);
}

const cases = [
    ['every row recovers when lifecycle events are missed', async page => {
        await page.evaluate(() => {
            const realNow = Date.now;
            Date.now = () => realNow() + 60_000;
        });
        await choose(page);
        await cancel(page);
        await choose(page, 1);
        assert.deepEqual(await page.evaluate(() => testRenewals), await page.evaluate(() => testInputs.map(input => input.id)));
    }],
    ['immediate focus/tap preserves the picker and other rows recover', async page => {
        await page.evaluate(() => {
            document.addEventListener('click', () => {
                markPhotoPageInactive();
                window.dispatchEvent(new Event('focus'));
            }, { capture: true, once: true });
        });
        await choose(page);
        await page.waitForTimeout(50);
        assert.equal(await originalConnected(page), true);
        await cancel(page);
        await choose(page, 1);
        assert.ok(await page.evaluate(() => testRenewals.includes(testInputs[1].id)));
    }],
    ['delayed picker delivery survives resume and saves', async page => {
        const picker = await choose(page);
        await page.evaluate(async () => {
            window.testOldDB = await openPhotoDB();
            markPhotoPageInactive();
            resumePhotoSubsystem(true);
        });
        await page.waitForTimeout(3500); // Beyond the removed three-second cutoff.
        assert.equal(await originalConnected(page), true, 'Resume detached the still-pending picker');
        assert.equal(await page.evaluate(async () => (await openPhotoDB()) !== testOldDB), true);
        await picker.setFiles(png);
        await save(page);
        assert.equal(await originalConnected(page), true);
    }],
    ['abandoned overnight picker recovers on the next tap', async page => {
        await choose(page); // Deliberately deliver neither a file nor cancel.
        await page.evaluate(() => {
            markPhotoPageInactive();
            photoPageHiddenAt = Date.now() - 24 * 60 * 60 * 1000;
            resumePhotoSubsystem(true);
        });
        const picker = await choose(page);
        assert.ok(await page.evaluate(() => testRenewals.includes(testInputs[0].id)));
        assert.deepEqual(await page.evaluate(() => [testInputs[0].type, testInputs[0].accept, testInputs[0].getAttribute('capture')]), ['file', 'image/*', 'environment']);
        await picker.setFiles(png);
        await save(page);
    }],
    ['resume during file reading preserves the input', async page => {
        await page.evaluate(() => {
            const read = FileReader.prototype.readAsDataURL;
            FileReader.prototype.readAsDataURL = function(file) {
                window.testReleaseRead = () => read.call(this, file);
            };
        });
        await (await choose(page)).setFiles(png);
        await page.evaluate(() => { markPhotoPageInactive(); resumePhotoSubsystem(true); });
        await page.waitForTimeout(50);
        assert.equal(await originalConnected(page), true, 'Resume detached the input while reading its photo');
        await page.evaluate(() => testReleaseRead());
        await save(page);
    }],
    ['cancel, editor resume, retake, and repeated selection work', async page => {
        await choose(page);
        await cancel(page);
        await (await choose(page)).setFiles(png);
        await editorReady(page);
        await page.evaluate(() => { markPhotoPageInactive(); resumePhotoSubsystem(true); });
        await page.waitForTimeout(50);
        assert.equal(await originalConnected(page), true);
        const retake = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#stampRetakeBtn').click();
        await (await retake).setFiles(png);
        await save(page);
        await (await choose(page)).setFiles(png);
        await save(page, 2);
    }],
    ['idle resume rebuilds controls', async page => {
        await page.evaluate(() => { markPhotoPageInactive(); resumePhotoSubsystem(); });
        await page.waitForFunction(() => !testInputs[0].isConnected);
        await (await choose(page)).setFiles(png);
        await save(page);
    }]
];

let failures = 0;
try {
    for (const [name, browserType, executablePath] of [
        ['Chromium', chromium, process.env.CHROMIUM_EXECUTABLE_PATH],
        ['WebKit', webkit, process.env.WEBKIT_EXECUTABLE_PATH]
    ]) {
        const browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
        try {
            for (const [description, run] of cases) {
                const context = await browser.newContext({ serviceWorkers: 'block' });
                try {
                    const page = await context.newPage();
                    const errors = [];
                    page.on('pageerror', error => errors.push(error.message));
                    await page.route('https://**/*', route => route.abort());
                    await page.goto(url, { waitUntil: 'load' });
                    await setupRows(page);
                    await run(page);
                    assert.deepEqual(errors, []);
                    console.log(`PASS ${name}: ${description}`);
                } catch (error) {
                    failures += 1;
                    console.error(`FAIL ${name}: ${description}\n${error.stack}`);
                } finally {
                    await context.close();
                }
            }
            const context = await browser.newContext();
            try {
                const page = await context.newPage();
                await page.route('https://**/*', route => route.abort());
                await page.goto(url, { waitUntil: 'load' });
                await page.evaluate(() => ensureOfflineAppReady());
                assert.equal(await page.evaluate(async ({ expected, files }) => {
                    const cache = await caches.open(expected);
                    const responses = await Promise.all(files.map(url => cache.match(url)));
                    return responses.every(Boolean);
                }, { expected: expectedCache, files: shellFiles }), true);
                if (name === 'Chromium') {
                    await setupRows(page);
                    await page.evaluate(() => saveDataToStorage());
                    await (await choose(page)).setFiles(png);
                    await save(page);
                    await context.setOffline(true);
                    await page.reload({ waitUntil: 'load' });
                    assert.equal(await page.evaluate(() => appState.roomCodes['ROOM-A'][0]), 'ECS-001');
                    assert.equal(await page.evaluate(async () => (await getPhotosByCodeId('ROOM-A-ECS-001')).length), 1);
                    await setupRows(page);
                    await (await choose(page)).setFiles(png);
                    await save(page, 2);
                }
                console.log(`PASS ${name}: ${name === 'Chromium' ? 'offline reload, existing photo persistence, and new photo saving' : 'offline HTML cache'}`);
            } catch (error) {
                failures += 1;
                console.error(`FAIL ${name}: offline checks\n${error.stack}`);
            } finally {
                await context.close();
            }
        } finally {
            await browser.close();
        }
    }
} finally {
    await new Promise(resolve => server.close(resolve));
}
if (failures) process.exitCode = 1;
