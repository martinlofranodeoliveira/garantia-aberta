import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, ValidationError, emptyBook, emptyAsset, validateBook, parseBookJson,
  addAsset, replaceAsset, removeAsset, addDocument, removeDocument,
  addMaintenance, replaceMaintenance, removeMaintenance,
  daysBetween, warrantyInfo, agenda, createExampleBook,
} from '../src/domain.mjs';

const task = (id = 'task-1', overrides = {}) => ({
  id, title: 'Limpeza fictícia', dueOn: '2026-11-09', completedOn: '', notes: '', ...overrides,
});
const document = (id = 'doc-1', sizeBytes = 1, overrides = {}) => ({
  id, fileName: 'comprovante-ficticio.pdf', mimeType: 'application/pdf', sizeBytes,
  sha256: '0'.repeat(64), dataBase64: Buffer.alloc(sizeBytes).toString('base64'), ...overrides,
});
const asset = (id = 'asset-1', overrides = {}) => ({ ...emptyAsset(id), name: 'Bem fictício', ...overrides });
const book = (...assets) => ({ ...emptyBook('book-1'), assets });

function invalid(callback, field, message) {
  assert.throws(callback, error => error instanceof ValidationError &&
    (field === undefined || error.field === field) &&
    (message === undefined || message.test(error.message)));
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

test('limites públicos e construtores não dependem de relógio ou IDs implícitos', () => {
  assert.equal(LIMITS.maxAssets, 200);
  assert.equal(LIMITS.maxDocumentsPerAsset, 5);
  assert.equal(LIMITS.maxDocumentBytes, 2097152);
  assert.equal(LIMITS.maxTotalDocumentBytes, 12582912);
  assert.equal(LIMITS.maxJsonBytes, 20971520);
  assert.equal(LIMITS.maxMaintenancePerAsset, 100);
  assert.equal(LIMITS.maxJsonDepth, 32);
  assert.equal(Object.isFrozen(LIMITS), true);
  assert.deepEqual(emptyBook('meu-livro'), {
    schemaVersion: 1, id: 'meu-livro', title: 'Meu inventário', assets: [],
  });
  assert.deepEqual(emptyAsset('meu-bem'), { id: 'meu-bem', name: '', category: '', brand: '',
    model: '', serial: '', purchasedOn: '', warrantyUntil: '', notes: '', documents: [], maintenance: [] });
  invalid(() => emptyBook(), 'id');
  invalid(() => emptyAsset(), 'asset.id');
  const error = new ValidationError('field', 'Mensagem');
  assert.equal(error.name, 'ValidationError');
  assert.equal(error.field, 'field');
  assert.equal(error.message, 'Mensagem');
});

test('validação devolve clone canônico independente, inclusive com objetos de protótipo null', () => {
  const original = deepFreeze(book(asset('a', { documents: [document()], maintenance: [task()] })));
  const clone = validateBook(original);
  assert.deepEqual(clone, original);
  assert.notEqual(clone, original);
  assert.notEqual(clone.assets, original.assets);
  assert.notEqual(clone.assets[0], original.assets[0]);
  assert.notEqual(clone.assets[0].documents, original.assets[0].documents);
  assert.notEqual(clone.assets[0].documents[0], original.assets[0].documents[0]);
  assert.notEqual(clone.assets[0].maintenance[0], original.assets[0].maintenance[0]);
  clone.assets[0].documents[0].fileName = 'outro.pdf';
  clone.assets[0].maintenance[0].title = 'Outra tarefa';
  assert.equal(original.assets[0].documents[0].fileName, 'comprovante-ficticio.pdf');
  assert.equal(original.assets[0].maintenance[0].title, 'Limpeza fictícia');
  const nullPrototype = Object.assign(Object.create(null), original);
  assert.equal(Object.getPrototypeOf(validateBook(nullPrototype)), Object.prototype);
});

test('schema recusa campos ausentes/desconhecidos em todos os níveis', () => {
  for (const path of ['book', 'asset', 'document', 'task']) {
    for (const mutation of ['extra', 'missing']) {
      const input = book(asset('a', { documents: [document()], maintenance: [task()] }));
      const target = { book: input, asset: input.assets[0], document: input.assets[0].documents[0],
        task: input.assets[0].maintenance[0] }[path];
      if (mutation === 'extra') target.unknown = true;
      else delete target[Object.keys(target).at(-1)];
      invalid(() => validateBook(input));
    }
  }
  for (const schemaVersion of [0, 2, '1', null, NaN]) {
    invalid(() => validateBook({ ...book(), schemaVersion }), 'schemaVersion');
  }
  for (const value of [null, undefined, [], 1, 'book', new Date(0)]) invalid(() => validateBook(value), 'book');
});

test('objetos e listas recusam protótipos, accessors, símbolos, lacunas e propriedades adicionais', () => {
  const customPrototype = Object.assign(Object.create({ private: true }), book());
  invalid(() => validateBook(customPrototype), 'book');
  let called = false;
  const getter = book();
  Object.defineProperty(getter, 'title', { enumerable: true, get() { called = true; return 'x'; } });
  invalid(() => validateBook(getter), 'book.title');
  assert.equal(called, false);
  const hidden = book();
  Object.defineProperty(hidden, 'title', { value: '', enumerable: false });
  invalid(() => validateBook(hidden), 'book.title');
  invalid(() => validateBook({ ...book(), [Symbol('extra')]: true }), 'book');

  const lists = [Array(1), Object.assign([], { extra: 1 }), Object.assign([], { [Symbol('extra')]: 1 })];
  const getterList = [asset('a')];
  Object.defineProperty(getterList, '0', { enumerable: true, get() { called = true; return asset('a'); } });
  lists.push(getterList);
  const customList = [];
  Object.setPrototypeOf(customList, null);
  lists.push(customList);
  for (const assets of lists) invalid(() => validateBook({ ...book(), assets }));
  assert.equal(called, false);
  invalid(() => validateBook(book(asset('a', { documents: Array(1) }))));
  invalid(() => validateBook(book(asset('a', { maintenance: Object.assign([], { extra: 1 }) }))));
});

test('IDs ASCII têm limite explícito e unicidade global entre livro, bens, documentos e tarefas', () => {
  assert.equal(emptyBook('A_0-' + 'z'.repeat(76)).id.length, 80);
  for (const id of ['', 'a'.repeat(81), 'ação', 'a b', 'a/b', 'a.b', '\n', 'a\n', 'a\r', 'a\u2028', 1, null]) {
    invalid(() => emptyBook(id), 'id');
  }
  for (const input of [
    book(asset('same'), asset('same')),
    book(asset('same', { documents: [document('same')] })),
    book(asset('a', { documents: [document('same')], maintenance: [task('same')] })),
    book(asset('a', { documents: [document('same')] }), asset('b', { maintenance: [task('same')] })),
    book(asset('a', { maintenance: [task('same')] }), asset('b', { maintenance: [task('same')] })),
    book(asset('book-1')),
  ]) invalid(() => validateBook(input), undefined, /únicos/);
  assert.equal(validateBook(book(asset('A'), asset('a'))).assets.length, 2);
});

test('textos preservam conteúdo literal e limitam pontos Unicode, não unidades UTF-16', () => {
  const emojiTitle = '😀'.repeat(LIMITS.maxBookTitleLength);
  const input = book(asset('a', { name: '  <script>texto</script>  ', notes: 'Linha 1\n\tLinha 2' }));
  input.title = emojiTitle;
  const valid = validateBook(input);
  assert.equal(valid.title, emojiTitle);
  assert.equal(Buffer.byteLength(valid.title), LIMITS.maxBookTitleLength * 4);
  assert.equal(valid.assets[0].name, input.assets[0].name);
  assert.equal(valid.assets[0].notes, input.assets[0].notes);
  invalid(() => validateBook({ ...input, title: emojiTitle + 'x' }), 'title');
  const fields = {
    name: LIMITS.maxAssetNameLength, category: LIMITS.maxCategoryLength,
    brand: LIMITS.maxBrandLength, model: LIMITS.maxModelLength,
    serial: LIMITS.maxSerialLength, notes: LIMITS.maxNotesLength,
  };
  for (const [field, maximum] of Object.entries(fields)) {
    assert.equal(validateBook(book(asset('a', { [field]: 'é'.repeat(maximum) }))).assets[0][field].length, maximum);
    invalid(() => validateBook(book(asset('a', { [field]: 'é'.repeat(maximum + 1) }))), `assets[0].${field}`);
  }
  invalid(() => validateBook(book(asset('a', { maintenance: [task('t', { title: 'x'.repeat(LIMITS.maxTaskTitleLength + 1) })] }))));
  invalid(() => validateBook(book(asset('a', { documents: [document('d', 1, { fileName: 'x'.repeat(LIMITS.maxFileNameLength + 1) })] }))));
  for (const text of ['\uD800', '\uDC00', 'a\uD800z', '\uD800\uD800', '\uDC00\uD800']) {
    invalid(() => validateBook({ ...book(), title: text }), 'title');
  }
  for (const code of [...Array.from({ length: 32 }, (_, index) => index), ...Array.from({ length: 33 }, (_, index) => index + 127)]) {
    invalid(() => validateBook({ ...book(), title: String.fromCharCode(code) }), 'title');
    if (![9, 10].includes(code)) invalid(() => validateBook(book(asset('a', { notes: String.fromCharCode(code) }))));
  }
  invalid(() => validateBook({ ...book(), title: 123 }), 'title');
});

test('datas civis válidas, limites do calendário e ordem compra/término', () => {
  for (const date of ['0001-01-01', '0096-02-29', '0099-12-31', '0100-03-01',
    '1600-02-29', '2000-02-29', '2024-02-29', '9999-12-31']) {
    assert.equal(daysBetween(date, date), 0);
    assert.equal(validateBook(book(asset('a', { purchasedOn: date, warrantyUntil: date }))).assets[0].purchasedOn, date);
  }
  for (const date of ['', '0000-01-01', '10000-01-01', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-32', '2026-04-31', '2026-02-29', '1900-02-29', '0100-02-29', '2026-1-01',
    '2026-01-1', ' 2026-01-01', '2026-01-01\n', '2026-01-01\u2028', '2026-01-01Z', '2026-01-01T00:00:00', null, 20260101]) {
    invalid(() => daysBetween(date, '2026-01-01'), 'fromDate');
    invalid(() => daysBetween('2026-01-01', date), 'toDate');
    if (date !== '') invalid(() => validateBook(book(asset('a', { warrantyUntil: date }))));
  }
  invalid(() => validateBook(book(asset('a', { purchasedOn: '2026-02-02', warrantyUntil: '2026-02-01' }))), 'assets[0].warrantyUntil');
  invalid(() => validateBook(book(asset('a', { maintenance: [task('t', { dueOn: '' })] }))), 'assets[0].maintenance[0].dueOn');
  const early = task('t', { dueOn: '2026-11-20', completedOn: '2026-11-01' });
  assert.equal(validateBook(book(asset('a', { maintenance: [early] }))).assets[0].maintenance[0].dueOn, '2026-11-20');
  invalid(() => validateBook(book(asset('a', { maintenance: [task('t', { completedOn: '2026-02-30' })] }))));
});

function utcOracle(date) {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(0);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCFullYear(year, month - 1, day);
  return result.getTime() / 86400000;
}

test('diferença de dias confere com oráculo UTC inclusive anos abaixo de 100 e transições de horário', () => {
  const dates = ['0001-01-01', '0004-02-29', '0099-12-31', '0100-01-01', '0400-02-29',
    '1582-10-04', '1582-10-15', '1900-02-28', '1900-03-01', '2000-02-28', '2000-03-01',
    '2018-11-03', '2018-11-04', '2019-02-16', '2019-02-17', '2024-02-29', '9999-12-31'];
  for (const year of [1, 4, 50, 96, 99, 100, 400, 1600, 1900, 2026, 2400, 9999]) {
    for (let month = 1; month <= 12; month++) dates.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-15`);
  }
  for (let first = 0; first < dates.length; first++) {
    for (let second = 0; second < dates.length; second += 7) {
      assert.equal(daysBetween(dates[first], dates[second]), utcOracle(dates[second]) - utcOracle(dates[first]),
        `${dates[first]} → ${dates[second]}`);
    }
  }
  assert.equal(daysBetween('0099-12-31', '0100-01-01'), 1);
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2);
  assert.equal(daysBetween('1900-02-28', '1900-03-01'), 1);
  assert.equal(daysBetween('0001-01-01', '9999-12-31'), 3652058);
});

test('metadados de anexos exigem MIME, hash lexical, nome e inteiros limitados', () => {
  for (const mimeType of ['application/pdf', 'image/png', 'image/jpeg']) {
    assert.equal(validateBook(book(asset('a', { documents: [document('d', 1, { mimeType })] }))).assets[0].documents[0].mimeType, mimeType);
  }
  for (const [field, value] of [
    ['mimeType', 'image/jpg'], ['mimeType', 'text/html'], ['mimeType', 'IMAGE/PNG'],
    ['mimeType', { toString: () => 'application/pdf' }], ['sha256', 'A'.repeat(64)],
    ['sha256', 'g'.repeat(64)], ['sha256', '0'.repeat(63)], ['sha256', '0'.repeat(64) + '\n'], ['sha256', 0],
    ['fileName', ''], ['fileName', 'arquivo\n.pdf'], ['sizeBytes', 0], ['sizeBytes', -1],
    ['sizeBytes', 1.5], ['sizeBytes', '1'], ['sizeBytes', NaN], ['sizeBytes', Infinity],
    ['sizeBytes', LIMITS.maxDocumentBytes + 1],
  ]) invalid(() => validateBook(book(asset('a', { documents: [document('d', 1, { [field]: value })] }))), `assets[0].documents[0].${field}`);
  // O domínio deliberadamente não verifica os bytes reais, assinatura MIME ou hash.
  assert.equal(validateBook(book(asset('a', { documents: [document('d')] }))).assets[0].documents[0].sha256, '0'.repeat(64));
});

test('Base64 canônico confere comprimento declarado e bits finais sem aceitar variantes permissivas', () => {
  for (const [sizeBytes, dataBase64] of [[1, 'AA=='], [1, '/w=='], [2, 'AAA='], [2, '//8='], [3, 'AAAA'], [3, '////']]) {
    const input = book(asset('a', { documents: [document('d', sizeBytes, { dataBase64 })] }));
    assert.equal(validateBook(input).assets[0].documents[0].dataBase64, dataBase64);
  }
  for (const [sizeBytes, dataBase64] of [[1, 'AB=='], [1, '/x=='], [2, 'AAB='], [2, '//9='],
    [1, 'AA'], [1, 'AA='], [1, 'AA==='], [1, 'AAA='], [2, 'AA=='], [3, 'AAA='],
    [1, 'AA ='], [1, 'AA\n='], [1, 'AA-_'], [1, 'AAé='], [1, '=A=='], [1, 'A==='],
    [1, 'data:application/pdf;base64,AA=='], [1, null], [1, '']]) {
    invalid(() => validateBook(book(asset('a', { documents: [document('d', sizeBytes, { dataBase64 })] }))), 'assets[0].documents[0].dataBase64');
  }
});

test('fronteira de 2 MiB por documento e 12 MiB no conjunto, incluindo todas as mutações', () => {
  const maximumDocument = document('large', LIMITS.maxDocumentBytes);
  const input = book(asset('a', { documents: [maximumDocument] }));
  assert.equal(validateBook(input).assets[0].documents[0].sizeBytes, LIMITS.maxDocumentBytes);
  const six = book(asset('a', { documents: [0, 1, 2].map(index => ({ ...maximumDocument, id: `doc-${index}` })) }),
    asset('b', { documents: [3, 4, 5].map(index => ({ ...maximumDocument, id: `doc-${index}` })) }));
  const full = validateBook(six);
  assert.equal(full.assets.flatMap(item => item.documents).reduce((sum, item) => sum + item.sizeBytes, 0), LIMITS.maxTotalDocumentBytes);
  const snapshot = JSON.stringify(full);
  invalid(() => addDocument(full, 'a', document('one-extra-byte')), undefined, /12 MiB/);
  invalid(() => addAsset(full, asset('c', { documents: [document('one-extra-byte')] })), undefined, /12 MiB/);
  invalid(() => replaceAsset(full, { ...full.assets[0], documents: [...full.assets[0].documents, document('one-extra-byte')] }), undefined, /12 MiB/);
  assert.equal(JSON.stringify(full), snapshot);
  const freed = removeDocument(full, 'b', 'doc-5');
  assert.equal(addDocument(freed, 'a', { ...maximumDocument, id: 'replacement' }).assets[0].documents.length, 4);
});

test('limites de bens, documentos e tarefas são inclusivos e não permitem ultrapassagem nas mutações', () => {
  const fullAssets = validateBook(book(...Array.from({ length: LIMITS.maxAssets }, (_, index) => asset(`a-${index}`))));
  invalid(() => addAsset(fullAssets, asset('overflow')), 'assets');
  assert.equal(fullAssets.assets.length, LIMITS.maxAssets);
  const fullDocuments = validateBook(book(asset('a', {
    documents: Array.from({ length: LIMITS.maxDocumentsPerAsset }, (_, index) => document(`d-${index}`)),
  })));
  invalid(() => addDocument(fullDocuments, 'a', document('overflow')), 'assets[0].documents');
  const fullTasks = validateBook(book(asset('a', {
    maintenance: Array.from({ length: LIMITS.maxMaintenancePerAsset }, (_, index) => task(`t-${index}`)),
  })));
  invalid(() => addMaintenance(fullTasks, 'a', task('overflow')), 'assets[0].maintenance');
  assert.equal(replaceMaintenance(fullTasks, 'a', task('t-0', { title: 'Editada' })).assets[0].maintenance.length, LIMITS.maxMaintenancePerAsset);
  assert.equal(removeMaintenance(fullTasks, 'a', 't-0').assets[0].maintenance.length, LIMITS.maxMaintenancePerAsset - 1);
});

test('parser recusa JSON inválido, campos desconhecidos e duplicação com escapes em qualquer nível', () => {
  const input = book(asset('a', { documents: [document()], maintenance: [task()] }));
  assert.deepEqual(parseBookJson(JSON.stringify(input)), input);
  const literal = book(asset('a', { notes: 'Texto literal: \\" { [ ] } chave: "x" : "x"' }));
  assert.deepEqual(parseBookJson(JSON.stringify(literal)), literal);
  for (const source of ['', 'undefined', '{', '{"a":1,}', '[1,]', '{"a":NaN}', '{"a":"\n"}', '{} trailing', '\uFEFF{}',
    'null', '1', '[]', JSON.stringify({ ...book(), extra: true })]) invalid(() => parseBookJson(source));
  for (const source of [
    '{"schemaVersion":1,"id":"book-1","title":"x","assets":[],"title":"y"}',
    '{"schemaVersion":1,"id":"book-1","title":"x","assets":[],"t\\u0069tle":"y"}',
    '{"outer":{"name":1,"n\\u0061me":2}}',
    '{"outer":[{"id":"a","id":"b"}]}',
    '{"__proto__":{},"__proto__":{}}',
  ]) invalid(() => parseBookJson(source), 'json', /repetida/);
  invalid(() => parseBookJson('{"__proto__":{"polluted":true}}'));
  assert.equal({}.polluted, undefined);
});

test('parser limita profundidade antes de construir a árvore e conta raiz como nível 1', () => {
  const atLimit = '['.repeat(LIMITS.maxJsonDepth) + 'null' + ']'.repeat(LIMITS.maxJsonDepth);
  // Passa o limite lexical e é recusado apenas pelo schema de livro.
  invalid(() => parseBookJson(atLimit), 'book');
  invalid(() => parseBookJson('[' + atLimit + ']'), 'json', /profundidade/);
  invalid(() => parseBookJson('['.repeat(100000) + '0' + ']'.repeat(100000)), 'json', /profundidade/);
  const stringBraces = book(asset('a', { notes: '['.repeat(200) + '{'.repeat(200) }));
  assert.deepEqual(parseBookJson(JSON.stringify(stringBraces)), stringBraces);
});

test('parser aplica exatamente 20 MiB de UTF-8, inclusive whitespace e caracteres multibyte', () => {
  const minimal = JSON.stringify(book());
  const exact = minimal + ' '.repeat(LIMITS.maxJsonBytes - Buffer.byteLength(minimal));
  assert.deepEqual(parseBookJson(exact), book());
  invalid(() => parseBookJson(exact + ' '), 'json', /20 MiB/);
  const multibyte = '{"x":"' + '😀'.repeat(Math.floor(LIMITS.maxJsonBytes / 4)) + '"}';
  assert.ok(multibyte.length < LIMITS.maxJsonBytes);
  assert.ok(Buffer.byteLength(multibyte) > LIMITS.maxJsonBytes);
  invalid(() => parseBookJson(multibyte), 'json', /20 MiB/);
  invalid(() => parseBookJson(new Uint8Array(1)), 'json');
});

test('validação também recusa livro cujo JSON canônico excede 20 MiB', () => {
  const notes = '😀'.repeat(LIMITS.maxNotesLength);
  const input = book(...Array.from({ length: 14 }, (_, assetIndex) => asset(`a-${assetIndex}`, {
    maintenance: Array.from({ length: 100 }, (_, taskIndex) => task(`t-${assetIndex}-${taskIndex}`, { notes })),
  })));
  assert.ok(Buffer.byteLength(JSON.stringify(input)) > LIMITS.maxJsonBytes);
  invalid(() => validateBook(input), 'json', /20 MiB/);
  assert.equal(input.assets[0].maintenance[0].notes, notes);
});

test('mutações produzem novos livros, clonam entradas e preservam campos não editados', () => {
  const original = deepFreeze(book(asset('a'), asset('b')));
  const candidate = deepFreeze(asset('c', { documents: [document('dc')], maintenance: [task('tc')] }));
  let next = addAsset(original, candidate);
  assert.equal(original.assets.length, 2);
  assert.equal(next.assets.length, 3);
  assert.notEqual(next, original);
  assert.notEqual(next.assets[0], original.assets[0]);
  assert.notEqual(next.assets[2], candidate);
  const replaced = replaceAsset(next, { ...candidate, name: 'Nome editado' });
  assert.equal(replaced.assets[2].name, 'Nome editado');
  assert.equal(next.assets[2].name, 'Bem fictício');
  next = addDocument(replaced, 'a', document('da'));
  next = addMaintenance(next, 'a', task('ta', { dueOn: '2026-12-31' }));
  const beforeCompletion = deepFreeze(next);
  const completed = replaceMaintenance(beforeCompletion, 'a', { ...beforeCompletion.assets[0].maintenance[0], completedOn: '2026-11-01' });
  assert.equal(completed.assets[0].maintenance[0].dueOn, '2026-12-31');
  assert.equal(completed.assets[0].maintenance[0].completedOn, '2026-11-01');
  assert.equal(beforeCompletion.assets[0].maintenance[0].completedOn, '');
  assert.equal(agenda(completed, '2026-11-08').some(row => row.taskId === 'ta'), false);
  next = removeMaintenance(completed, 'a', 'ta');
  next = removeDocument(next, 'a', 'da');
  next = removeAsset(next, 'c');
  assert.deepEqual(next, original);
  next.assets[0].name = 'Outro nome';
  assert.equal(original.assets[0].name, 'Bem fictício');
});

test('erros de operações são atômicos e IDs ausentes/colisões nunca substituem silenciosamente', () => {
  const original = deepFreeze(book(asset('a', { documents: [document('d')], maintenance: [task('t')] }), asset('b')));
  const snapshot = JSON.stringify(original);
  const operations = [
    () => addAsset(original, asset('a')),
    () => addAsset(original, { ...asset('c'), unknown: 1 }),
    () => replaceAsset(original, asset('missing')),
    () => replaceAsset(original, asset('b', { documents: [document('t')] })),
    () => removeAsset(original, 'missing'),
    () => removeAsset(original, '../a'),
    () => addDocument(original, 'missing', document('d2')),
    () => addDocument(original, 'b', document('t')),
    () => addDocument(original, 'b', document('d')),
    () => removeDocument(original, 'a', 'missing'),
    () => removeDocument(original, 'b', 'd'),
    () => addMaintenance(original, 'a', task('d')),
    () => addMaintenance(original, 'a', task('t')),
    () => replaceMaintenance(original, 'a', task('missing')),
    () => replaceMaintenance(original, 'a', task('t', { dueOn: '2026-02-30' })),
    () => replaceMaintenance(original, 'missing', task('t')),
    () => removeMaintenance(original, 'b', 't'),
    () => removeMaintenance(original, 'a', 'missing'),
  ];
  for (const operation of operations) {
    invalid(operation);
    assert.equal(JSON.stringify(original), snapshot);
  }
  invalid(() => removeAsset({ ...original, unknown: true }, 'a'), 'book');
  // Um ID liberado por remoção pode voltar a ser usado sem colisão histórica.
  assert.equal(addMaintenance(removeDocument(original, 'a', 'd'), 'b', task('d')).assets[1].maintenance[0].id, 'd');
});

test('consulta de prazo exige hoje explícito e distingue ausência, passado, hoje e futuro', () => {
  assert.deepEqual(warrantyInfo(asset('a'), '2026-11-08'), { state: 'no-date', daysUntil: null });
  for (const [warrantyUntil, state, daysUntil] of [
    ['2026-11-07', 'past', -1], ['2026-11-08', 'today', 0], ['2026-11-09', 'future', 1],
  ]) assert.deepEqual(warrantyInfo(asset('a', { warrantyUntil }), '2026-11-08'), { state, daysUntil });
  invalid(() => warrantyInfo(asset('a')), 'today');
  invalid(() => warrantyInfo(asset('a'), '2026-02-30'), 'today');
});

test('agenda contém apenas pendentes e ordena por data, assetId e taskId sem alterar entrada', () => {
  const input = deepFreeze(book(
    asset('b', { name: 'B', maintenance: [task('tb-2'), task('tb-1'), task('past', { dueOn: '2026-11-07' })] }),
    asset('a', { name: 'A', maintenance: [task('ta-2'), task('ta-1'), task('today', { dueOn: '2026-11-08' }),
      task('done', { dueOn: '2026-11-01', completedOn: '2026-10-20' })] }),
  ));
  const rows = agenda(input, '2026-11-08');
  assert.deepEqual(rows.map(row => row.taskId), ['past', 'today', 'ta-1', 'ta-2', 'tb-1', 'tb-2']);
  assert.deepEqual(rows[0], { assetId: 'b', assetName: 'B', taskId: 'past', title: 'Limpeza fictícia',
    dueOn: '2026-11-07', daysUntil: -1, state: 'past' });
  assert.equal(rows[1].state, 'today');
  assert.equal(rows[2].state, 'future');
  assert.equal(rows[2].daysUntil, 1);
  assert.equal(input.assets[0].maintenance[0].id, 'tb-2');
  rows[0].assetName = 'Mutado';
  assert.equal(input.assets[0].name, 'B');
  invalid(() => agenda(input), 'today');
  assert.deepEqual(agenda(book(), '0001-01-01'), []);
});

test('exemplo tem três bens fictícios fixos, sem anexos, tarefas pendentes e concluídas', () => {
  const first = createExampleBook();
  const second = createExampleBook();
  assert.deepEqual(first, second);
  assert.notEqual(first.assets[0], second.assets[0]);
  assert.equal(first.assets.length, 3);
  assert.match(first.title, /fictícios/);
  assert.ok(first.assets.every(item => /fictício/.test(item.name) && item.documents.length === 0));
  assert.deepEqual(first.assets.map(item => item.id), ['exemplo-notebook', 'exemplo-cafeteira', 'exemplo-bicicleta']);
  assert.deepEqual(first.assets.map(item => item.purchasedOn), ['2025-11-10', '2026-02-20', '2024-06-01']);
  const tasks = first.assets.flatMap(item => item.maintenance);
  assert.ok(tasks.some(item => item.completedOn === ''));
  assert.ok(tasks.some(item => item.completedOn !== ''));
  const early = tasks.find(item => item.id === 'exemplo-revisao-notebook');
  assert.equal(early.dueOn, '2026-10-15');
  assert.equal(early.completedOn, '2026-10-10');
  assert.deepEqual(parseBookJson(JSON.stringify(first)), first);
});
