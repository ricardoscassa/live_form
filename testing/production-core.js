/* Shared import, scope, workflow and validation rules for the testing page. */
(function (root) {
    'use strict';
    const gates = typeof module === 'object' && module.exports
        ? require('./gate-config.js') : root.ProductionGateConfig;
    const VERSION = 'weekly-inspection-test-1';
    const copy = value => JSON.parse(JSON.stringify(value));
    const text = value => value == null ? '' : String(value).trim();
    const norm = value => text(value).toUpperCase();
    const key = (...values) => JSON.stringify(values.map(norm));
    const meaningful = value => value !== null && value !== undefined && value !== '';
    const canonical = value => gates.aliases[norm(value)] || norm(value);
    const scopeKey = (building, room, commodity) => key(building, room, canonical(commodity));
    const referenceKey = row => key(row.building, row.ecsCode);
    const number = value => !text(value) ? null : (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text(value)) ? Number(value) : NaN);
    const HEADERS = {
        week: ['week', 'weekkey', 'reportingweek', 'weeknumber'],
        building: ['building', 'buildingcode', 'project'],
        room: ['room', 'roomcode', 'roomnumber', 'roomname', 'parentactivity'],
        commodity: ['commodity', 'commoditytype', 'commoditycode'],
        ecsCode: ['ecscode', 'ecs', 'code'],
        structure: ['gatestatusstructure', 'gatestructure', 'structurecode', 'structure'],
        sourceGate: ['gatestatus', 'mpowergatestatus', 'sourcegate', 'currentgatestatus'],
        sourcePercent: ['percentcomplete', 'mpowerpercent', 'sourcepercent', 'calc pct complete', 'currentpercent'],
        sourceUpdatedAt: ['sourceupdatedat', 'updatedat', 'sourceupdated'],
        description: ['description', 'ecsdescription']
    };
    const headerKey = value => norm(value).replace(/[^A-Z0-9]/g, '');
    const lookupHeader = value => Object.keys(HEADERS).find(name => HEADERS[name].some(alias => headerKey(alias) === headerKey(value)));

    function parseDelimited(input, delimiter) {
        const rows = []; let row = [], cell = '', quoted = false;
        const source = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        for (let index = 0; index < source.length; index += 1) {
            const char = source[index];
            if (char === '"') {
                if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
                else if (!quoted && cell.trim()) cell += char;
                else quoted = !quoted;
            } else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
            else if (char === '\n' && !quoted) {
                row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = '';
            } else cell += char;
        }
        if (quoted) throw new Error('A quoted cell is not closed. Check the pasted rows.');
        row.push(cell); if (row.some(value => value.trim())) rows.push(row);
        return rows;
    }

    function parseTable(input, kind, mapping = {}) {
        if (!text(input)) return { rows: [], columns: [], delimiter: '\t' };
        const first = String(input).replace(/^\uFEFF/, '').split(/\r?\n/)[0];
        const delimiter = ['\t', ',', ';'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
        const data = parseDelimited(input, delimiter);
        const hasHeaders = Object.keys(mapping).length > 0 || data[0].filter(value => lookupHeader(value)).length >= 2;
        let columns = hasHeaders ? data.shift().map(text) : [];
        if (!hasHeaders) {
            if (kind !== 'weekly' || data.some(row => row.length !== 4)) {
                throw new Error(`${kind === 'weekly' ? 'Weekly-data' : 'ECS-data'} needs a header row. Use Building, Room, Commodity, ECS-code and any source columns.`);
            }
            columns = ['Week', 'Building', 'Commodity', 'ECS-code'];
        }
        const positions = Object.values(mapping).map(Number);
        if (new Set(positions).size !== positions.length) throw new Error('Map each column to at most one field.');
        const fields = columns.map((value, index) => {
            const assigned = Object.keys(mapping).find(name => Number(mapping[name]) === index);
            const automatic = lookupHeader(value);
            return assigned || (Object.prototype.hasOwnProperty.call(mapping, automatic) ? undefined : automatic);
        });
        for (const name of Object.keys(HEADERS)) {
            if (fields.filter(field => field === name).length > 1) throw new Error(`More than one column maps to ${name}. Set the column mapping explicitly.`);
        }
        const rows = data.map((values, index) => {
            if (values.length > columns.length && values.slice(columns.length).some(text)) throw new Error(`Row ${index + 2}: more values than column headings.`);
            const row = { rowNumber: index + (hasHeaders ? 2 : 1), raw: {} };
            columns.forEach((column, columnIndex) => {
                row.raw[column] = text(values[columnIndex]);
                if (fields[columnIndex]) row[fields[columnIndex]] = text(values[columnIndex]);
            });
            for (const name of Object.keys(HEADERS)) if (!row[name]) row[name] = '';
            return row;
        });
        return { rows, columns, delimiter };
    }

    function normaliseWeek(value, year = new Date().getFullYear()) {
        const raw = text(value); let week, isoYear;
        let match = raw.match(/^Week[-\s]?(\d{1,2})[-\s](\d{4})$/i) || raw.match(/^(\d{1,2})[\/-](\d{4})$/);
        if (match) { week = Number(match[1]); isoYear = Number(match[2]); }
        else if ((match = raw.match(/^(\d{4})[-\s]?W(\d{1,2})$/i))) { isoYear = Number(match[1]); week = Number(match[2]); }
        else if (/^(?:Week\s*)?\d{1,2}$/i.test(raw)) { week = Number(raw.replace(/Week\s*/i, '')); isoYear = Number(year); }
        else throw new Error(`Invalid week "${raw}". Use Week-42-2026 or 2026-W42.`);
        const jan1 = new Date(Date.UTC(isoYear, 0, 1)).getUTCDay();
        const leap = new Date(Date.UTC(isoYear, 1, 29)).getUTCMonth() === 1;
        const max = jan1 === 4 || (jan1 === 3 && leap) ? 53 : 52;
        if (isoYear < 2000 || isoYear > 2200 || week < 1 || week > max) throw new Error(`Invalid ISO week "${raw}".`);
        return `Week-${String(week).padStart(2, '0')}-${isoYear}`;
    }

    function workflow(item) {
        const commodity = canonical(item.commodity || item.canonicalCommodity);
        const structure = norm(item.structure);
        const pair = gates.pairs.find(value => value.structure === structure && value.commodity === commodity);
        const family = commodity === 'ELEC-SUPPORT' ? 'Mechanical' : (pair ? pair.family : '');
        const category = pair ? (commodity === 'ELEC-SUPPORT' ? 'HPC-BIP-ALL-SUPPORTS' : structure) : '';
        const rules = gates.rules.filter(rule => rule.active && rule.structure === category).sort((a, b) => a.order - b.order);
        return { commodity, structure, family, category, valid: !!pair && rules.length > 0, rules };
    }

    function makeItem(row, origin, week, issues = []) {
        const roomLabel = `${text(row.building)} · ${text(row.room)}`;
        const sourcePercent = number(row.sourcePercent);
        if (!Number.isFinite(sourcePercent) && sourcePercent !== null) issues.push('Invalid source percentage');
        if (Number.isFinite(sourcePercent) && (sourcePercent < 0 || sourcePercent > 100)) issues.push('Source percentage outside 0–100');
        return {
            id: key(row.building, row.room, row.ecsCode), codeId: `${roomLabel}-${text(row.ecsCode)}`,
            referenceKey: referenceKey(row), roomLabel, building: text(row.building), room: text(row.room),
            ecsCode: text(row.ecsCode), commodity: text(row.commodity), canonicalCommodity: canonical(row.commodity),
            planWeek: origin === 'Weekly Plan' ? week : '', reportingWeek: week, origin,
            structure: norm(row.structure), sourceGate: text(row.sourceGate),
            sourcePercent: Number.isFinite(sourcePercent) ? sourcePercent : null,
            sourceUpdatedAt: text(row.sourceUpdatedAt), description: text(row.description),
            sourceRows: [{ rowNumber: row.rowNumber || null, values: copy(row.raw || {}) }],
            metadataIssues: [...new Set(issues)], fields: {}, touched: false, manual: false, revision: 0
        };
    }

    function prepare(weeklyInput, ecsInput, options = {}) {
        const weekly = parseTable(weeklyInput, 'weekly', options.weeklyMapping);
        const ecs = parseTable(ecsInput, 'ecs', options.ecsMapping);
        if (!weekly.rows.length) throw new Error('Paste Weekly-data first. It defines the allowed rooms and commodities.');
        const weeks = [...new Set(weekly.rows.map(row => normaliseWeek(row.week, options.year)))].sort();
        const week = options.week ? normaliseWeek(options.week, options.year) : (weeks.length === 1 ? weeks[0] : '');
        if (!week || !weeks.includes(week)) throw new Error(`Choose one week from Weekly-data: ${weeks.join(', ')}.`);
        const sources = new Map();
        ecs.rows.forEach(row => {
            const id = referenceKey(row);
            if (!sources.has(id)) sources.set(id, []);
            sources.get(id).push(row);
        });
        const planned = [], planReferences = new Map(), stats = {
            weeklyRows: 0, planned: 0, candidates: 0, plannedDuplicates: 0, ecsDuplicates: 0,
            discardedLocation: 0, discardedCommodity: 0, discardedUnresolved: 0
        };
        for (const row of weekly.rows.filter(value => normaliseWeek(value.week, options.year) === week)) {
            stats.weeklyRows += 1;
            if (!row.building || !row.ecsCode || !row.commodity) throw new Error(`Weekly row ${row.rowNumber}: Building, Commodity and ECS-code are required.`);
            const refs = sources.get(referenceKey(row)) || [];
            const rooms = [...new Set(refs.map(value => norm(value.room)).filter(Boolean))];
            if (!row.room && rooms.length !== 1) throw new Error(`Weekly row ${row.rowNumber}: Room cannot be uniquely matched for ${row.ecsCode}. Include Room or a matching ECS-data row.`);
            const room = row.room || refs.find(value => value.room).room;
            const matching = refs.filter(value => norm(value.room) === norm(room));
            const issues = [];
            if (matching.some(value => canonical(value.commodity) !== canonical(row.commodity))) issues.push('Weekly/ECS commodity conflict');
            for (const field of ['structure', 'sourceGate', 'sourcePercent']) {
                const values = [...new Set(matching.map(value => norm(value[field])).filter(Boolean))];
                if (values.length > 1 || (row[field] && values.length && !values.includes(norm(row[field])))) issues.push(`Conflicting ${field} source values`);
            }
            const source = matching.find(value => canonical(value.commodity) === canonical(row.commodity)) || matching[0] || {};
            const merged = { ...source, ...row, room };
            for (const field of ['structure', 'sourceGate', 'sourcePercent', 'sourceUpdatedAt', 'description']) merged[field] = row[field] || source[field] || '';
            const item = makeItem(merged, 'Weekly Plan', week, issues);
            item.sourceRows.push(...matching.map(value => ({ rowNumber: value.rowNumber, values: copy(value.raw) })));
            const previous = planReferences.get(item.referenceKey);
            if (previous) {
                stats.plannedDuplicates += 1;
                if (scopeKey(previous.building, previous.room, previous.commodity) !== scopeKey(item.building, item.room, item.commodity)) throw new Error(`Weekly ECS ${item.ecsCode} has conflicting room or commodity values.`);
                previous.sourceRows.push(...item.sourceRows);
                previous.metadataIssues = [...new Set([...previous.metadataIssues, ...item.metadataIssues])];
                continue;
            }
            planned.push(item); planReferences.set(item.referenceKey, item);
        }
        const scopes = [...new Set(planned.map(item => scopeKey(item.building, item.room, item.commodity)))];
        const locations = new Set(planned.map(item => key(item.building, item.room)));
        const candidates = new Map();
        for (const row of ecs.rows) {
            if (!row.building || !row.room || !row.ecsCode || !row.commodity) { stats.discardedUnresolved += 1; continue; }
            if (!locations.has(key(row.building, row.room))) { stats.discardedLocation += 1; continue; }
            if (!scopes.includes(scopeKey(row.building, row.room, row.commodity))) { stats.discardedCommodity += 1; continue; }
            if (planReferences.has(referenceKey(row))) { stats.plannedDuplicates += 1; continue; }
            const item = makeItem(row, 'ECS Search', week);
            if (candidates.has(item.referenceKey)) {
                const previous = candidates.get(item.referenceKey); stats.ecsDuplicates += 1;
                if (previous.id !== item.id || previous.canonicalCommodity !== item.canonicalCommodity || previous.structure !== item.structure || previous.sourcePercent !== item.sourcePercent || previous.sourceGate !== item.sourceGate) previous.metadataIssues.push('Conflicting duplicate ECS-data rows');
                previous.sourceRows.push(...item.sourceRows);
            } else candidates.set(item.referenceKey, item);
        }
        const items = [...planned, ...candidates.values()];
        const roomCodes = {}, roomScopes = {}, codeIds = new Set();
        for (const item of items) {
            if (codeIds.has(item.codeId)) throw new Error('Ambiguous room/ECS label. Correct the source identifiers.');
            codeIds.add(item.codeId);
            const location = key(item.building, item.room);
            if (roomScopes[item.roomLabel] && roomScopes[item.roomLabel] !== location) throw new Error('Ambiguous building/room labels. Correct the source identifiers.');
            roomScopes[item.roomLabel] = location;
            if (!roomCodes[item.roomLabel]) roomCodes[item.roomLabel] = [];
            roomCodes[item.roomLabel].push(item.ecsCode);
        }
        stats.planned = planned.length; stats.candidates = candidates.size;
        return {
            schema: 1, version: VERSION, ruleVersion: gates.version,
            sessionId: options.sessionId || (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`),
            preparedAt: new Date().toISOString(), reportingWeek: week, entryDate: text(options.entryDate), operator: text(options.operator),
            scopes, plannedKeys: [...planReferences.keys()], items, roomCodes, stats,
            config: validateConfig(options.config || defaultConfig()), exports: [], expandedId: ''
        };
    }

    const field = (id, label, type = 'text', options = {}) => ({ id, label, type, visible: true, required: false, ...options });
    function defaultConfig() {
        const weld = () => [field('FieldWeld', 'Field weld'), field('WeldComplete', 'Weld complete', 'select', { options: ['Yes', 'No'] }), field('WelderID', 'Welder ID')];
        return { version: 1, photoRequired: true, inspectionRequired: true, commodities: {}, families: {
            Electrical: [field('Level', 'Level'), field('InstallationStatus', 'Installation status', 'select', { required: true, options: ['Not Started', 'In Progress', 'Installed', 'On Hold', 'Removed'] }), field('MetersInstalled', 'Metres installed', 'number', { min: 0 })],
            Pipe: [...weld(), field('Material', 'Material', 'select', { options: ['SS', 'CS', 'CSRL', 'SD'] }), field('DiameterMM', 'Diameter (mm)', 'number', { min: 0 }), field('SpoolLengthMM', 'Spool length (mm)', 'number', { min: 0 })],
            Mechanical: [...weld(), field('ClampType', 'Clamp type'), field('BatchNumber', 'Batch number')], HVAC: []
        } };
    }

    function validateConfig(input) {
        const config = copy(input);
        if (!config || !Number.isInteger(config.version) || config.version < 1 || !config.families || !config.commodities) throw new Error('Invalid commodity configuration.');
        for (const fields of [...Object.values(config.families), ...Object.values(config.commodities)]) {
            if (!Array.isArray(fields) || fields.length > 50) throw new Error('A commodity profile must contain at most 50 fields.');
            const ids = new Set();
            for (const value of fields) {
                if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(value.id) || ids.has(value.id) || ['gate', 'percent', 'comments', 'noProgress'].includes(value.id)) throw new Error('Field identifiers must be unique and stable.');
                ids.add(value.id);
                if (!text(value.label) || !['text', 'number', 'select', 'checkbox'].includes(value.type)) throw new Error('Every field needs a label and supported type.');
                if (value.min != null && !Number.isFinite(Number(value.min))) throw new Error(`Invalid minimum for ${value.label}.`);
                if (value.max != null && !Number.isFinite(Number(value.max))) throw new Error(`Invalid maximum for ${value.label}.`);
                if (value.min != null && value.max != null && Number(value.min) > Number(value.max)) throw new Error(`Minimum exceeds maximum for ${value.label}.`);
                const options = (value.options || []).map(option => typeof option === 'object' ? text(option.value) : text(option));
                if (value.type === 'select' && (options.some(option => !option) || new Set(options).size !== options.length)) throw new Error(`Duplicate or blank options for ${value.label}.`);
            }
        }
        return config;
    }

    function fieldsFor(item, config) {
        const commodity = canonical(item.commodity), family = workflow(item).family;
        return config.commodities[`${commodity}|${family}`] || config.commodities[commodity] || config.families[family] || [];
    }

    function validateItem(item, config, context = {}) {
        const values = item.fields || {}, resolved = workflow(item), progressErrors = [], errors = [];
        const hasProgress = values.noProgress === true || ['gate', 'percent', 'comments', 'DelayCode', ...fieldsFor(item, config).map(value => value.id)].some(name => meaningful(values[name]));
        let reportedPercent = null;
        if (hasProgress) {
            if (values.noProgress) {
                if (!text(values.comments)) progressErrors.push('Enter a reason for No Progress');
            } else {
                if (!resolved.valid) progressErrors.push('Reference required: source structure and commodity must match an approved workflow');
                if (item.manual) progressErrors.push('Manual ECS needs a verified source reference');
                progressErrors.push(...(item.metadataIssues || []));
                if (item.sourcePercent == null) progressErrors.push('Reference required: source percentage is missing');
                const rule = resolved.rules.find(value => value.code === values.gate);
                if (!rule) progressErrors.push('Select an active GateStatus');
                else if (rule.policy === 'Fixed') reportedPercent = rule.percent;
                else {
                    reportedPercent = number(values.percent);
                    const max = rule.policy === 'Variable 0-90' ? 90 : 100;
                    if (!Number.isFinite(reportedPercent) || reportedPercent < 0 || reportedPercent > max) progressErrors.push(`Enter a percentage from 0 to ${max}`);
                }
                if (Number.isFinite(reportedPercent) && Number.isFinite(item.sourcePercent) && reportedPercent < item.sourcePercent) progressErrors.push('Reported progress is below the source position; review required');
                for (const definition of fieldsFor(item, config).filter(value => value.visible !== false)) {
                    const value = values[definition.id];
                    const conditional = definition.requiredWhenWeldComplete && values.WeldComplete === 'Yes';
                    if ((definition.required || conditional) && !meaningful(value)) progressErrors.push(`${definition.label} is required`);
                    if (meaningful(value) && definition.type === 'number') {
                        const numeric = number(value);
                        if (!Number.isFinite(numeric) || (definition.min != null && numeric < Number(definition.min)) || (definition.max != null && numeric > Number(definition.max))) progressErrors.push(`Check ${definition.label}`);
                    }
                    if (meaningful(value) && definition.type === 'select' && !(definition.options || []).some(option => (typeof option === 'object' ? option.value : option) === value)) progressErrors.push(`${definition.label} uses a retired or unknown option`);
                }
            }
        }
        if (config.inspectionRequired && !context.inspectionComplete) errors.push('Select the inspection result');
        if (config.photoRequired && !context.photoCount) errors.push('Take a photo');
        errors.push(...progressErrors);
        if (!hasProgress) errors.push('Record progress or select No Progress');
        return { errors: [...new Set(errors)], progressErrors: [...new Set(progressErrors)], hasProgress, reportedPercent, workflow: resolved, ready: errors.length === 0 };
    }

    function addManual(model, roomLabel, ecsCode, commodity) {
        if (!text(ecsCode)) throw new Error('Enter an ECS-code.');
        const current = model.items.find(item => item.roomLabel === roomLabel);
        if (!current) throw new Error('Choose a weekly room before adding an ECS.');
        const existing = model.items.find(item => referenceKey({ building: current.building, ecsCode }) === item.referenceKey);
        if (existing) {
            if (existing.roomLabel !== roomLabel) throw new Error('That ECS already belongs to another room. Review its source location.');
            return existing;
        }
        if (!model.scopes.includes(scopeKey(current.building, current.room, commodity))) throw new Error('That commodity is outside this room\'s Weekly-data scope.');
        const item = makeItem({ building: current.building, room: current.room, commodity: canonical(commodity), ecsCode }, 'ECS Search', model.reportingWeek);
        item.manual = true; item.touched = true; item.revision = 1;
        model.items.push(item); model.roomCodes[roomLabel].push(item.ecsCode);
        return item;
    }

    function validateModel(input) {
        const model = copy(input);
        if (!model || model.schema !== 1 || !Array.isArray(model.items) || !Array.isArray(model.scopes) || !Array.isArray(model.plannedKeys) || !text(model.sessionId)) throw new Error('Unsupported weekly-work package.');
        model.reportingWeek = normaliseWeek(model.reportingWeek);
        model.config = validateConfig(model.config);
        const ids = new Set(), codeIds = new Set(), plannedScopes = new Set();
        for (const item of model.items) {
            if (item.origin === 'Weekly Plan' && model.plannedKeys.includes(item.referenceKey)) plannedScopes.add(scopeKey(item.building, item.room, item.commodity));
        }
        if (model.scopes.some(scope => !plannedScopes.has(scope)) || plannedScopes.size !== model.scopes.length) throw new Error('The package scope is not defined by its weekly planned work.');
        const expectedRooms = {};
        for (const item of model.items) {
            if (!item.building || !item.room || !item.ecsCode || !item.commodity || !model.scopes.includes(scopeKey(item.building, item.room, item.commodity))) throw new Error('The package contains an ECS outside its weekly room/commodity scope.');
            if (!['Weekly Plan', 'ECS Search'].includes(item.origin) || (item.origin === 'ECS Search' && model.plannedKeys.includes(item.referenceKey))) throw new Error('Invalid planned-work origin.');
            if (item.id !== key(item.building, item.room, item.ecsCode) || item.referenceKey !== referenceKey(item) || item.roomLabel !== `${text(item.building)} · ${text(item.room)}` || item.codeId !== `${item.roomLabel}-${item.ecsCode}` || ids.has(item.id) || codeIds.has(item.codeId)) throw new Error('Invalid or duplicate ECS identity.');
            if (item.reportingWeek !== model.reportingWeek) throw new Error('A report belongs to a different reporting week.');
            ids.add(item.id); codeIds.add(item.codeId);
            if (!expectedRooms[item.roomLabel]) expectedRooms[item.roomLabel] = [];
            expectedRooms[item.roomLabel].push(item.ecsCode);
        }
        model.roomCodes = expectedRooms;
        return model;
    }

    function londonDate(value = new Date()) {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
        const part = name => parts.find(value => value.type === name).value;
        return `${part('year')}-${part('month')}-${part('day')}`;
    }
    function photoFolder(photo) {
        const building = text(photo.building);
        if (!building) throw new Error('A photo is missing its building. Assign its source building before exporting.');
        let safe = building.replace(/[\\/<>:"?*|\x00-\x1f]/g, '_').replace(/\.+$/g, '').trim().slice(0, 72);
        if (!safe || safe === '.' || safe === '..') safe = 'building';
        if (safe !== building) {
            let hash = 2166136261;
            for (const char of building) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
            safe += `-${hash.toString(16)}`;
        }
        const day = photo.captureDate || londonDate(photo.timestamp);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid photo capture date.');
        return `${safe} - ${day}`;
    }
    function csvCell(value) {
        let str = value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
        if (/^[=+@\-\t\r]/.test(str)) str = `'${str}`;
        return `"${str.replace(/"/g, '""')}"`;
    }
    const api = { VERSION, gates, HEADERS, copy, text, norm, key, canonical, scopeKey, referenceKey, meaningful, number, parseDelimited, parseTable, normaliseWeek, workflow, prepare, defaultConfig, validateConfig, fieldsFor, validateItem, addManual, validateModel, londonDate, photoFolder, csvCell };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ProductionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
