import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../testing/production-core.js');
const weekly = 'Week\tBuilding\tCommodity\tECS-code\nWeek-42-2026\tA\tELEC-SUPPORT\tE1\nWeek-42-2026\tA\tHVAC-DUCT\tD1';
const ecs = 'Building\tRoom\tCommodity\tECS-code\tGateStatusStructure\tGateStatus\tPercentComplete\nA\tR1\tELEC-SUPPORT\tE1\tHPC-BIP-ELEC-SUPPORT\t1ENDS_CUT\t10\nA\tR1\tELECTRICAL SUPPORT\tE2\tHPC-BIP-SCAN-SUPPORT\t1ENDS_CUT\t10\nA\tR2\tHVAC-DUCT\tD1\tHPC-BIP-DUCTING\t1HAND_POS\t20\nA\tR1\tHVAC-DUCT\tWRONG-COMMODITY\tHPC-BIP-DUCTING\t1HAND_POS\t20\nA\tR3\tELEC-SUPPORT\tWRONG-ROOM\tHPC-BIP-ALL-SUPPORTS\t1ENDS_CUT\t10\nB\tR1\tELEC-SUPPORT\tWRONG-BUILDING\tHPC-BIP-ALL-SUPPORTS\t1ENDS_CUT\t10';
const prepared = () => C.prepare(weekly, ecs, { entryDate: '2026-10-15', sessionId: 'test-session' });

test('second paste uses exact building, room and canonical commodity combinations', () => {
    const model = prepared();
    assert.deepEqual(model.items.map(item => item.ecsCode), ['E1', 'D1', 'E2']);
    assert.equal(model.stats.discardedLocation, 2);
    assert.equal(model.stats.discardedCommodity, 1);
    assert.equal(model.items.find(item => item.ecsCode === 'E2').origin, 'ECS Search');
    assert.equal(model.items.filter(item => item.ecsCode === 'E1').length, 1);
    assert.ok(!JSON.stringify(model).includes('WRONG-ROOM'));
});
test('weekly room resolution requires an actual unique planned ECS match', () => {
    assert.throws(() => C.prepare(weekly, ''), /Room cannot be uniquely matched/);
    assert.throws(() => C.prepare('', ecs), /Weekly-data first/);
    assert.throws(() => C.prepare(weekly, ecs + '\nA\tOTHER\tELEC-SUPPORT\tE1\tHPC-BIP-ALL-SUPPORTS\t1ENDS_CUT\t10'), /uniquely matched/);
});
test('same room name in another building does not grant scope', () => {
    const model = C.prepare(weekly + '\nWeek-42-2026\tB\tHVAC-DUCT\tD2', ecs + '\nB\tR1\tHVAC-DUCT\tD2\tHPC-BIP-DUCTING\t1HAND_POS\t20');
    assert.ok(model.roomCodes['A · R1']); assert.ok(model.roomCodes['B · R1']);
    assert.ok(!model.items.some(item => item.ecsCode === 'WRONG-BUILDING'));
});
test('multiple weeks require an explicit choice and retain plan/report scope', () => {
    const mixed = weekly + '\nWeek-41-2026\tA\tELEC-SUPPORT\tE1';
    assert.throws(() => C.prepare(mixed, ecs), /Choose one week/);
    const model = C.prepare(mixed, ecs, { week: '2026-W41' });
    assert.equal(model.reportingWeek, 'Week-41-2026');
    assert.ok(model.items.every(item => item.reportingWeek === 'Week-41-2026'));
    assert.equal(C.normaliseWeek('42', 2026), 'Week-42-2026');
    assert.throws(() => C.normaliseWeek('2025-W53'), /Invalid ISO week/);
});
test('quoted spreadsheet cells preserve commas, newlines and ECS dashes', () => {
    const table = C.parseTable('Building,Room,Commodity,ECS-code,Description\nA,R1,MECH-PIPE,ECS-10-20,"Valve, top\nline"', 'ecs');
    assert.equal(table.rows[0].ecsCode, 'ECS-10-20');
    assert.equal(table.rows[0].description, 'Valve, top\nline');
    assert.throws(() => C.parseTable('Building,Room\nA,"bad', 'ecs'), /not closed/);
});
test('explicit column mapping replaces automatic mapping without duplicate fields', () => {
    const table = C.parseTable('Week,Other week,Building,Commodity,ECS-code\nWeek-40-2026,Week-42-2026,A,ELEC-SUPPORT,E1', 'weekly', { week: 1 });
    assert.equal(table.rows[0].week, 'Week-42-2026');
    assert.equal(table.rows[0].ecsCode, 'E1');
});
test('ELEC-SUPPORT always uses Mechanical/All Supports after a valid source pair', () => {
    const item = prepared().items.find(item => item.ecsCode === 'E2');
    const flow = C.workflow(item);
    assert.equal(flow.family, 'Mechanical'); assert.equal(flow.category, 'HPC-BIP-ALL-SUPPORTS');
    assert.ok(!flow.rules.some(rule => rule.code === '2SCAN'));
    assert.equal(item.structure, 'HPC-BIP-SCAN-SUPPORT');
});
test('MECH-PIPE family depends on its source structure', () => {
    assert.equal(C.workflow({ commodity: 'MECH-PIPE', structure: 'HPC-BIP-EQUIPMENT' }).family, 'Mechanical');
    assert.equal(C.workflow({ commodity: 'MECH-PIPE', structure: 'HPC-BIP-PIPEWORK' }).family, 'Pipe');
    assert.equal(C.workflow({ commodity: 'MECH-PIPE', structure: 'DEFAULT' }).valid, false);
});
test('commodity field overrides preserve distinct Pipework and Equipment families', () => {
    const config = C.defaultConfig();
    config.commodities['MECH-PIPE|Pipe'] = [{ id: 'PipeOnly', label: 'Pipe-only information', type: 'text', required: true }];
    const pipe = { commodity: 'MECH-PIPE', structure: 'HPC-BIP-PIPEWORK' };
    const equipment = { commodity: 'MECH-PIPE', structure: 'HPC-BIP-EQUIPMENT' };
    assert.equal(C.fieldsFor(pipe, config)[0].id, 'PipeOnly');
    assert.ok(!C.fieldsFor(equipment, config).some(field => field.id === 'PipeOnly'));
    assert.ok(C.fieldsFor(equipment, config).some(field => field.id === 'ClampType'));
});
test('fixed gates derive credit; variable gates enforce the allowed range', () => {
    const config = C.defaultConfig(), item = prepared().items[0];
    item.fields = { gate: '2PREP_TACK', percent: 999 };
    let validation = C.validateItem(item, config, { inspectionComplete: true, photoCount: 1 });
    assert.equal(validation.ready, true); assert.equal(validation.reportedPercent, 50);
    const cable = { ...item, commodity: 'CABLE-PULL', structure: 'HPC-BIP-CABLING', fields: { gate: '1INSTALL', percent: 91, InstallationStatus: 'In Progress' }, sourcePercent: 0 };
    validation = C.validateItem(cable, config, { inspectionComplete: true, photoCount: 1 });
    assert.ok(validation.progressErrors.some(value => value.includes('0 to 90')));
    cable.fields.percent = 0;
    assert.equal(C.validateItem(cable, config, { inspectionComplete: true, photoCount: 1 }).ready, true);
});
test('No Progress requires evidence and preserves the source percentage', () => {
    const item = prepared().items[0]; item.fields = { noProgress: true };
    assert.ok(C.validateItem(item, C.defaultConfig()).progressErrors.some(value => value.includes('reason')));
    item.fields.comments = 'Access unavailable';
    const result = C.validateItem(item, C.defaultConfig(), { inspectionComplete: true, photoCount: 1 });
    assert.equal(result.ready, true); assert.equal(result.reportedPercent, null); assert.equal(item.sourcePercent, 10);
});
test('manual add is limited to the current room commodity types and deduplicates', () => {
    const model = prepared();
    assert.throws(() => C.addManual(model, 'A · R1', 'MANUAL', 'HVAC-DUCT'), /outside/);
    const item = C.addManual(model, 'A · R1', 'MANUAL', 'ELEC-SUPPORT');
    assert.equal(item.manual, true); assert.equal(item.origin, 'ECS Search');
    assert.equal(C.addManual(model, 'A · R1', 'manual', 'ELEC-SUPPORT').id, item.id);
    assert.equal(model.items.filter(value => value.ecsCode === 'MANUAL').length, 1);
});
test('import rejects items outside frozen weekly scope', () => {
    const model = prepared(); model.items[2].commodity = 'MECH-PIPE';
    assert.throws(() => C.validateModel(model), /outside/);
    assert.deepEqual(C.validateModel(prepared()).scopes, prepared().scopes);
});
test('retired options remain detectable and invalid custom ranges are rejected', () => {
    const config = C.defaultConfig();
    config.commodities['ELEC-SUPPORT'] = [{ id: 'Outcome', label: 'Outcome', type: 'select', required: true, visible: true, options: [{ value: 'ok', label: 'Accepted' }] }];
    const item = prepared().items[0]; item.fields = { gate: '2PREP_TACK', Outcome: 'ok' };
    assert.equal(C.validateItem(item, config, { inspectionComplete: true, photoCount: 1 }).ready, true);
    item.fields.Outcome = 'retired';
    assert.ok(C.validateItem(item, config).progressErrors.some(value => value.includes('retired')));
    config.families.HVAC.push({ id: 'Length', label: 'Length', type: 'number', min: 10, max: 1 });
    assert.throws(() => C.validateConfig(config), /Minimum exceeds/);
});
test('London capture dates remain stable and unsafe building names cannot escape folders', () => {
    assert.equal(C.londonDate('2026-10-15T23:30:00Z'), '2026-10-16');
    assert.equal(C.photoFolder({ building: '1HL4', timestamp: '2026-10-15T23:30:00Z' }), '1HL4 - 2026-10-16');
    assert.ok(!C.photoFolder({ building: '../A/B', timestamp: '2026-10-15' }).includes('/'));
    assert.notEqual(C.photoFolder({ building: 'A/B', timestamp: '2026-10-15' }), C.photoFolder({ building: 'A_B', timestamp: '2026-10-15' }));
    assert.throws(() => C.photoFolder({ timestamp: '2026-10-15' }), /missing its building/);
});
test('CSV preserves zero/false and escapes spreadsheet formulas', () => {
    assert.equal(C.csvCell(0), '"0"'); assert.equal(C.csvCell(false), '"false"');
    assert.equal(C.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});
