import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { LIMITS, ValidationError, emptyBook, emptyAsset } from '../src/domain.mjs';
import { attachmentBytes, createAttachment, verifyBook } from '../src/attachments.mjs';

// Generated 1x1 RGB images; these fixtures contain no personal documents or metadata.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4UGEDAAQAAaViv5svAAAAAElFTkSuQmCC';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDVooor5M+6P//Z';
const png = () => new Uint8Array(Buffer.from(PNG_BASE64, 'base64'));

function pdf(padding = 0) {
  let text = `%PDF-1.7\n%${'x'.repeat(padding)}\n`;
  const offsets = [0];
  for (const [index, body] of [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>',
  ].entries()) {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = text.length;
  text += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  text += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

async function document(id = 'doc-1', bytes = png(), mimeType = 'image/png') {
  return createAttachment({ id, fileName: `${id}.${mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/jpeg' ? 'jpg' : 'png'}`, mimeType, bytes });
}

function bookWith(documents) {
  const book = emptyBook('test-book');
  const asset = emptyAsset('test-asset');
  asset.name = 'Bem fictício';
  asset.documents = documents;
  book.assets = [asset];
  return book;
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

test('generated PNG has a known SHA256 and independent byte-for-byte encoding', async () => {
  const bytes = png();
  const result = await document();
  assert.equal(result.sha256, '38fb9a5803602bbeab0442c37c3e7cd75a3dbb69136535df839484b47bcda6cc');
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.dataBase64, PNG_BASE64);
  assert.equal(result.sizeBytes, bytes.length);
  assert.deepEqual(attachmentBytes(result), bytes);
  assert.equal(result.mimeType, 'image/png');
});

test('actual generated JPEG and a minimal synthetic PDF are supported', async () => {
  const jpeg = new Uint8Array(Buffer.from(JPEG_BASE64, 'base64'));
  const a = await document('jpeg', jpeg, 'image/jpeg');
  assert.equal(a.sha256, 'b2c319eddaf6174d0f75827274d6578b2616c0d6a6f00483e9440c1b61fdfe32');
  const bytes = pdf();
  const b = await document('pdf', bytes, 'application/pdf');
  assert.equal(b.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(attachmentBytes(b), bytes);
});

test('uses the injected Web Crypto provider and snapshots caller bytes before awaiting', async () => {
  const bytes = png();
  const original = bytes.slice();
  let release;
  let entered = false;
  const gate = new Promise(resolve => { release = resolve; });
  const crypto = { subtle: { async digest(algorithm, value) {
    entered = true;
    assert.equal(algorithm, 'SHA-256');
    await gate;
    return webcrypto.subtle.digest(algorithm, value);
  } } };
  const pending = createAttachment({ id: 'injected', fileName: 'um.png', mimeType: 'image/png', bytes }, { crypto });
  assert.equal(entered, true);
  bytes.fill(0);
  release();
  const created = await pending;
  assert.deepEqual(attachmentBytes(created), original);
  assert.equal(created.sha256, createHash('sha256').update(original).digest('hex'));
});

test('rejects unsupported types and bytes whose MIME signatures differ', async () => {
  const html = new TextEncoder().encode('<!doctype html><html></html>');
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
  for (const mimeType of ['text/html', 'image/svg+xml', 'application/octet-stream', 'image/PNG', '']) {
    await assert.rejects(createAttachment({ id: 'bad-type', fileName: 'arquivo', mimeType, bytes: png() }), ValidationError);
  }
  for (const bytes of [html, svg, Uint8Array.of(1, 2, 3, 4), Uint8Array.of(137, 80)]) {
    for (const mimeType of ['image/png', 'image/jpeg', 'application/pdf']) {
      await assert.rejects(createAttachment({ id: 'bad-signature', fileName: 'arquivo', mimeType, bytes }), ValidationError);
    }
  }
  await assert.rejects(document('wrong-mime', png(), 'application/pdf'), ValidationError);
});

test('rejects invalid creation fields, plain arrays, empty bytes and unknown keys', async () => {
  const valid = { id: 'doc', fileName: 'teste.png', mimeType: 'image/png', bytes: png() };
  for (const patch of [{ id: '../bad' }, { fileName: '' }, { fileName: 'a\nb.png' },
    { fileName: 'a'.repeat(LIMITS.maxFileNameLength + 1) }, { bytes: [] },
    { bytes: new Uint8Array() }, { extra: true }]) {
    await assert.rejects(createAttachment({ ...valid, ...patch }), ValidationError);
  }
  await assert.rejects(createAttachment(null), ValidationError);
  await assert.rejects(createAttachment(valid, { crypto: {} }), ValidationError);
});

test('strict Base64 rejects whitespace, URL alphabet, omitted padding and nonzero pad bits', () => {
  const cases = [
    ['Zg', 1], ['Zg=', 1], [' Zg==', 1], ['Zg==\n', 1], ['Zg== ', 1], ['Zg==Zg==', 2],
    ['Zh==', 1], ['Zm9=', 2], ['_w==', 1], ['-w==', 1], ['====', 1], ['A===', 1], ['', 1],
  ];
  for (const [dataBase64, sizeBytes] of cases) {
    assert.throws(() => attachmentBytes({ dataBase64, sizeBytes }), ValidationError, dataBase64);
  }
  assert.deepEqual(attachmentBytes({ dataBase64: 'Zg==', sizeBytes: 1 }), Uint8Array.of(102));
  assert.deepEqual(attachmentBytes({ dataBase64: 'Zm8=', sizeBytes: 2 }), Uint8Array.of(102, 111));
  assert.deepEqual(attachmentBytes({ dataBase64: 'Zm9v', sizeBytes: 3 }), Uint8Array.of(102, 111, 111));
});

test('decoded size is checked independently and cannot be faked with the declaration', () => {
  for (const sizeBytes of [0, -1, 1.5, NaN, Infinity, '1', LIMITS.maxDocumentBytes + 1, 2]) {
    assert.throws(() => attachmentBytes({ dataBase64: 'Zg==', sizeBytes }), ValidationError);
  }
  assert.throws(() => attachmentBytes(null), ValidationError);
  assert.throws(() => attachmentBytes({ dataBase64: 'A'.repeat(Math.ceil(LIMITS.maxDocumentBytes / 3) * 4 + 4), sizeBytes: 1 }), ValidationError);
});

test('verifyBook clones deeply and verifies every attachment without mutating input', async () => {
  const book = bookWith([await document('png'), await document('pdf', pdf(), 'application/pdf')]);
  const original = structuredClone(book);
  freezeDeep(book);
  const result = await verifyBook(book, { crypto: webcrypto });
  assert.deepEqual(result, original);
  assert.notEqual(result, book);
  assert.notEqual(result.assets[0].documents[0], book.assets[0].documents[0]);
  result.assets[0].name = 'Alterado';
  assert.deepEqual(book, original);
});

test('any altered hash, validly encoded bytes, MIME or size rejects the whole book', async () => {
  const good = bookWith([await document('first'), await document('last', pdf(), 'application/pdf')]);
  const modifications = [
    doc => { doc.sha256 = '0'.repeat(64); },
    doc => { const bytes = Buffer.from(doc.dataBase64, 'base64'); bytes[10] ^= 1; doc.dataBase64 = bytes.toString('base64'); },
    doc => { doc.mimeType = 'image/png'; },
    doc => { doc.sizeBytes += 1; },
    doc => { doc.dataBase64 += '\n'; },
    doc => { doc.unrecognized = true; },
  ];
  for (const modify of modifications) {
    const bad = structuredClone(good);
    modify(bad.assets[0].documents[1]);
    const before = structuredClone(bad);
    freezeDeep(bad);
    await assert.rejects(verifyBook(bad), ValidationError);
    assert.deepEqual(bad, before);
  }
});

test('a recomputed hash cannot make HTML masquerade as an accepted document type', async () => {
  const original = await document('doc');
  const bytes = new TextEncoder().encode('<html>fictício</html>');
  const forged = { ...original, sizeBytes: bytes.length,
    dataBase64: Buffer.from(bytes).toString('base64'),
    sha256: createHash('sha256').update(bytes).digest('hex') };
  await assert.rejects(verifyBook(bookWith([forged])), ValidationError);
});

test('per-document and aggregate byte limits are inclusive and enforced using generated bytes', async () => {
  // A synthetic PDF with a long comment, correct object offsets and a real xref table.
  // Decimal xref offset width can change with padding; adjust until the boundary is exact.
  let padding = LIMITS.maxDocumentBytes - pdf().length;
  let bytes;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    bytes = pdf(padding);
    padding += LIMITS.maxDocumentBytes - bytes.length;
  }
  assert.equal(bytes.length, LIMITS.maxDocumentBytes);
  const max = await document('max', bytes, 'application/pdf');
  assert.equal((await verifyBook(bookWith([max]))).assets[0].documents[0].sizeBytes, LIMITS.maxDocumentBytes);
  await assert.rejects(document('over', new Uint8Array(LIMITS.maxDocumentBytes + 1), 'application/pdf'), ValidationError);
  const book = emptyBook('total-book');
  for (let assetIndex = 0; assetIndex < 2; assetIndex += 1) {
    const asset = emptyAsset(`asset-${assetIndex}`);
    asset.name = 'Exemplo de limite';
    asset.documents = Array.from({ length: 3 }, (_, index) => ({ ...max, id: `doc-${assetIndex}-${index}` }));
    book.assets.push(asset);
  }
  assert.equal(book.assets.flatMap(asset => asset.documents).reduce((sum, doc) => sum + doc.sizeBytes, 0), LIMITS.maxTotalDocumentBytes);
  assert.equal((await verifyBook(book)).assets.length, 2);
  book.assets[1].documents.push(await document('one-over'));
  await assert.rejects(verifyBook(book), ValidationError);
});

test('document count and file-name boundaries are inclusive', async () => {
  const base = await createAttachment({ id: 'attachment-book', fileName: 'a'.repeat(LIMITS.maxFileNameLength),
    mimeType: 'image/png', bytes: png() });
  const documents = Array.from({ length: LIMITS.maxDocumentsPerAsset }, (_, index) => ({ ...base, id: `count-${index}` }));
  const book = bookWith(documents);
  assert.equal((await verifyBook(book)).assets[0].documents.length, LIMITS.maxDocumentsPerAsset);
  documents.push({ ...base, id: 'over-count' });
  await assert.rejects(verifyBook(book), ValidationError);
});
