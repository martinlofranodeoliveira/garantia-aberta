import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LIMITS, ValidationError, emptyBook, emptyAsset, validateBook } from '../src/domain.mjs';
import { createAttachment, attachmentBytes } from '../src/attachments.mjs';
import { exportBackup, importBackup, exportInventoryCsv, backupFilename } from '../src/backup.mjs';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4UGEDAAQAAaViv5svAAAAAElFTkSuQmCC';

async function sampleBook() {
  const book = emptyBook('inventario-ficticio');
  book.title = 'Inventário fictício';
  const asset = emptyAsset('bem-ficticio');
  Object.assign(asset, { name: 'Câmera fictícia', category: 'Eletrônicos', brand: 'Marca fictícia',
    model: 'Modelo A', serial: 'SERIE-FICTICIA', purchasedOn: '2026-01-01',
    warrantyUntil: '2026-11-10', notes: 'Primeira linha; "aspas"\nSegunda linha' });
  asset.documents = [await createAttachment({ id: 'anexo-ficticio', fileName: 'pixel-ficticio.png',
    mimeType: 'image/png', bytes: new Uint8Array(Buffer.from(PNG_BASE64, 'base64')) })];
  asset.maintenance = [
    { id: 'limpeza-ficticia', title: 'Limpeza fictícia', dueOn: '2026-11-07', completedOn: '', notes: 'Pano macio' },
    { id: 'inspecao-ficticia', title: 'Inspeção fictícia', dueOn: '2026-11-20', completedOn: '2026-11-06', notes: 'Antecipada' },
  ];
  book.assets = [asset];
  return book;
}

// Independent state-machine CSV reader, including escaped quotes and quoted newlines.
function readCsv(text) {
  assert.equal(text.charCodeAt(0), 0xfeff);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      row.push(cell); cell = '';
    } else if (char === '\r' && text[index + 1] === '\n' && !quoted) {
      row.push(cell); rows.push(row); row = []; cell = ''; index += 1;
    } else {
      cell += char;
    }
  }
  assert.equal(quoted, false);
  assert.equal(cell, '');
  assert.deepEqual(row, []);
  return rows;
}

test('complete JSON round trip preserves metadata, tasks and independently verified document bytes', async () => {
  const book = await sampleBook();
  const before = structuredClone(book);
  const output = await exportBackup(book);
  assert.ok(output.endsWith('\n'));
  assert.ok(output.includes('\n  "schemaVersion"'));
  const raw = JSON.parse(output);
  assert.equal(raw.assets[0].documents[0].dataBase64, PNG_BASE64);
  const restored = await importBackup(output);
  assert.deepEqual(restored, validateBook(before));
  assert.notEqual(restored, book);
  assert.deepEqual(book, before);
  const doc = restored.assets[0].documents[0];
  assert.equal(createHash('sha256').update(attachmentBytes(doc)).digest('hex'), doc.sha256);
});

test('empty inventory round trips without creating documents or external state', async () => {
  const book = emptyBook('vazio');
  const restored = await importBackup(await exportBackup(book));
  assert.deepEqual(restored, book);
  assert.notEqual(restored, book);
});

test('import and export reject a tampered final document as a whole and preserve caller state', async () => {
  const existing = await sampleBook();
  const before = structuredClone(existing);
  const corrupted = structuredClone(existing);
  corrupted.assets[0].documents.push({ ...corrupted.assets[0].documents[0], id: 'anexo-adulterado', sha256: '0'.repeat(64) });
  await assert.rejects(importBackup(JSON.stringify(corrupted)), ValidationError);
  await assert.rejects(exportBackup(corrupted), ValidationError);
  assert.deepEqual(existing, before);
  const restored = await importBackup(await exportBackup(existing));
  restored.assets[0].documents[0].fileName = 'outro.png';
  assert.deepEqual(existing, before);
});

test('strict import rejects duplicate/unknown keys, malformed JSON, excess depth and oversize UTF8', async () => {
  const json = JSON.stringify(emptyBook('safe'));
  for (const text of [
    json.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    json.replace('"schemaVersion":1', '"schemaVersion":1,"schema\\u0056ersion":1'),
    json.replace('"assets":[]', '"assets":[],"unknown":true'),
    `${json} false`, '{', '[', 'null', '\uFEFF' + json,
    '['.repeat(LIMITS.maxJsonDepth + 1) + '0' + ']'.repeat(LIMITS.maxJsonDepth + 1),
    ' '.repeat(LIMITS.maxJsonBytes + 1),
    'á'.repeat(Math.floor(LIMITS.maxJsonBytes / 2) + 1),
  ]) {
    await assert.rejects(importBackup(text), ValidationError);
  }
  const exact = json + ' '.repeat(LIMITS.maxJsonBytes - Buffer.byteLength(json));
  assert.deepEqual(await importBackup(exact), emptyBook('safe'));
});

async function nearLimitBook() {
  const book = emptyBook('formatted-size-boundary');
  for (let assetIndex = 0; assetIndex < 51; assetIndex += 1) {
    const asset = emptyAsset(`asset-${assetIndex}`);
    asset.name = 'Fictício';
    for (let taskIndex = 0; taskIndex < LIMITS.maxMaintenancePerAsset; taskIndex += 1) {
      asset.maintenance.push({ id: `task-${assetIndex}-${taskIndex}`, title: 'Fictícia',
        dueOn: '2026-11-08', completedOn: '', notes: 'a'.repeat(LIMITS.maxNotesLength) });
    }
    book.assets.push(asset);
  }
  book.assets[0].documents = [(await sampleBook()).assets[0].documents[0]];
  return book;
}

test('export falls back to compact JSON when formatting exceeds 20 MiB and preserves all data', async () => {
  const book = await nearLimitBook();
  assert.ok(Buffer.byteLength(JSON.stringify(book)) <= LIMITS.maxJsonBytes);
  assert.ok(Buffer.byteLength(`${JSON.stringify(book, null, 2)}\n`) > LIMITS.maxJsonBytes);
  assert.equal(validateBook(book).assets.length, 51);
  const output = await exportBackup(book);
  assert.equal(output, `${JSON.stringify(validateBook(book))}\n`);
  assert.ok(Buffer.byteLength(output) <= LIMITS.maxJsonBytes);
  const restored = await importBackup(output);
  assert.deepEqual(restored, book);
  const document = restored.assets[0].documents[0];
  assert.equal(document.dataBase64, PNG_BASE64);
  assert.equal(createHash('sha256').update(attachmentBytes(document)).digest('hex'), document.sha256);
});

test('a compact book of exactly 20 MiB exports without a newline and fully reimports', async () => {
  const book = await nearLimitBook();
  const filler = emptyAsset('exact-boundary-filler');
  for (let index = 0; index < LIMITS.maxMaintenancePerAsset; index += 1) {
    filler.maintenance.push({ id: `filler-task-${index}`, title: 'Fictícia',
      dueOn: '2026-11-08', completedOn: '', notes: '' });
  }
  book.assets.push(filler);
  let remaining = LIMITS.maxJsonBytes - Buffer.byteLength(JSON.stringify(book));
  assert.ok(remaining > 0 && remaining < LIMITS.maxMaintenancePerAsset * LIMITS.maxNotesLength);
  for (const task of filler.maintenance) {
    const length = Math.min(remaining, LIMITS.maxNotesLength);
    task.notes = 'a'.repeat(length);
    remaining -= length;
  }
  assert.equal(remaining, 0);
  const compact = JSON.stringify(validateBook(book));
  assert.equal(Buffer.byteLength(compact), LIMITS.maxJsonBytes);
  const output = await exportBackup(book);
  assert.equal(output, compact);
  assert.equal(output.endsWith('\n'), false);
  assert.equal(Buffer.byteLength(output), LIMITS.maxJsonBytes);
  const restored = await importBackup(output);
  assert.deepEqual(restored, book);
  const document = restored.assets[0].documents[0];
  assert.equal(createHash('sha256').update(attachmentBytes(document)).digest('hex'), document.sha256);
});

test('CSV uses Portuguese columns, BOM, semicolons and CRLF and preserves quoted metadata', async () => {
  const book = await sampleBook();
  const before = structuredClone(book);
  const csv = exportInventoryCsv(book, '2026-11-08');
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(new TextEncoder().encode(csv).slice(0, 3).join(','), '239,187,191');
  const rows = readCsv(csv);
  assert.equal(rows.length, 4);
  const headings = rows[0];
  assert.equal(headings[0], 'Tipo');
  assert.ok(headings.includes('Término informado'));
  for (const row of rows) assert.equal(row.length, headings.length);
  const metadata = Object.fromEntries(headings.map((heading, index) => [heading, rows[1][index]]));
  assert.equal(metadata.Bem, 'Câmera fictícia');
  assert.equal(metadata['Observações do bem'], book.assets[0].notes);
  assert.equal(metadata['Dias até o término'], '2');
  assert.equal(metadata['Quantidade de comprovantes'], '1');
  assert.equal(rows[2][headings.indexOf('Situação da manutenção')], 'Passado');
  assert.equal(rows[2][headings.indexOf('Dias até a manutenção')], "'-1");
  assert.equal(rows[3][headings.indexOf('Situação da manutenção')], 'Concluída');
  assert.equal(rows[3][headings.indexOf('Data prevista')], '2026-11-20');
  assert.equal(rows[3][headings.indexOf('Concluída em')], '2026-11-06');
  for (const secret of [PNG_BASE64, book.assets[0].documents[0].sha256, 'pixel-ficticio.png']) {
    assert.equal(csv.includes(secret), false);
  }
  assert.deepEqual(book, before);
});

test('CSV neutralizes formula prefixes before escaping, including whitespace and quoted newlines', async () => {
  const book = await sampleBook();
  const attacks = ['=1+1', '+SUM(1;2)', '-1+2', '@SUM(1;2)', '  =1+1', '\t=1+1', '\n=1+1', '\uFEFF=1+1', '=HYPERLINK("https://example.invalid";"teste")'];
  for (const attack of attacks) {
    book.assets[0].notes = attack;
    book.assets[0].maintenance[0].notes = attack;
    const rows = readCsv(exportInventoryCsv(book, '2026-11-08'));
    const assetNotes = rows[0].indexOf('Observações do bem');
    const taskNotes = rows[0].indexOf('Observações da manutenção');
    assert.equal(rows[1][assetNotes], `'${attack}`);
    assert.equal(rows[2][taskNotes], `'${attack}`);
  }
  book.assets[0].notes = '\r=1+1';
  assert.throws(() => exportInventoryCsv(book, '2026-11-08'), ValidationError);
});

test('CSV requires an explicit valid today even for an empty inventory', () => {
  for (const today of [undefined, '', '2026-02-30', '08/11/2026']) {
    assert.throws(() => exportInventoryCsv(emptyBook('empty'), today), ValidationError);
  }
  assert.equal(readCsv(exportInventoryCsv(emptyBook('empty'), '2026-11-08')).length, 1);
});

test('filename is deterministic, ASCII safe, and accepts only json/csv', () => {
  const book = emptyBook('inventario_ABC-42');
  book.title = '../ação "&;<script>\\?';
  assert.equal(backupFilename(book), 'garantia-aberta-inventario_ABC-42.json');
  assert.equal(backupFilename(book, 'csv'), 'garantia-aberta-inventario_ABC-42.csv');
  assert.match(backupFilename(book), /^[A-Za-z0-9_-]+\.json$/);
  for (const extension of ['html', 'JSON', '../json', 'json.exe', '', null]) {
    assert.throws(() => backupFilename(book, extension), ValidationError);
  }
});
