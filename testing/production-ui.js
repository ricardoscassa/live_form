/* Integrates weekly work with the existing inspection controls and camera. */
(function () {
    'use strict';
    const C = window.ProductionCore;
    const STORAGE_KEY = 'roomInspectionTestingApp.v1';
    const CONFIG_KEY = 'roomInspectionTestingConfig.v1';
    const PENDING_KEY = 'roomInspectionTestingRecoveryPending.v1';
    const CACHE_NAME = 'live-form-testing-2026-10-15-v1';
    const $ = id => document.getElementById(id);
    const element = (tag, className, value) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value !== undefined) node.textContent = value;
        return node;
    };
    const button = (label, action, className = 'button secondary') => {
        const node = element('button', className, label); node.type = 'button';
        node.addEventListener('click', action); return node;
    };
    const model = () => appState.production && appState.production.schema === 1 ? appState.production : null;
    const itemFor = codeId => model() && model().items.find(item => item.codeId === codeId);
    let config = C.defaultConfig(), busy = false, photoSaving = false, preview = null, storageFailed = false, refreshQueued = false;
    const fingerprints = new Map();
    try { const saved = localStorage.getItem(CONFIG_KEY); if (saved) config = C.validateConfig(JSON.parse(saved)); } catch { /* retain the checked defaults */ }

    function errorMessage(error) { return error && error.message ? error.message : String(error); }
    function notifyError(error) { showMessageModal('Work could not be saved', errorMessage(error)); }
    function strictSave() {
        const serialized = JSON.stringify(appState);
        localStorage.setItem(STORAGE_KEY, serialized);
        if (localStorage.getItem(STORAGE_KEY) !== serialized) throw new Error('Device storage could not be verified. Keep this page open and try again.');
        storageFailed = false;
    }
    window.saveDataToStorage = function () {
        try { strictSave(); scheduleSummary(); return true; }
        catch (error) { storageFailed = true; notifyError(error); return false; }
    };
    function snapshotFor(item) {
        return JSON.stringify({ fields: item.fields, status: appState.checkData[item.codeId], comments: appState.codeSpecificComments[item.codeId], extras: getEcsExtraLists().map(list => [list.id, appState.ecsExtraData[list.id] && appState.ecsExtraData[list.id][item.codeId]]) });
    }
    function recordChange(item, force = false) {
        if (!item) return;
        const fingerprint = snapshotFor(item);
        if (!force && fingerprints.get(item.id) === fingerprint) return;
        item.touched = true; item.revision = (item.revision || 0) + 1;
        item.savedAt = new Date().toISOString();
        item.configVersion = model().config.version;
        try {
            strictSave(); fingerprints.set(item.id, fingerprint); scheduleSummary();
        } catch (error) { storageFailed = true; notifyError(error); }
    }
    function photoBusy() {
        return photoSaving || (typeof pendingPhotoPickerInput !== 'undefined' && pendingPhotoPickerInput && pendingPhotoPickerInput.isConnected) ||
            !!document.querySelector('#stampEditorModal.active');
    }
    async function mutation(job) {
        if (busy) throw new Error('Another save is in progress.');
        if (photoBusy()) throw new Error('Finish or cancel the current photo before changing the inspection.');
        busy = true;
        const container = document.querySelector('.container');
        container.inert = true; container.setAttribute('aria-busy', 'true');
        try { return await job(); }
        finally { busy = false; container.inert = false; container.removeAttribute('aria-busy'); }
    }

    // Archive bytes and answers together. The committed record is verified before
    // callers are allowed to clear or replace either active store.
    let recoveryDBPromise;
    function recoveryDB() {
        if (!recoveryDBPromise) recoveryDBPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('inspection_testing_recovery_v1', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('archives', { keyPath: 'id' });
            request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); recoveryDBPromise = null; }; resolve(db); };
            request.onerror = () => { recoveryDBPromise = null; reject(request.error); };
            request.onblocked = () => { recoveryDBPromise = null; reject(new Error('Recovery storage is blocked by another window.')); };
        });
        return recoveryDBPromise;
    }
    async function recoveryOperation(mode, action) {
        const db = await recoveryDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('archives', mode); let result;
            const request = action(tx.objectStore('archives'));
            request.onsuccess = () => { result = request.result; };
            tx.oncomplete = () => resolve(result);
            tx.onabort = tx.onerror = () => reject(tx.error || new Error('Recovery storage could not be written.'));
        });
    }
    function stable(value) {
        if (Array.isArray(value)) return value.map(stable);
        if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])]));
        return value;
    }
    async function digest(value) {
        if (!window.crypto || !crypto.subtle) throw new Error('Verified backups require HTTPS or localhost.');
        const data = new TextEncoder().encode(JSON.stringify(stable(value)));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    async function verifyArchive(archive) {
        if (!archive || archive.format !== 1 || !archive.state || !Array.isArray(archive.photos) || !archive.manifest) throw new Error('Invalid recovery backup.');
        if (archive.photos.length !== archive.manifest.photos || (await digest({ state: archive.state, photos: archive.photos })) !== archive.manifest.sha256) throw new Error('Recovery backup verification failed. Current work is retained.');
        return archive;
    }
    async function archiveCurrent(reason) {
        const state = C.copy(appState), photos = await getAllPhotos();
        if (!hasExistingInspectionState(state) && !photos.length) return null;
        const archive = {
            id: crypto.randomUUID(), format: 1, createdAt: new Date().toISOString(), reason,
            state, photos,
            manifest: { records: state.production ? state.production.items.length : getEcsCodeIds(state.roomCodes || {}).length, photos: photos.length, sha256: await digest({ state, photos }) }
        };
        await recoveryOperation('readwrite', store => store.add(archive));
        await verifyArchive(await recoveryOperation('readonly', store => store.get(archive.id)));
        localStorage.setItem(PENDING_KEY, JSON.stringify({ archiveId: archive.id, reason }));
        return archive;
    }
    async function replacePhotoRecords(photos) {
        await withPhotoDBRetry(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite'), store = tx.objectStore(STORE_NAME);
            store.clear(); photos.forEach(photo => store.put(C.copy(photo)));
            tx.oncomplete = resolve;
            tx.onabort = tx.onerror = () => reject(tx.error || new Error('Photo restoration failed.'));
        }));
        if (await digest(await getAllPhotos()) !== await digest(photos)) throw new Error('Restored photos could not be verified. The backup remains available.');
    }
    async function restoreActive(archive) {
        await verifyArchive(archive);
        const state = prepareIncomingInspectionData(archive.state);
        await replacePhotoRecords(archive.photos);
        appState = state; strictSave();
        localStorage.removeItem(PENDING_KEY);
        fingerprints.clear(); refreshUIFromState(); populateInputFromState(); scheduleSummary();
    }
    async function replaceActive(prepared, reason) {
        const archive = await archiveCurrent(reason);
        try {
            if (archive) localStorage.setItem(PENDING_KEY, JSON.stringify({ archiveId: archive.id, reason, targetDigest: await digest(prepared) }));
            await clearAndVerifyAllPhotos();
            appState = prepared; strictSave();
            localStorage.removeItem(PENDING_KEY); fingerprints.clear();
        } catch (error) {
            if (archive) {
                try { await restoreActive(archive); }
                catch (restoreError) { throw new Error(`${errorMessage(error)} Recovery backup ${archive.id} is retained. ${errorMessage(restoreError)}`); }
            }
            throw error;
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob), anchor = element('a');
        anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    async function recoveryZip(archive) {
        await verifyArchive(archive);
        const zip = new JSZip(), metadata = C.copy(archive);
        metadata.photos.forEach((photo, index) => {
            const comma = photo.dataUrl.indexOf(',');
            const path = `recovery_photos/photo-${index + 1}.bin`;
            zip.file(path, photo.dataUrl.slice(comma + 1), { base64: true });
            photo.dataPrefix = photo.dataUrl.slice(0, comma + 1); photo.recoveryPath = path; delete photo.dataUrl;
        });
        zip.file('recovery.json', JSON.stringify(metadata));
        return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    }

    function dialog(id, title) {
        const node = element('dialog', 'pc-dialog'); node.id = id;
        const body = element('div', 'pc-dialog-body'), heading = element('div', 'pc-dialog-heading');
        heading.append(element('h2', '', title), button('Close', () => node.close(), 'pc-close'));
        body.appendChild(heading); node.appendChild(body); document.body.appendChild(node);
        return { node, body };
    }
    const recovery = dialog('pcRecoveryDialog', 'Recovery backups');
    const editor = dialog('pcConfigDialog', 'Commodity fields');
    const add = dialog('pcAddDialog', 'Add ECS to this room');

    async function showRecovery() {
        recovery.body.querySelectorAll(':scope > :not(.pc-dialog-heading)').forEach(node => node.remove());
        recovery.body.appendChild(element('p', 'pc-note', 'Archived work is kept outside the active inspection. Download a backup or restore a session here.'));
        const importInput = element('input'); importInput.type = 'file'; importInput.accept = '.zip'; importInput.hidden = true;
        recovery.body.append(button('Import recovery ZIP', () => importInput.click()), importInput);
        importInput.addEventListener('change', async () => {
            if (!importInput.files[0]) return;
            try {
                const zip = await JSZip.loadAsync(await importInput.files[0].arrayBuffer());
                const file = zip.file('recovery.json'); if (!file) throw new Error('This ZIP has no recovery manifest.');
                const archive = JSON.parse(await file.async('string'));
                for (const photo of archive.photos || []) {
                    const data = zip.file(photo.recoveryPath); if (!data) throw new Error('A recovery photo is missing.');
                    photo.dataUrl = photo.dataPrefix + await data.async('base64'); delete photo.dataPrefix; delete photo.recoveryPath;
                }
                await verifyArchive(archive);
                archive.id = crypto.randomUUID();
                await recoveryOperation('readwrite', store => store.add(archive));
                await showRecovery();
            } catch (error) { recovery.body.appendChild(element('p', 'pc-error-text', errorMessage(error))); }
        });
        const archives = (await recoveryOperation('readonly', store => store.getAll())).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (!archives.length) recovery.body.appendChild(element('p', 'pc-empty', 'No recovery backups yet.'));
        for (const archive of archives) {
            const row = element('section', 'pc-archive');
            row.append(element('strong', '', new Date(archive.createdAt).toLocaleString('en-GB')), element('div', '', `${archive.reason} · ${archive.manifest.records} records · ${archive.manifest.photos} photo links`));
            if (archive.state.production) row.appendChild(element('div', '', archive.state.production.reportingWeek));
            const actions = element('div', 'pc-actions');
            actions.append(button('Download backup', async () => {
                try { downloadBlob(await recoveryZip(archive), `inspection_recovery_${archive.createdAt.slice(0, 10)}_${archive.id.slice(0, 8)}.zip`); }
                catch (error) { row.appendChild(element('p', 'pc-error-text', errorMessage(error))); }
            }), button('Restore session', async () => {
                if (!window.confirm('Restore this session? Current work will first be archived.')) return;
                try { await mutation(async () => { await archiveCurrent('Before recovery restore'); await restoreActive(archive); }); recovery.node.close(); }
                catch (error) { row.appendChild(element('p', 'pc-error-text', errorMessage(error))); }
            }), button('Delete backup', async () => {
                if (!window.confirm('Permanently delete this recovery backup?')) return;
                try { await recoveryOperation('readwrite', store => store.delete(archive.id)); await showRecovery(); }
                catch (error) { row.appendChild(element('p', 'pc-error-text', errorMessage(error))); }
            }));
            row.appendChild(actions); recovery.body.appendChild(row);
        }
        if (!recovery.node.open) recovery.node.showModal();
    }

    function labeled(label, control, className = '') {
        const wrapper = element('label', `pc-field ${className}`); wrapper.append(element('span', '', label), control); return wrapper;
    }
    function select(options, value = '') {
        const node = element('select');
        for (const option of options) {
            const optionNode = element('option', '', typeof option === 'object' ? option.label : option);
            optionNode.value = typeof option === 'object' ? option.value : option; node.appendChild(optionNode);
        }
        node.value = value; return node;
    }

    // Two inputs on the existing setup page. Weekly-data is the only authority
    // for the room/commodity combinations accepted from the second paste.
    const legacyInput = $('codeList').closest('.room-input-section');
    const setup = element('section', 'pc-setup'); setup.id = 'pcSetup';
    setup.append(element('h2', '', 'Weekly plan & ECS work'), element('p', 'pc-note', 'Paste Weekly-data first, then ECS-data. Additional work is kept only for the same building, room and commodity types.'));
    const modeSelect = select([{ value: 'weekly', label: 'Weekly plan + inspection' }, { value: 'legacy', label: 'Inspection only' }], 'weekly'); modeSelect.id = 'pcInputMode';
    const modeRow = element('div', 'pc-mode'); modeRow.append(element('span', '', 'Work input'), modeSelect);
    legacyInput.before(modeRow, setup);
    const weeklyInput = element('textarea', 'room-textarea'); weeklyInput.id = 'pcWeeklyInput'; weeklyInput.rows = 7;
    weeklyInput.placeholder = 'Week\tBuilding\tCommodity\tECS-code\nWeek-42-2026\t1HL4\tELEC-SUPPORT\tEXAMPLE-ECS-001';
    const ecsInput = element('textarea', 'room-textarea'); ecsInput.id = 'pcEcsInput'; ecsInput.rows = 7;
    ecsInput.placeholder = 'Building\tRoom\tCommodity\tECS-code\tGateStatusStructure\tGateStatus\tPercentComplete';
    const topGrid = element('div', 'pc-grid');
    const reportingWeek = select([{ value: '', label: 'From Weekly-data' }]); reportingWeek.id = 'pcReportingWeek';
    const yearInput = element('input'); yearInput.type = 'number'; yearInput.value = new Date().getFullYear(); yearInput.id = 'pcWeekYear';
    const entryDate = element('input'); entryDate.type = 'date'; entryDate.value = C.londonDate(); entryDate.id = 'pcEntryDate';
    const operator = element('input'); operator.type = 'text'; operator.id = 'pcOperator'; operator.placeholder = 'Name or email';
    topGrid.append(labeled('Reporting week', reportingWeek), labeled('Year for week numbers', yearInput), labeled('Work date', entryDate), labeled('Recorded by', operator));
    const actions = element('div', 'pc-actions');
    actions.append(button('Preview inputs', () => showPreview()), button('Load example', loadExample), button('Commodity fields', showConfig));
    const previewBox = element('div', 'pc-preview'); previewBox.id = 'pcImportPreview'; previewBox.hidden = true; previewBox.setAttribute('role', 'status');
    const mappings = element('details', 'pc-mapping'); mappings.appendChild(element('summary', '', 'Column mapping (optional)'));
    const mappingBody = element('div', 'pc-grid'); mappings.appendChild(mappingBody);
    setup.append(labeled('1. Weekly-data', weeklyInput), element('p', 'pc-note', 'Week, Building, Commodity and ECS-code. Include Room, or resolve it from matching ECS-data. Source gate information may be included.'), topGrid,
        labeled('2. ECS-data — work not in the weekly plan', ecsInput), element('p', 'pc-note', 'Include headers for Building, Room, Commodity and ECS-code. GateStatusStructure and source progress enable gate validation. Other rooms and commodity types are discarded.'), actions, mappings, previewBox);
    function showMode() { setup.hidden = modeSelect.value !== 'weekly'; legacyInput.hidden = modeSelect.value === 'weekly'; }
    modeSelect.addEventListener('change', showMode); showMode();
    const mapControls = { weekly: {}, ecs: {} };
    function updateMappings() {
        for (const kind of ['weekly', 'ecs']) {
            const input = kind === 'weekly' ? weeklyInput : ecsInput;
            let parsed;
            try { parsed = C.parseTable(input.value, kind); }
            catch {
                if (!C.text(input.value)) continue;
                const first = input.value.split(/\r?\n/)[0];
                const delimiter = ['\t', ',', ';'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
                try { parsed = { columns: C.parseDelimited(input.value, delimiter)[0] }; } catch { continue; }
            }
            for (const name of Object.keys(C.HEADERS)) {
                const id = `pcMap-${kind}-${name}`;
                let control = $(id);
                const old = control ? control.value : '';
                if (!control) {
                    control = select([]); control.id = id;
                    control.addEventListener('change', () => { preview = null; });
                    mappingBody.appendChild(labeled(`${kind === 'weekly' ? 'Weekly' : 'ECS'}: ${name}`, control));
                }
                control.replaceChildren(...select([{ value: '', label: 'Automatic' }, ...parsed.columns.map((label, index) => ({ value: String(index), label }))]).childNodes);
                control.value = [...control.options].some(option => option.value === old) ? old : '';
                mapControls[kind][name] = control;
            }
        }
    }
    function mappingFor(kind) { return Object.fromEntries(Object.entries(mapControls[kind]).filter(([, control]) => control.value !== '').map(([name, control]) => [name, Number(control.value)])); }
    function prepareInputs() {
        return C.prepare(weeklyInput.value, ecsInput.value, {
            week: reportingWeek.value, year: yearInput.value, entryDate: entryDate.value, operator: operator.value,
            weeklyMapping: mappingFor('weekly'), ecsMapping: mappingFor('ecs'), config
        });
    }
    function showPreview() {
        previewBox.hidden = false; previewBox.classList.remove('pc-error');
        try {
            updateMappings();
            const rows = C.parseTable(weeklyInput.value, 'weekly', mappingFor('weekly')).rows;
            const weeks = [...new Set(rows.map(row => C.normaliseWeek(row.week, yearInput.value)))].sort();
            const selected = reportingWeek.value;
            reportingWeek.replaceChildren(...select([{ value: '', label: weeks.length > 1 ? 'Choose reporting week' : 'From Weekly-data' }, ...weeks]).childNodes);
            reportingWeek.value = weeks.includes(selected) ? selected : (weeks.length === 1 ? weeks[0] : '');
            preview = prepareInputs();
            const counts = preview.stats;
            previewBox.replaceChildren(element('strong', '', `${preview.reportingWeek} · ${Object.keys(preview.roomCodes).length} rooms`),
                element('div', '', `${counts.planned} planned · ${counts.candidates} additional ECS · ${counts.plannedDuplicates + counts.ecsDuplicates} duplicate/source matches removed`),
                element('div', '', `Discarded: ${counts.discardedLocation} outside rooms/buildings · ${counts.discardedCommodity} other commodities · ${counts.discardedUnresolved} unresolved rows`));
            const unresolved = preview.items.filter(item => !C.workflow(item).valid || item.sourcePercent == null || item.metadataIssues.length);
            if (unresolved.length) previewBox.appendChild(element('div', '', `${unresolved.length} ECS need source review before verified progress can be exported. Inspection evidence can still be recorded.`));
            return preview;
        } catch (error) {
            preview = null; previewBox.classList.add('pc-error'); previewBox.textContent = errorMessage(error); return null;
        }
    }
    [weeklyInput, ecsInput, reportingWeek, yearInput, entryDate, operator].forEach(node => node.addEventListener('input', () => { preview = null; }));
    function loadExample() {
        weeklyInput.value = 'Week\tBuilding\tCommodity\tECS-code\nWeek-42-2026\t1HL4\tELEC-SUPPORT\tECS-001\nWeek-42-2026\t1HL4\tHVAC-DUCT\tECS-010';
        ecsInput.value = 'Building\tRoom\tCommodity\tECS-code\tGateStatusStructure\tGateStatus\tPercentComplete\n1HL4\tROOM-A\tELEC-SUPPORT\tECS-001\tHPC-BIP-ELEC-SUPPORT\t1ENDS_CUT\t10\n1HL4\tROOM-A\tELEC-SUPPORT\tECS-002\tHPC-BIP-ALL-SUPPORTS\t1ENDS_CUT\t10\n1HL4\tROOM-B\tHVAC-DUCT\tECS-010\tHPC-BIP-DUCTING\t1HAND_POS\t20\n1HL4\tROOM-A\tHVAC-DUCT\tDISCARD-COMMODITY\tHPC-BIP-DUCTING\t1HAND_POS\t20\n1HL4\tROOM-C\tELEC-SUPPORT\tDISCARD-ROOM\tHPC-BIP-ALL-SUPPORTS\t1ENDS_CUT\t10';
        reportingWeek.value = ''; showPreview();
    }

    function populateInputFromState() {
        const current = model(); if (!current) return;
        config = C.copy(current.config); modeSelect.value = 'weekly'; showMode();
        const columns = ['Week', 'Building', 'Room', 'Commodity', 'ECS-code', 'GateStatusStructure', 'GateStatus', 'PercentComplete', 'SourceUpdatedAt'];
        const line = item => [current.reportingWeek, item.building, item.room, item.commodity, item.ecsCode, item.structure, item.sourceGate, item.sourcePercent == null ? '' : item.sourcePercent, item.sourceUpdatedAt].map(value => String(value).replace(/\t|\r|\n/g, ' ')).join('\t');
        weeklyInput.value = [columns.join('\t'), ...current.items.filter(item => item.origin === 'Weekly Plan').map(line)].join('\n');
        ecsInput.value = [columns.join('\t'), ...current.items.filter(item => !item.manual).map(line)].join('\n');
        reportingWeek.replaceChildren(...select([current.reportingWeek], current.reportingWeek).childNodes);
        entryDate.value = current.entryDate || C.londonDate(); operator.value = current.operator || '';
    }

    const originalStart = startCodeInspection;
    window.startCodeInspection = async function () {
        try {
            if (modeSelect.value === 'legacy') {
                if (!C.text($('codeList').value)) { showMessageModal('Input required', 'Enter room codes.'); return; }
                await mutation(async () => { await archiveCurrent('Before starting inspection-only work'); await clearAndVerifyAllPhotos(); appState.production = null; originalStart(); strictSave(); localStorage.removeItem(PENDING_KEY); });
                return;
            }
            const prepared = showPreview(); if (!prepared) return;
            await mutation(async () => {
                const next = getCleanAppState();
                next.production = prepared; next.roomCodes = C.copy(prepared.roomCodes); next.isInspectionMode = true;
                next.ecsDropdownLists = C.copy(appState.ecsDropdownLists || []); next.ecsListRoleVersion = appState.ecsListRoleVersion;
                await replaceActive(next, 'Before loading weekly work');
                getEcsDropdownLists(); generateCodeCheckItems(); showCodeCheckPage(); updateCodeCheckPage(); strictSave();
            });
        } catch (error) { notifyError(error); }
    };

    const originalIncoming = prepareIncomingInspectionData;
    window.prepareIncomingInspectionData = function (input) {
        const prepared = originalIncoming(input);
        if (prepared.production) {
            prepared.production = C.validateModel(prepared.production);
            prepared.roomCodes = C.copy(prepared.production.roomCodes);
        }
        return prepared;
    };
    window.replaceInspectionWithData = async function (incoming, source = 'import') {
        try {
            const prepared = prepareIncomingInspectionData(incoming);
            await mutation(async () => { await replaceActive(prepared, `Before ${source} import`); refreshUIFromState(); populateInputFromState(); });
            hideFileUploadModal();
            let offlineReady = false;
            try { await ensureOfflineAppReady(); offlineReady = true; } catch { /* data remains safely saved */ }
            showMessageModal('Inspection loaded', `Current work was archived before replacement.\n\n${offlineReady ? 'Offline copy is ready.' : 'Connect once to prepare the offline application.'}`);
            return { loaded: true, offlineReady };
        } catch (error) { notifyError(error); return { loaded: false, offlineReady: false, reason: errorMessage(error) }; }
    };
    window.confirmReset = async function () {
        const node = $('confirmReset'); node.disabled = true; node.textContent = 'Archiving…';
        try {
            await mutation(async () => { await replaceActive(getCleanAppState(), 'Application reset'); });
            weeklyInput.value = ''; ecsInput.value = ''; $('codeList').value = ''; preview = null; previewBox.hidden = true;
            $('codeChecksContainer').replaceChildren(); if ($('pcWorkSummary')) $('pcWorkSummary').hidden = true;
            hideResetModal(); showMainMenu();
            showMessageModal('Application reset', 'The previous inspection and its photos are in More → Recovery backups.');
        } catch (error) { notifyError(error); }
        finally { node.disabled = false; node.textContent = 'Reset'; }
    };

    const originalMinify = _minify, originalUnminify = _unminify;
    window._minify = state => { const value = originalMinify(state); if (state.production) value.pc = C.copy(state.production); return value; };
    window._unminify = value => { const state = originalUnminify(value); state.production = value.pc ? C.validateModel(value.pc) : null; return state; };

    window.ensureOfflineAppReady = async function () {
        const status = value => { const node = $('pcOfflineStatus'); if (node) node.textContent = value; };
        status('Preparing offline copy…');
        try {
        if (!('serviceWorker' in navigator)) throw new Error('Offline installation is unavailable in this browser.');
        const registration = await navigator.serviceWorker.register('./sw.js');
        await withImportTimeout(navigator.serviceWorker.ready, 12000, 'Offline installation timed out.');
        if (!registration.active) throw new Error('Offline worker is not active yet.');
        const controlled = () => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL === new URL('./sw.js', location.href).href;
        if (!controlled()) await withImportTimeout(new Promise(resolve => {
            const changed = () => { if (controlled()) { navigator.serviceWorker.removeEventListener('controllerchange', changed); resolve(); } };
            navigator.serviceWorker.addEventListener('controllerchange', changed); changed();
        }), 12000, 'Waiting for the offline application to take control.');
        const cache = await caches.open(CACHE_NAME);
        const required = ['./index.html', './production.css', './gate-config.js', './production-core.js', './production-ui.js', './vendor/jszip.min.js', './vendor/pako.min.js', './vendor/qrcode.min.js'];
        const found = await Promise.all(required.map(url => cache.match(url)));
        if (found.some(value => !value)) throw new Error('Offline files are incomplete. Connect and reopen the page.');
        status('Offline ready');
        return true;
        } catch (error) { status('Connect to prepare offline files'); throw error; }
    };

    // Card rendering, configuration and exports follow below.
    const api = { archiveCurrent, verifyArchive, restoreActive, replaceActive, recoveryZip, recoveryOperation, strictSave, showRecovery, showPreview, loadExample, photoContext, downloadPhotos, buildPhotoZip, exportCsv, model, itemFor, reset: window.confirmReset, replaceInspection: window.replaceInspectionWithData, ensureOffline: window.ensureOfflineAppReady };
    window.ProductionUI = api;

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            if (model()) {
                appState.production = C.validateModel(model()); appState.roomCodes = C.copy(model().roomCodes); populateInputFromState();
                generateCodeCheckItems(); updateCodeCheckPage(); scheduleSummary();
            }
            const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
            if (pending) {
                // A committed archive is the recovery boundary after interruption.
                const archive = await recoveryOperation('readonly', store => store.get(pending.archiveId));
                if (pending.targetDigest && await digest(appState) === pending.targetDigest) localStorage.removeItem(PENDING_KEY);
                else if (archive) await mutation(() => restoreActive(archive));
                else throw new Error('An interrupted replacement needs review, but its recovery archive is missing. Keep this device data and open Recovery backups.');
            }
        } catch (error) { notifyError(error); }
    });

    const baseGenerate = generateCodeCheckItems;
    const baseQuickRender = renderEcsQuickEntryMode;
    const baseCheckStates = updateCodeCheckStates;
    const baseCameraEligibility = ecsRowHasInspectionData;
    const baseCameraButton = addCameraButtonToRow;
    window.ecsRowHasInspectionData = codeId => !!itemFor(codeId) || baseCameraEligibility(codeId);
    window.addCameraButtonToRow = function (row, ...args) {
        const result = baseCameraButton(row, ...args);
        const body = row.querySelector('.pc-card-body'), camera = row.querySelector('.camera-row');
        if (body && camera) body.appendChild(camera);
        return result;
    };
    window.updateCodeCheckStates = function () { baseCheckStates(); if (model()) scheduleSummary(); };
    window.renderEcsQuickEntryMode = function () { if (model()) generateCodeCheckItems(); else baseQuickRender(); };
    window.generateCodeCheckItems = function () {
        if (!model()) { baseGenerate(); return; }
        if (photoBusy()) return;
        const searchMode = appState.ecsQuickEntryMode;
        appState.ecsQuickEntryMode = false;
        try { baseGenerate(); } finally { appState.ecsQuickEntryMode = searchMode; }
        baseCheckStates(); decorateCards(searchMode); scheduleSummary();
    };
    const baseNavigate = navigateCodeRoom;
    window.navigateCodeRoom = function (direction) {
        if (model() && (photoBusy() || storageFailed || busy)) { showMessageModal('Finish saving first', 'Finish the photo or save the current changes before moving to another room.'); return; }
        if (model() && !saveDataToStorage()) return;
        baseNavigate(direction);
    };
    function decorateCards(searchMode) {
        const current = model(), container = $('codeChecksContainer');
        const roomLabel = Object.keys(appState.roomCodes)[appState.currentCodeRoomIndex];
        let summary = $('pcWorkSummary');
        if (!summary) { summary = element('div', 'pc-work-summary'); summary.id = 'pcWorkSummary'; container.before(summary); }
        summary.hidden = false;
        summary.textContent = `${current.reportingWeek} · ${current.entryDate || 'Work date not set'} · ${current.stats.planned} planned · ${current.items.filter(item => item.origin !== 'Weekly Plan').length} additional`;
        const items = current.items.filter(item => item.roomLabel === roomLabel);
        if (!items.some(item => item.id === current.expandedId)) current.expandedId = items[0] ? items[0].id : '';
        for (const row of [...container.querySelectorAll('.grid-row')]) {
            const codeId = row.querySelector('[data-code-id]') && row.querySelector('[data-code-id]').dataset.codeId;
            const item = itemFor(codeId); if (!item) continue;
            fingerprints.set(item.id, snapshotFor(item));
            row.classList.add('pc-card'); row.dataset.recordId = item.id;
            const body = element('div', 'pc-card-body'); body.id = `pc-body-${current.items.indexOf(item)}`;
            const codeCell = row.querySelector('.code-cell'); codeCell.hidden = true; body.appendChild(codeCell);
            body.appendChild(element('div', 'pc-section-label', 'Inspection'));
            for (const child of [...row.children]) body.appendChild(child);
            const header = element('button', 'pc-card-header'); header.type = 'button';
            header.setAttribute('aria-controls', body.id); header.setAttribute('aria-expanded', String(current.expandedId === item.id));
            const heading = element('span', 'pc-card-heading'), meta = element('span', 'pc-card-meta');
            meta.append(element('span', '', item.canonicalCommodity), element('span', `pc-origin ${item.origin === 'Weekly Plan' ? 'pc-planned' : ''}`, item.origin === 'Weekly Plan' ? 'Weekly plan' : 'Not in weekly plan'));
            if (item.manual) meta.appendChild(element('span', '', 'Manual · unverified'));
            heading.append(element('span', 'pc-card-code', item.ecsCode), meta);
            const status = element('span', 'pc-card-status');
            status.append(element('span', 'pc-readiness', item.touched ? 'Draft' : 'Not started'), element('span', 'pc-card-result', ''), element('span', 'pc-photo-count', 'Checking photos…'));
            header.append(heading, status, element('span', 'pc-chevron', '⌄'));
            row.append(header, body); body.hidden = current.expandedId !== item.id;
            header.addEventListener('click', () => toggleCard(item));
            const progress = element('section', 'pc-progress'); body.appendChild(progress); renderProgress(item, progress);
            const validation = element('div', 'pc-validation'); validation.setAttribute('aria-live', 'polite'); body.appendChild(validation);
            addCameraButtonToRow(row, item.codeId, item.roomLabel, item.ecsCode, false);
            body.addEventListener('input', () => queueMicrotask(() => recordChange(item)));
            body.addEventListener('change', () => queueMicrotask(() => recordChange(item)));
            body.addEventListener('click', () => queueMicrotask(() => recordChange(item)));
        }
        if (searchMode) {
            const search = element('input', 'pc-search'); search.type = 'search'; search.placeholder = 'Find ECS or commodity in this room'; search.setAttribute('aria-label', 'Find ECS in this room'); search.id = 'pcRoomSearch';
            search.addEventListener('input', () => {
                const query = C.norm(search.value);
                for (const row of container.querySelectorAll('.pc-card')) {
                    const item = current.items.find(item => item.id === row.dataset.recordId);
                    row.hidden = !C.norm(`${item.ecsCode} ${item.canonicalCommodity} ${item.origin}`).includes(query);
                }
            });
            container.prepend(search);
        }
        container.appendChild(button('+ Add ECS', () => showAdd(roomLabel), 'pc-add'));
    }
    function toggleCard(item) {
        if (photoBusy() || busy || storageFailed) { showMessageModal('Finish saving first', 'Finish the current photo or save before changing ECS.'); return; }
        const current = model();
        current.expandedId = current.expandedId === item.id ? '' : item.id;
        if (!saveDataToStorage()) return;
        for (const row of document.querySelectorAll('#codeChecksContainer .pc-card')) {
            const open = row.dataset.recordId === current.expandedId;
            row.querySelector('.pc-card-header').setAttribute('aria-expanded', String(open));
            row.querySelector('.pc-card-body').hidden = !open;
        }
    }
    function renderProgress(item, target) {
        target.replaceChildren();
        const resolved = C.workflow(item), values = item.fields;
        target.append(element('div', 'pc-section-label', 'Installation progress'), element('div', 'pc-source',
            `${resolved.family || 'Reference required'} · ${item.structure || 'Structure missing'}\nSource: ${item.sourceGate || 'Gate unavailable'} · ${item.sourcePercent == null ? 'Percentage unavailable' : item.sourcePercent + '%'}${item.sourceUpdatedAt ? ' · updated ' + item.sourceUpdatedAt : ''}`));
        if (item.description) target.appendChild(element('p', 'pc-note', item.description));
        const noProgress = element('input'); noProgress.type = 'checkbox'; noProgress.checked = !!values.noProgress; noProgress.dataset.productionField = 'noProgress';
        target.appendChild(labeled('No Progress', noProgress));
        noProgress.addEventListener('change', () => { values.noProgress = noProgress.checked; recordChange(item); renderProgress(item, target); });
        const grid = element('div', 'pc-grid');
        if (!values.noProgress) {
            const options = [{ value: '', label: resolved.valid ? 'Select GateStatus…' : 'Source workflow required' }, ...resolved.rules.map(rule => ({ value: rule.code, label: `${rule.code} · ${rule.policy === 'Fixed' ? rule.percent + '%' : rule.policy}` }))];
            if (values.gate && !resolved.rules.some(rule => rule.code === values.gate)) options.push({ value: values.gate, label: `${values.gate} (unavailable)` });
            const gate = select(options, values.gate || ''); gate.dataset.productionField = 'gate'; gate.disabled = !resolved.valid;
            const percentage = element('input'); percentage.type = 'number'; percentage.inputMode = 'decimal'; percentage.min = '0'; percentage.step = 'any'; percentage.dataset.productionField = 'percent';
            const selected = resolved.rules.find(rule => rule.code === values.gate);
            percentage.readOnly = !!selected && selected.policy === 'Fixed';
            percentage.max = selected && selected.policy === 'Variable 0-90' ? '90' : '100';
            percentage.value = percentage.readOnly ? selected.percent : (values.percent == null ? '' : values.percent);
            gate.addEventListener('change', () => {
                values.gate = gate.value;
                const rule = resolved.rules.find(value => value.code === values.gate);
                if (rule && rule.policy === 'Fixed') values.percent = rule.percent;
                recordChange(item); renderProgress(item, target);
            });
            percentage.addEventListener('input', () => { values.percent = percentage.value; recordChange(item); });
            grid.append(labeled('GateStatus', gate), labeled('Cumulative progress (%)', percentage));
            for (const definition of C.fieldsFor(item, model().config).filter(value => value.visible !== false)) {
                let control;
                if (definition.type === 'select') {
                    const options = [{ value: '', label: 'Select…' }, ...(definition.options || []).map(value => typeof value === 'object' ? value : { value, label: value })];
                    if (C.meaningful(values[definition.id]) && !options.some(option => option.value === values[definition.id])) options.push({ value: values[definition.id], label: `${values[definition.id]} (retired)` });
                    control = select(options, values[definition.id] || '');
                } else {
                    control = element('input'); control.type = definition.type;
                    if (definition.type === 'checkbox') control.checked = !!values[definition.id];
                    else control.value = values[definition.id] == null ? '' : values[definition.id];
                    if (definition.type === 'number') {
                        control.inputMode = 'decimal'; control.step = 'any';
                        if (definition.min != null) control.min = definition.min;
                        if (definition.max != null) control.max = definition.max;
                    }
                }
                control.dataset.productionField = definition.id;
                control.addEventListener(definition.type === 'select' || definition.type === 'checkbox' ? 'change' : 'input', () => {
                    values[definition.id] = definition.type === 'checkbox' ? control.checked : control.value; recordChange(item);
                });
                grid.appendChild(labeled(`${definition.label}${definition.required ? ' *' : ''}`, control));
            }
        }
        const comments = element('textarea'); comments.rows = 2; comments.value = values.comments || ''; comments.dataset.productionField = 'comments';
        comments.addEventListener('input', () => { values.comments = comments.value; recordChange(item); });
        const delay = element('input'); delay.value = values.DelayCode || ''; delay.dataset.productionField = 'DelayCode';
        delay.addEventListener('input', () => { values.DelayCode = delay.value; recordChange(item); });
        grid.append(labeled(values.noProgress ? 'Reason for No Progress *' : 'Progress notes', comments, 'pc-wide'), labeled('Delay code (if applicable)', delay));
        target.appendChild(grid);
    }
    function inspectionContext(item, photos) {
        const status = appState.checkData[item.codeId], options = getCodeStatusOptions();
        return { inspectionComplete: Number.isInteger(status) && !!options[status], photoCount: photos.filter(photo => photo.codeId === item.codeId).length };
    }
    function scheduleSummary() {
        if (!model() || refreshQueued) return;
        refreshQueued = true;
        queueMicrotask(() => { refreshQueued = false; refreshSummaries().catch(error => console.warn('Summary refresh failed:', error)); });
    }
    async function refreshSummaries() {
        const current = model(); if (!current) return;
        const photos = await getAllPhotos();
        if (current !== model()) return;
        let ready = 0, touched = 0;
        for (const item of current.items) {
            const context = inspectionContext(item, photos), validation = C.validateItem(item, current.config, context);
            const hasData = item.touched || context.inspectionComplete || context.photoCount > 0;
            if (hasData) touched += 1;
            if (validation.ready) ready += 1;
            const row = [...document.querySelectorAll('#codeChecksContainer .pc-card')].find(row => row.dataset.recordId === item.id);
            if (!row) continue;
            const state = row.querySelector('.pc-readiness');
            state.textContent = validation.ready ? 'Ready' : (hasData ? 'Draft' : 'Not started'); state.classList.toggle('pc-ready', validation.ready);
            const inspection = Number.isInteger(appState.checkData[item.codeId]) ? getCodeStatusOptions()[appState.checkData[item.codeId]] : '';
            row.querySelector('.pc-card-result').textContent = [inspection, item.fields.noProgress ? 'No Progress' : [item.fields.gate, validation.reportedPercent == null ? '' : validation.reportedPercent + '%'].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
            row.querySelector('.pc-photo-count').textContent = `${context.photoCount} photo${context.photoCount === 1 ? '' : 's'}`;
            const messages = row.querySelector('.pc-validation');
            messages.classList.toggle('pc-valid', validation.ready);
            messages.textContent = validation.ready ? 'Inspection, progress and photo saved.' : validation.errors.join(' · ');
        }
        const summary = $('pcWorkSummary');
        if (summary) {
            summary.textContent = `${current.reportingWeek} · ${current.entryDate || 'Work date not set'}${current.operator ? ' · ' + current.operator : ''}\n${current.stats.planned} planned · ${current.items.filter(item => item.origin !== 'Weekly Plan').length} additional · ${ready} ready · ${touched - ready} drafts`;
            summary.style.whiteSpace = 'pre-line';
        }
        const badge = $('ecsRemainingBadge'); if (badge) badge.textContent = `${ready} ready · ${touched - ready} drafts`;
    }
    api.refreshSummaries = refreshSummaries;

    function showAdd(roomLabel) {
        if (photoBusy()) { showMessageModal('Finish the photo first', 'Save or cancel the current photo before adding another ECS.'); return; }
        add.body.querySelectorAll(':scope > :not(.pc-dialog-heading)').forEach(node => node.remove());
        const current = model(), roomItem = current.items.find(item => item.roomLabel === roomLabel);
        add.body.appendChild(element('p', 'pc-note', `${roomLabel} · ${current.reportingWeek}`));
        const code = element('input'); code.type = 'text'; code.id = 'pcAddCode'; code.autocomplete = 'off';
        const list = element('datalist'); list.id = 'pcAddCandidates';
        current.items.filter(item => item.roomLabel === roomLabel).forEach(item => { const option = element('option'); option.value = item.ecsCode; option.label = item.canonicalCommodity; list.appendChild(option); });
        code.setAttribute('list', list.id);
        const commodities = [...new Set(current.items.filter(item => item.roomLabel === roomLabel && item.origin === 'Weekly Plan').map(item => item.canonicalCommodity))];
        const commodity = select(commodities, commodities[0]); commodity.id = 'pcAddCommodity';
        add.body.append(labeled('ECS-code', code), list, labeled('Commodity', commodity));
        const message = element('div', 'pc-error-text'); message.setAttribute('role', 'status');
        add.body.append(button('Add and open', () => {
            try {
                const item = C.addManual(current, roomLabel, code.value, commodity.value);
                appState.roomCodes = C.copy(current.roomCodes); current.expandedId = item.id;
                strictSave(); add.node.close(); generateCodeCheckItems(); updateCodeCheckPage();
            } catch (error) { message.textContent = errorMessage(error); }
        }), message);
        code.addEventListener('input', () => {
            const existing = current.items.find(item => item.roomLabel === roomLabel && C.norm(item.ecsCode) === C.norm(code.value));
            if (existing) commodity.value = existing.canonicalCommodity;
        });
        add.node.showModal(); code.focus();
    }

    function photoContext(codeId, timestamp) {
        const item = itemFor(codeId); if (!item) return {};
        return { building: item.building, room: item.room, captureDate: C.londonDate(timestamp), reportingWeek: item.reportingWeek,
            productionItemId: item.id, recordRevision: item.revision, productionSnapshot: C.copy(item.fields), sessionId: model().sessionId };
    }
    const basePhotoSave = savePhoto, baseMultiPhotoSave = savePhotosForTargets;
    window.savePhoto = async (...args) => { const result = await basePhotoSave(...args); scheduleSummary(); return result; };
    window.savePhotosForTargets = async (...args) => { const result = await baseMultiPhotoSave(...args); scheduleSummary(); return result; };
    const baseDeletePhoto = deletePhoto;
    window.deletePhoto = async id => { const result = await baseDeletePhoto(id); scheduleSummary(); return result; };
    const baseStamp = openStampEditor;
    window.openStampEditor = function (dataUrl, codeId, room, code, status, comment, extras, ...rest) {
        const item = itemFor(codeId);
        if (item) {
            extras = [...(extras || []), { label: 'Building', value: item.building }, { label: 'Reporting week', value: item.reportingWeek }];
            if (item.fields.gate) extras.push({ label: `Gate (${item.ecsCode})`, value: item.fields.gate });
            if (item.fields.noProgress) extras.push({ label: `Progress (${item.ecsCode})`, value: 'No Progress' });
        }
        const onSave = rest[0];
        rest[0] = async (...args) => {
            photoSaving = true;
            const container = document.querySelector('.container'), wasInert = container.inert;
            container.inert = true;
            try { return await onSave(...args); }
            finally { container.inert = wasInert; photoSaving = false; scheduleSummary(); }
        };
        return baseStamp(dataUrl, codeId, room, code, status, comment, extras, ...rest);
    };

    function showConfig() {
        let draft = C.copy(model() ? model().config : config);
        editor.body.querySelectorAll(':scope > :not(.pc-dialog-heading)').forEach(node => node.remove());
        editor.body.appendChild(element('p', 'pc-note', 'Set the fields required for each commodity. Stable field and option IDs preserve saved answers when labels or display order change. GateStatus rules stay built into this test build.'));
        const commodityOptions = [...new Set(C.gates.pairs.map(pair => pair.commodity).concat(model() ? model().items.map(item => item.canonicalCommodity) : []))].sort();
        const commodityProfiles = commodityOptions.flatMap(commodity => {
            const families = [...new Set(C.gates.pairs.filter(pair => pair.commodity === commodity).map(pair => commodity === 'ELEC-SUPPORT' ? 'Mechanical' : pair.family))];
            return families.length > 1
                ? families.map(family => ({ value: `commodity:${commodity}|${family}`, label: `${commodity} — ${family === 'Pipe' ? 'Pipework' : family}` }))
                : [{ value: `commodity:${commodity}`, label: commodity }];
        });
        const firstItem = model() && model().items[0];
        const initialCommodity = firstItem ? firstItem.canonicalCommodity : 'ELEC-SUPPORT';
        const specificProfile = firstItem ? `commodity:${initialCommodity}|${C.workflow(firstItem).family}` : '';
        const initialProfile = commodityProfiles.some(profile => profile.value === specificProfile) ? specificProfile : `commodity:${initialCommodity}`;
        const profiles = select([
            ...Object.keys(draft.families).map(value => ({ value: `family:${value}`, label: `${value === 'Pipe' ? 'Pipework' : value} — family defaults` })),
            ...commodityProfiles
        ], initialProfile);
        const photos = element('input'); photos.type = 'checkbox'; photos.checked = draft.photoRequired;
        const inspection = element('input'); inspection.type = 'checkbox'; inspection.checked = draft.inspectionRequired;
        editor.body.append(labeled('Profile / commodity', profiles), labeled('Photo required for Ready', photos), labeled('Inspection result required for Ready', inspection));
        const fieldsContainer = element('div'), message = element('div', 'pc-error-text');
        editor.body.appendChild(fieldsContainer);
        function profileFields() {
            const [type, name] = profiles.value.split(':');
            if (type === 'family') return draft.families[name];
            if (!draft.commodities[name]) {
                const [commodity, chosenFamily] = name.split('|');
                const pair = C.gates.pairs.find(pair => pair.commodity === commodity);
                const family = chosenFamily || (commodity === 'ELEC-SUPPORT' ? 'Mechanical' : (pair ? pair.family : 'Mechanical'));
                draft.commodities[name] = C.copy(draft.families[family] || []);
            }
            return draft.commodities[name];
        }
        function drawFields() {
            fieldsContainer.replaceChildren();
            const fields = profileFields();
            fields.forEach((definition, index) => {
                const row = element('section', 'pc-editor'), grid = element('div', 'pc-grid');
                row.append(element('strong', '', definition.label), element('div', '', `Field ID: ${definition.id}`));
                const label = element('input'); label.value = definition.label; label.addEventListener('input', () => { definition.label = label.value; });
                const type = select(['text', 'number', 'select', 'checkbox'], definition.type);
                type.addEventListener('change', () => { definition.type = type.value; if (type.value === 'number' && definition.min == null) definition.min = 0; if (type.value === 'select' && !definition.options) definition.options = []; drawFields(); });
                const required = element('input'); required.type = 'checkbox'; required.checked = !!definition.required; required.addEventListener('change', () => { definition.required = required.checked; });
                const visible = element('input'); visible.type = 'checkbox'; visible.checked = definition.visible !== false; visible.addEventListener('change', () => { definition.visible = visible.checked; });
                const conditional = element('input'); conditional.type = 'checkbox'; conditional.checked = !!definition.requiredWhenWeldComplete; conditional.addEventListener('change', () => { definition.requiredWhenWeldComplete = conditional.checked; });
                grid.append(labeled('Label', label), labeled('Type', type), labeled('Required', required), labeled('Visible', visible), labeled('Required when weld complete', conditional));
                if (definition.type === 'number') {
                    for (const limit of ['min', 'max']) {
                        const input = element('input'); input.type = 'number'; input.step = 'any'; input.value = definition[limit] == null ? '' : definition[limit];
                        input.addEventListener('input', () => { if (input.value === '') delete definition[limit]; else definition[limit] = Number(input.value); });
                        grid.appendChild(labeled(limit === 'min' ? 'Minimum' : 'Maximum', input));
                    }
                }
                if (definition.type === 'select') {
                    const options = element('textarea'); options.rows = 4;
                    options.value = (definition.options || []).map(value => typeof value === 'object' ? `${value.value} | ${value.label}` : `${value} | ${value}`).join('\n');
                    options.addEventListener('input', () => {
                        definition.options = options.value.split('\n').filter(value => value.trim()).map(value => {
                            const split = value.indexOf('|');
                            return split < 0 ? { value: value.trim(), label: value.trim() } : { value: value.slice(0, split).trim(), label: value.slice(split + 1).trim() };
                        });
                    });
                    grid.appendChild(labeled('Options: stable ID | display label, one per line', options, 'pc-wide'));
                }
                const controls = element('div', 'pc-actions');
                const moveUp = button('Move up', () => { if (index > 0) { [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]]; drawFields(); } }); moveUp.disabled = index === 0;
                const moveDown = button('Move down', () => { if (index < fields.length - 1) { [fields[index + 1], fields[index]] = [fields[index], fields[index + 1]]; drawFields(); } }); moveDown.disabled = index === fields.length - 1;
                controls.append(moveUp, moveDown, button('Retire field', () => { definition.visible = false; definition.required = false; drawFields(); }));
                row.append(grid, controls); fieldsContainer.appendChild(row);
            });
            fieldsContainer.appendChild(button('+ Add field', () => { fields.push({ id: `Custom_${Date.now().toString(36)}`, label: 'Extra information', type: 'text', visible: true, required: false }); drawFields(); }));
        }
        profiles.addEventListener('change', drawFields); drawFields();
        const actions = element('div', 'pc-actions');
        actions.append(button('Apply configuration', () => {
            const previous = C.copy(config), current = model(), oldCurrent = current ? C.copy(current.config) : null;
            try {
                draft.photoRequired = photos.checked; draft.inspectionRequired = inspection.checked;
                draft.version = Math.max(config.version, current ? current.config.version : 0) + 1;
                const accepted = C.validateConfig(draft);
                localStorage.setItem(CONFIG_KEY, JSON.stringify(accepted));
                if (localStorage.getItem(CONFIG_KEY) !== JSON.stringify(accepted)) throw new Error('Configuration could not be verified in storage.');
                if (current) {
                    current.configHistory = current.configHistory || [];
                    current.configHistory.push({ changedAt: new Date().toISOString(), config: oldCurrent });
                    current.config = C.copy(accepted); strictSave();
                }
                config = accepted; editor.node.close();
                if (current) generateCodeCheckItems();
            } catch (error) {
                config = previous; if (current) current.config = oldCurrent;
                try { localStorage.setItem(CONFIG_KEY, JSON.stringify(previous)); } catch { /* current work remains recoverable */ }
                message.textContent = errorMessage(error);
            }
        }, 'button'));
        editor.body.append(actions, message); editor.node.showModal();
    }

    function photoExportEntries(photos) {
        const groups = new Map(), entries = [], usedByFolder = new Map();
        for (const photo of [...photos].sort((a, b) => Number(a.id) - Number(b.id))) {
            const group = photo.groupPhotoId ? `group:${photo.groupPhotoId}` : `photo:${photo.id}`;
            if (!groups.has(group)) groups.set(group, { photo, links: [] });
            groups.get(group).links.push(photo);
        }
        for (const { photo, links } of groups.values()) {
            const folder = C.photoFolder(photo);
            if (links.some(link => C.photoFolder(link) !== folder)) throw new Error('A grouped photo has conflicting building/date metadata. Review it before export.');
            const groupedCodes = getUniqueEcsCodes(photo.groupEcsCodes);
            const batches = groupedCodes.length > 1 ? splitEcsCodesIntoPhotoBatches(groupedCodes, photo.roomName, [], true) : [];
            const copies = batches.length > 1 ? batches.map(codes => ({ ...photo, groupEcsCodes: codes, exportEcsCode: codes.join('_') })) : [photo];
            if (!usedByFolder.has(folder)) usedByFolder.set(folder, new Set());
            for (const copy of copies) {
                const filename = buildUniquePhotoFilename(copy, usedByFolder.get(folder));
                const codes = getUniqueEcsCodes(copy.groupEcsCodes);
                entries.push({ photo: copy, path: `inspection_photos/${folder}/${filename}`, links: links.filter(link => !codes.length || codes.includes(link.ecsCode)) });
            }
        }
        return entries;
    }
    async function buildPhotoZip(photos = null) {
        const source = photos || await getAllPhotos(), entries = photoExportEntries(source), zip = new JSZip();
        for (const entry of entries) zip.file(entry.path, entry.photo.dataUrl.split(',')[1], { base64: true });
        return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } }), entries };
    }
    async function downloadPhotos() {
        try {
            const photos = await getAllPhotos();
            if (!photos.length) { showMessageModal('No photos', 'No photos have been taken yet.'); return; }
            showMessageModal('Preparing ZIP', 'Bundling photos by Building - Date…');
            const result = await buildPhotoZip(photos);
            downloadBlob(result.blob, `inspection_photos_${C.londonDate()}.zip`);
            logExport('photos', { photoIds: photos.map(photo => photo.id), files: result.entries.map(entry => entry.path) });
            showMessageModal('Download ready', `${result.entries.length} photo file(s) are ready in Building - Date folders. Save the ZIP in OneDrive and upload the extracted folders later.`);
        } catch (error) { showMessageModal('Photo export failed', errorMessage(error)); }
    }
    function logExport(kind, details) {
        if (!model()) return;
        model().exports.push({ kind, state: 'download-started', createdAt: new Date().toISOString(), ...details });
        saveDataToStorage();
    }

    async function exportCsv(download = true) {
        const current = model();
        if (!current) return '';
        const photos = await getAllPhotos(), entries = photos.length ? photoExportEntries(photos) : [];
        const allFieldIds = [...new Set(current.items.flatMap(item => Object.keys(item.fields || {}).filter(id => !['gate', 'percent', 'comments', 'noProgress', 'DelayCode'].includes(id))))].sort();
        const extras = getEcsExtraLists();
        const headers = ['RecordID', 'Revision', 'ReportingWeek', 'PlanWeek', 'EntryDate', 'Building', 'Room', 'Commodity', 'CanonicalCommodity', 'ECSCode', 'WorkOrigin', 'Source', 'ManualEntry', 'GateStatusStructure', 'GateCategory', 'DailyLogType', 'MpowerGateStatus', 'MpowerPercent', 'SourceUpdatedAt', 'NewGateStatus', 'NewPercent', 'NoProgress', 'DraftGateStatus', 'DraftPercent', 'InspectionStatus', 'InspectionComment', 'ProgressComments', 'DelayCode', 'ValidationState', 'ValidationIssues', 'RecordedBy', 'SavedAt', 'RuleVersion', 'FieldConfigVersion', 'PhotoCount', 'PhotoRelativePaths', ...allFieldIds, ...extras.map(list => `Inspection:${list.id}:${list.name}`)];
        const rows = [], included = [];
        for (const item of current.items) {
            const context = inspectionContext(item, photos), values = item.fields || {};
            const comment = appState.codeSpecificComments[item.codeId] || '';
            const hasExtra = extras.some(list => C.meaningful(appState.ecsExtraData[list.id] && appState.ecsExtraData[list.id][item.codeId]));
            if (!item.touched && !context.inspectionComplete && !context.photoCount && !comment && !hasExtra) continue;
            const validation = C.validateItem(item, current.config, context);
            const verifiedProgress = validation.hasProgress && validation.progressErrors.length === 0;
            const paths = [...new Set(entries.filter(entry => entry.links.some(photo => photo.codeId === item.codeId)).map(entry => entry.path))];
            const inspectionStatus = context.inspectionComplete ? getCodeStatusOptions()[appState.checkData[item.codeId]] : '';
            rows.push([
                `${current.sessionId}:${item.id}`, item.revision, item.reportingWeek, item.planWeek, current.entryDate,
                item.building, item.room, item.commodity, item.canonicalCommodity, item.ecsCode,
                item.origin === 'Weekly Plan' ? 'Weekly plan' : 'Not in weekly plan', item.origin, item.manual,
                item.structure, validation.workflow.category, validation.workflow.family, item.sourceGate, item.sourcePercent, item.sourceUpdatedAt,
                verifiedProgress && !values.noProgress ? values.gate : '', verifiedProgress && !values.noProgress ? validation.reportedPercent : '',
                values.noProgress === true, verifiedProgress ? '' : (values.gate || ''), verifiedProgress ? '' : (values.percent == null ? '' : values.percent),
                inspectionStatus, comment, values.comments || '', values.DelayCode || '',
                validation.ready ? 'Ready' : (validation.hasProgress ? 'Needs review' : 'Inspection only'), validation.errors.join('; '), current.operator, item.savedAt || '', current.ruleVersion, item.configVersion || current.config.version,
                context.photoCount, paths, ...allFieldIds.map(id => values[id]), ...extras.map(list => (appState.ecsExtraData[list.id] || {})[item.codeId])
            ]);
            included.push({ itemId: item.id, revision: item.revision });
        }
        if (!rows.length && download) { showMessageModal('No recorded work', 'Record an inspection, progress or photo before exporting.'); return ''; }
        const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(C.csvCell).join(',')).join('\r\n') + '\r\n';
        if (download) {
            downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `code_inspection_${C.londonDate()}.csv`);
            logExport('csv', { records: included });
        }
        return csv;
    }
    const baseCsv = exportCodeToCsv;
    window.exportCodeToCsv = function () {
        if (!model()) return baseCsv();
        exportCsv().catch(error => showMessageModal('Export failed', errorMessage(error)));
    };
    const baseJsonDownload = downloadJsonData;
    window.downloadJsonData = function () {
        baseJsonDownload();
        if (model()) logExport('json', { records: model().items.filter(item => item.touched).map(item => ({ itemId: item.id, revision: item.revision })) });
    };

    // Recovery is reachable from the menu, without becoming part of normal work.
    const header = document.querySelector('.header'); header.style.position = 'relative';
    const more = element('details', 'pc-more'), moreSummary = element('summary', '', '⋯'); moreSummary.setAttribute('aria-label', 'More options');
    const morePanel = element('div', 'pc-more-panel');
    morePanel.append(button('Recovery backups', () => { more.open = false; showRecovery().catch(notifyError); }), button('Commodity fields', () => { more.open = false; showConfig(); }));
    more.append(moreSummary, morePanel);
    const offlineStatus = element('span', 'pc-testing-label', 'Preparing offline copy…'); offlineStatus.id = 'pcOfflineStatus'; offlineStatus.setAttribute('role', 'status');
    header.append(more, element('span', 'pc-testing-label', 'TEST BUILD · WEEKLY WORK'), offlineStatus);
    $('resetModal').querySelector('p').textContent = 'Reset the active test inspection? Its data and photos will first be saved in More → Recovery backups.';
    const baseInputPage = showCodeInputPage;
    window.showCodeInputPage = function () { baseInputPage(); if (model()) populateInputFromState(); };
    const baseStateRefresh = refreshUIFromState;
    window.refreshUIFromState = function () {
        baseStateRefresh();
        if (!model() && $('pcWorkSummary')) $('pcWorkSummary').hidden = true;
    };
    // Public hooks support isolated browser regression tests, not live data.
    Object.assign(api, { photoExportEntries, showConfig, showAdd, recordChange, inspectionContext, config: () => C.copy(config) });
})();
