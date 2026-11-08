import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { IDBFactory } from 'fake-indexeddb';
import { createApp } from '../src/app.mjs';
import { openBookStore, StorageError } from '../src/storage.mjs';
import { emptyBook, createExampleBook } from '../src/domain.mjs';
import { exportBackup, importBackup } from '../src/backup.mjs';

const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let fixtureId = 0;
async function fixture(options = {}) {
  const { window, document } = parseHTML(markup), downloads = [], idb = options.indexedDB || new IDBFactory();
  const dbName = 'ui-fixture-' + ++fixtureId; let serial = 0;
  const app = await createApp({ document, eventTarget: window,
    storeFactory: options.storeFactory || (() => openBookStore({ indexedDB: idb, dbName })),
    makeId: () => `ui-${fixtureId}-${++serial}`, today: () => '2026-11-08',
    onDownload: (...args) => downloads.push(args) });
  const $ = id => document.getElementById(id);
  const dispatch = async (element, type) => { element.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true })); await app.whenIdle(); };
  const click = id => dispatch($(id), 'click');
  const input = async (id, value) => { $(id).value = value; await dispatch($(id), 'input'); };
  const submit = id => dispatch($(id), 'submit');
  const check = async value => { $('remember').checked = value; await dispatch($('remember'), 'change'); };
  const openFirst = async () => dispatch($('asset-list').querySelector('[data-open]'), 'click');
  const file = async (id, value) => { Object.defineProperty($(id), 'files', { configurable: true, value: [value] }); await dispatch($(id), 'change'); };
  const otherStore = () => openBookStore({ indexedDB: idb, dbName });
  return { app, window, document, $, click, input, submit, check, dispatch, openFirst, file, downloads, otherStore, dbName };
}

async function addNamedAsset(f, name = 'Bem de teste') {
  await f.click('new-asset'); await f.input('asset-name', name); await f.submit('asset-form');
}

const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const fileObject = (bytes = pdf, name = 'comprovante.pdf', type = 'application/pdf') => ({ name, type, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer });

test('starts empty without implicit persistence and offers a usable inventory', async t => {
  const f = await fixture(); t.after(() => f.app.destroy());
  assert.equal(f.app.getBook().assets.length, 0); assert.equal(f.$('inventory-empty').hidden, false);
  assert.equal(f.$('remember').checked, false);
  const db = await f.otherStore(); t.after(() => db.close()); assert.deepEqual(await db.load(), { revision: 0, book: null });
});

test('real form preserves invalid dates and only commits a corrected identifiable asset', async t => {
  const f = await fixture(); t.after(() => f.app.destroy());
  await f.click('new-asset'); await f.submit('asset-form');
  assert.equal(f.app.getBook().assets.length, 0); assert.equal(f.$('asset-name').getAttribute('aria-invalid'), 'true');
  await f.input('asset-name', 'Cafeteira'); await f.input('asset-purchasedOn', '2026-11-08'); await f.input('asset-warrantyUntil', '2026-11-07'); await f.submit('asset-form');
  assert.equal(f.app.getBook().assets.length, 0); assert.equal(f.$('asset-name').value, 'Cafeteira');
  await f.input('asset-warrantyUntil', '2027-11-08'); await f.submit('asset-form');
  assert.equal(f.app.getBook().assets[0].warrantyUntil, '2027-11-08'); assert.equal(f.$('view-detail').hidden, false);
});

test('unsaved fields survive navigation and export attempts until cancel or save', async t => {
  const f = await fixture(); t.after(() => f.app.destroy());
  await f.click('new-asset'); await f.input('asset-name', 'Em edição'); await f.click('nav-backup');
  assert.equal(f.$('view-edit').hidden, false); assert.equal(f.$('asset-name').value, 'Em edição');
  await f.click('export-backup'); assert.equal(f.downloads.length, 0);
  await f.click('cancel-edit'); await f.click('nav-backup'); assert.equal(f.$('view-backup').hidden, false);
});

test('example, search, category and detail actions operate on actual records', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await f.click('load-example');
  assert.equal(f.app.getBook().assets.length, 3); assert.match(f.$('notice-text').textContent, /fictício/);
  const name = f.app.getBook().assets[0].name; await f.input('search', name);
  assert.equal(f.$('asset-list').children.length, 1); await f.openFirst();
  assert.equal(f.$('detail-title').textContent, name);
  await f.click('back-inventory'); await f.input('search', 'não existe tal bem'); assert.equal(f.$('no-results').hidden, false);
});

test('attachment upload, safe download and undo preserve exact bytes', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f);
  await f.file('document-file', fileObject(pdf, '../../comprovante.pdf'));
  const book = f.app.getBook(); assert.equal(book.assets[0].documents.length, 1);
  assert.equal(book.assets[0].documents[0].sha256, Buffer.from(await webcrypto.subtle.digest('SHA-256', pdf)).toString('hex'));
  await f.dispatch(f.$('document-list').querySelector('[data-download-doc]'), 'click');
  assert.deepEqual(f.downloads[0][0], pdf); assert.ok(!f.downloads[0][2].includes('/'));
  await f.dispatch(f.$('document-list').querySelector('[data-remove-doc]'), 'click'); assert.equal(f.app.getBook().assets[0].documents.length, 0);
  await f.click('undo'); assert.equal(f.app.getBook().assets[0].documents.length, 1);
});

test('oversized and spoofed attachments cannot change the inventory', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f); const before = f.app.getBook();
  let read = false; await f.file('document-file', { ...fileObject(), size: 2097153, arrayBuffer: async () => { read = true; return pdf.buffer; } });
  assert.equal(read, false); assert.deepEqual(f.app.getBook(), before);
  await f.file('document-file', fileObject(new TextEncoder().encode('<script>1</script>'), 'falso.pdf'));
  assert.deepEqual(f.app.getBook(), before);
});

test('maintenance completion needs a commit and retains its planned day in history', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f);
  await f.click('new-task'); await f.input('task-title', 'Trocar filtro'); await f.input('task-dueOn', '2026-11-15'); await f.submit('task-form');
  assert.equal(f.app.getBook().assets[0].maintenance[0].completedOn, '');
  await f.dispatch(f.$('task-list').querySelector('[data-complete-task]'), 'click');
  assert.equal(f.$('task-completedOn').value, '2026-11-08'); assert.equal(f.app.getBook().assets[0].maintenance[0].completedOn, '');
  await f.submit('task-form'); const task = f.app.getBook().assets[0].maintenance[0];
  assert.equal(task.dueOn, '2026-11-15'); assert.equal(task.completedOn, '2026-11-08');
  await f.click('nav-agenda'); assert.equal(f.$('agenda-empty').hidden, false);
});

test('valid backup is staged before replacement; failed integrity import is atomic', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f, 'Preservar'); await f.click('nav-backup');
  const next = createExampleBook(), text = await exportBackup(next), before = f.app.getBook();
  await f.file('import-file', { name: 'copia.json', size: text.length, text: async () => text });
  assert.deepEqual(f.app.getBook(), before); assert.equal(f.$('import-confirm').hidden, false);
  await f.click('confirm-import'); assert.deepEqual(f.app.getBook(), next);
  await f.click('nav-backup'); const bad = '{"schemaVersion":1,"unknown":true}';
  await f.file('import-file', { name: 'bad.json', size: bad.length, text: async () => bad });
  assert.deepEqual(f.app.getBook(), next); assert.equal(f.$('import-confirm').hidden, true);
});

test('backup contains uploaded bytes and CSV stays a metadata export', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f); await f.file('document-file', fileObject());
  await f.click('nav-backup'); await f.click('export-backup'); await f.click('export-csv');
  const restored = await importBackup(f.downloads[0][0]); assert.deepEqual(restored, f.app.getBook());
  assert.ok(!f.downloads[1][0].includes(restored.assets[0].documents[0].dataBase64)); assert.match(f.downloads[1][0], /^\uFEFF/);
});

test('transactional persistence recovers across UI instances and opt-out retains this tab', async t => {
  const idb = new IDBFactory(), f = await fixture({ indexedDB: idb }); t.after(() => f.app.destroy());
  await addNamedAsset(f); await f.click('nav-backup'); await f.check(true);
  const db = await f.otherStore(); t.after(() => db.close()); assert.equal((await db.load()).book.assets.length, 1);
  const recovered = await fixture({ storeFactory: () => openBookStore({ indexedDB: idb, dbName: f.dbName }) });
  t.after(() => recovered.app.destroy()); assert.equal(recovered.app.getBook().assets.length, 1); assert.equal(recovered.$('remember').checked, true);
  await f.check(false); assert.equal((await db.load()).book, null); assert.equal(f.app.getBook().assets.length, 1);
});

test('competing writes pause local saves while preserving both versions and allowing backup', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f); await f.click('nav-backup'); await f.check(true);
  const db = await f.otherStore(); t.after(() => db.close()); const stored = await db.load(); stored.book.title = 'Outra aba'; await db.save(stored.book, stored.revision);
  await f.click('nav-inventory'); await f.openFirst(); await f.click('edit-asset'); await f.input('asset-name', 'Minha edição'); await f.submit('asset-form');
  assert.equal(f.app.getBook().assets[0].name, 'Minha edição'); assert.equal((await db.load()).book.title, 'Outra aba');
  assert.equal(f.$('reload-saved').hidden, false); assert.match(f.$('save-status').textContent, /Conflito/);
  await f.click('nav-backup'); await f.click('export-backup'); assert.equal((await importBackup(f.downloads[0][0])).assets[0].name, 'Minha edição');
  await f.check(false); assert.equal((await db.load()).book.title, 'Outra aba'); await f.check(true); assert.equal(f.$('reload-saved').hidden, false);
  await f.click('reload-saved'); assert.equal(f.app.getBook().title, 'Outra aba');
});

test('quota failure remains explicitly in memory and does not block a valid backup', async t => {
  const f = await fixture({ storeFactory: async () => ({ load: async () => ({ revision: 0, book: null }), save: async () => { throw new StorageError('quota'); }, close() {} }) });
  t.after(() => f.app.destroy()); await addNamedAsset(f); await f.click('nav-backup'); await f.check(true);
  assert.match(f.$('save-status').textContent, /pausado/); await f.click('export-backup'); assert.equal((await importBackup(f.downloads[0][0])).assets.length, 1);
});

test('untrusted names and notes stay text and destructive actions require the explicit control', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f, '<img src=x onerror=alert(1)>');
  await f.click('edit-asset'); await f.input('asset-notes', '<script>alert(1)</script>'); await f.submit('asset-form');
  assert.equal(f.$('view-detail').querySelectorAll('img,script').length, 0); assert.match(f.$('detail-title').textContent, /<img/);
  await f.click('ask-remove-asset'); assert.equal(f.app.getBook().assets.length, 1); await f.click('cancel-remove-asset'); assert.equal(f.app.getBook().assets.length, 1);
  await f.click('ask-remove-asset'); await f.click('remove-asset'); assert.equal(f.app.getBook().assets.length, 0); await f.click('undo'); assert.equal(f.app.getBook().assets.length, 1);
});

test('example cannot overwrite a confirmed saved inventory without its replacement confirmation', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f, 'Meu bem'); await f.click('nav-backup'); await f.check(true);
  const db = await f.otherStore(); t.after(() => db.close()); const before = f.app.getBook(), stored = await db.load();
  await f.click('load-example'); assert.deepEqual(f.app.getBook(), before); assert.deepEqual(await db.load(), stored); assert.equal(f.$('confirm-example').hidden, false);
  await f.click('cancel-example'); assert.deepEqual(f.app.getBook(), before);
  await f.click('load-example'); await f.click('confirm-example-replace'); assert.equal(f.app.getBook().assets.length, 3); assert.equal((await db.load()).revision, stored.revision + 1);
});

test('initial pending load blocks edits until the persisted book is verified and rendered', async t => {
  const { window, document } = parseHTML(markup); let resolveLoad;
  const gate = new Promise(resolve => { resolveLoad = resolve; });
  const init = createApp({ document, eventTarget: window, today: () => '2026-11-08', makeId: () => 'initial-book',
    storeFactory: () => ({ load: () => gate, close() {} }) });
  const $ = id => document.getElementById(id);
  assert.equal($('new-asset').disabled, true); assert.equal(document.querySelector('main').getAttribute('aria-busy'), 'true');
  $('new-asset').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  assert.equal($('view-edit').hidden, true);
  const saved = createExampleBook(); resolveLoad({ revision: 4, book: saved });
  const app = await init; t.after(() => app.destroy()); assert.deepEqual(app.getBook(), saved);
  assert.equal($('new-asset').disabled, false); assert.equal(document.querySelector('main').getAttribute('aria-busy'), 'false');
});

test('a new rejected file selection clears any previously staged backup', async t => {
  const f = await fixture(); t.after(() => f.app.destroy()); await addNamedAsset(f); await f.click('nav-backup'); const before = f.app.getBook();
  const text = await exportBackup(createExampleBook()); await f.file('import-file', { name: 'valid.json', size: text.length, text: async () => text });
  assert.equal(f.$('import-confirm').hidden, false);
  await f.file('import-file', { name: 'too-large.json', size: 20971521, text: async () => { throw Error('must not read'); } });
  assert.equal(f.$('import-confirm').hidden, true); await f.click('confirm-import'); assert.deepEqual(f.app.getBook(), before);
});
