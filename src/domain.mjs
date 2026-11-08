/**
 * Núcleo puro do Garantia Aberta. Datas e IDs são sempre fornecidos pelo
 * chamador: este módulo não consulta relógio, não gera IDs e não usa I/O.
 * Datas registram prazos informados; não determinam garantia legal/contratual.
 *
 * Limites textuais contam pontos de código Unicode e permitem no máximo quatro
 * bytes UTF-8 por ponto admitido. Não há truncamento, normalização nem trim.
 * C0/C1 são recusados; apenas notas admitem TAB e LF. Surrogates isolados são
 * recusados. A profundidade JSON conta objetos/listas, incluindo a raiz (1).
 *
 * As verificações de objetos/listas adaptam o Orçamento Aberto (licença MIT),
 * Copyright (c) 2026 Contribuidores da LOFRANO TECNOLOGIA. A licença MIT do
 * projeto preserva a atribuição e os termos de permissão.
 */

export const LIMITS = Object.freeze({
  maxAssets: 200,
  maxDocumentsPerAsset: 5,
  maxDocumentBytes: 2 * 1024 * 1024,
  maxTotalDocumentBytes: 12 * 1024 * 1024,
  maxJsonBytes: 20 * 1024 * 1024,
  maxJsonDepth: 32,
  maxMaintenancePerAsset: 100,
  maxBookTitleLength: 120,
  maxAssetNameLength: 120,
  maxTaskTitleLength: 120,
  maxCategoryLength: 100,
  maxBrandLength: 100,
  maxModelLength: 100,
  maxSerialLength: 120,
  maxNotesLength: 4000,
  maxFileNameLength: 180,
  maxTextUtf8BytesPerCodePoint: 4,
});

export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const BOOK_KEYS = ['schemaVersion', 'id', 'title', 'assets'];
const ASSET_KEYS = ['id', 'name', 'category', 'brand', 'model', 'serial',
  'purchasedOn', 'warrantyUntil', 'notes', 'documents', 'maintenance'];
const DOCUMENT_KEYS = ['id', 'fileName', 'mimeType', 'sizeBytes', 'sha256', 'dataBase64'];
const TASK_KEYS = ['id', 'title', 'dueOn', 'completedOn', 'notes'];
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf']);
const INVALID_ID_CHARACTER = /[^A-Za-z0-9_-]/;
const utf8 = new TextEncoder();
const fail = (field, message) => { throw new ValidationError(field, message); };

function dataObject(value, keys, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(field, 'Use um objeto de dados.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(field, 'O objeto não pode possuir um protótipo personalizado.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const found = Reflect.ownKeys(descriptors);
  if (found.length !== keys.length || found.some(key => typeof key !== 'string' || !keys.includes(key))) {
    fail(field, 'O objeto contém campos ausentes ou desconhecidos.');
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      fail(`${field}.${key}`, 'Use um campo de dados comum, sem getters ou setters.');
    }
  }
}

function dataArray(value, field, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) {
    fail(field, `Use uma lista de até ${maximum} itens.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' &&
      (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key)))) {
    fail(field, 'A lista precisa conter apenas itens contínuos, sem campos adicionais.');
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      fail(`${field}[${index}]`, 'O item precisa ser um campo de dados comum.');
    }
  }
}

function text(value, field, maximum, multiline = false) {
  if (typeof value !== 'string' || value.length > maximum * 2) {
    fail(field, `Use um texto de até ${maximum} caracteres Unicode.`);
  }
  let length = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 32 && !(multiline && (code === 9 || code === 10))) || (code >= 127 && code <= 159)) {
      fail(field, 'O texto contém caracteres de controle não permitidos.');
    }
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) fail(field, 'Use apenas Unicode válido.');
      index++;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      fail(field, 'Use apenas Unicode válido.');
    }
    if (++length > maximum) fail(field, `Use um texto de até ${maximum} caracteres Unicode.`);
  }
  if (utf8.encode(value).byteLength > maximum * LIMITS.maxTextUtf8BytesPerCodePoint) {
    fail(field, 'O texto excede o limite de bytes UTF-8.');
  }
  return value;
}

function identifier(value, field) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 80 || INVALID_ID_CHARACTER.test(value)) {
    fail(field, 'Use um identificador de 1 a 80 letras ASCII, números, hífens ou sublinhados.');
  }
  return value;
}

function uniqueId(value, field, seen) {
  const id = identifier(value, field);
  if (seen.has(id)) fail(field, 'Todos os identificadores do inventário precisam ser únicos.');
  seen.add(id);
  return id;
}

function calendarDate(value, field, optional = true) {
  if (optional && value === '') return '';
  if (typeof value !== 'string' || value.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    fail(field, 'Use uma data real no formato AAAA-MM-DD.');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) {
    fail(field, 'A data informada não existe no calendário.');
  }
  return value;
}

function base64Sextet(code) {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

/** Verifica forma canônica e comprimento, sem decodificar ou calcular hash. */
function base64(value, sizeBytes, field) {
  if (typeof value !== 'string' || value.length !== Math.ceil(sizeBytes / 3) * 4) {
    fail(field, 'O Base64 não corresponde ao tamanho declarado.');
  }
  const padding = (3 - sizeBytes % 3) % 3;
  const end = value.length - padding;
  let last = -1;
  for (let index = 0; index < end; index++) {
    last = base64Sextet(value.charCodeAt(index));
    if (last < 0) fail(field, 'Use Base64 canônico, sem espaços ou prefixos.');
  }
  for (let index = end; index < value.length; index++) {
    if (value[index] !== '=') fail(field, 'O padding Base64 é inválido.');
  }
  if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) {
    fail(field, 'O Base64 contém bits de padding não canônicos.');
  }
  return value;
}

function cloneDocument(value, field, seen) {
  dataObject(value, DOCUMENT_KEYS, field);
  const id = uniqueId(value.id, `${field}.id`, seen);
  const fileName = text(value.fileName, `${field}.fileName`, LIMITS.maxFileNameLength);
  if (!fileName) fail(`${field}.fileName`, 'Informe o nome do arquivo.');
  if (!MIME_TYPES.has(value.mimeType)) fail(`${field}.mimeType`, 'Use PNG, JPEG ou PDF.');
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1 || value.sizeBytes > LIMITS.maxDocumentBytes) {
    fail(`${field}.sizeBytes`, 'O arquivo precisa conter entre 1 byte e 2 MiB.');
  }
  if (typeof value.sha256 !== 'string' || value.sha256.length !== 64 || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    fail(`${field}.sha256`, 'Use um SHA256 de 64 caracteres hexadecimais minúsculos.');
  }
  return { id, fileName, mimeType: value.mimeType, sizeBytes: value.sizeBytes,
    sha256: value.sha256, dataBase64: base64(value.dataBase64, value.sizeBytes, `${field}.dataBase64`) };
}

function cloneTask(value, field, seen) {
  dataObject(value, TASK_KEYS, field);
  return {
    id: uniqueId(value.id, `${field}.id`, seen),
    title: text(value.title, `${field}.title`, LIMITS.maxTaskTitleLength),
    dueOn: calendarDate(value.dueOn, `${field}.dueOn`, false),
    completedOn: calendarDate(value.completedOn, `${field}.completedOn`),
    notes: text(value.notes, `${field}.notes`, LIMITS.maxNotesLength, true),
  };
}

function cloneAsset(value, field, seen, totals) {
  dataObject(value, ASSET_KEYS, field);
  const id = uniqueId(value.id, `${field}.id`, seen);
  const purchasedOn = calendarDate(value.purchasedOn, `${field}.purchasedOn`);
  const warrantyUntil = calendarDate(value.warrantyUntil, `${field}.warrantyUntil`);
  if (purchasedOn && warrantyUntil && warrantyUntil < purchasedOn) {
    fail(`${field}.warrantyUntil`, 'O término informado não pode anteceder a compra.');
  }
  dataArray(value.documents, `${field}.documents`, LIMITS.maxDocumentsPerAsset);
  dataArray(value.maintenance, `${field}.maintenance`, LIMITS.maxMaintenancePerAsset);
  const documents = value.documents.map((document, index) => {
    const documentField = `${field}.documents[${index}]`;
    const result = cloneDocument(document, documentField, seen);
    totals.documentBytes += result.sizeBytes;
    if (totals.documentBytes > LIMITS.maxTotalDocumentBytes) {
      fail(`${documentField}.sizeBytes`, 'O conjunto de documentos excede 12 MiB.');
    }
    return result;
  });
  return {
    id,
    name: text(value.name, `${field}.name`, LIMITS.maxAssetNameLength),
    category: text(value.category, `${field}.category`, LIMITS.maxCategoryLength),
    brand: text(value.brand, `${field}.brand`, LIMITS.maxBrandLength),
    model: text(value.model, `${field}.model`, LIMITS.maxModelLength),
    serial: text(value.serial, `${field}.serial`, LIMITS.maxSerialLength),
    purchasedOn, warrantyUntil,
    notes: text(value.notes, `${field}.notes`, LIMITS.maxNotesLength, true),
    documents,
    maintenance: value.maintenance.map((task, index) => cloneTask(task, `${field}.maintenance[${index}]`, seen)),
  };
}

/** Valida integralmente e devolve um clone canônico, sem modificar a entrada. */
export function validateBook(value) {
  dataObject(value, BOOK_KEYS, 'book');
  if (value.schemaVersion !== 1) fail('schemaVersion', 'Apenas schemaVersion 1 é suportado.');
  const id = identifier(value.id, 'id');
  const title = text(value.title, 'title', LIMITS.maxBookTitleLength);
  dataArray(value.assets, 'assets', LIMITS.maxAssets);
  const seen = new Set([id]);
  const totals = { documentBytes: 0 };
  const result = { schemaVersion: 1, id, title,
    assets: value.assets.map((asset, index) => cloneAsset(asset, `assets[${index}]`, seen, totals)) };
  if (utf8.encode(JSON.stringify(result)).byteLength > LIMITS.maxJsonBytes) {
    fail('json', 'O inventário excede o limite de 20 MiB de JSON.');
  }
  return result;
}

export function emptyBook(id) {
  return validateBook({ schemaVersion: 1, id, title: 'Meu inventário', assets: [] });
}

export function emptyAsset(id) {
  return cloneAsset({ id, name: '', category: '', brand: '', model: '', serial: '',
    purchasedOn: '', warrantyUntil: '', notes: '', documents: [], maintenance: [] },
  'asset', new Set(), { documentBytes: 0 });
}

/**
 * Passagem lexical iterativa antes de JSON.parse: limita aninhamento e recusa
 * chaves repetidas após decodificação, inclusive chaves com escapes Unicode.
 * JSON.parse continua sendo a autoridade sobre a gramática completa de JSON.
 */
function inspectJson(source) {
  const stack = [];
  for (let position = 0; position < source.length; position++) {
    const character = source[position];
    if (character === '"') {
      const start = position;
      let closed = false;
      while (++position < source.length) {
        if (source[position] === '\\') position++;
        else if (source[position] === '"') { closed = true; break; }
      }
      if (!closed) fail('json', 'O arquivo não contém JSON válido.');
      let next = position + 1;
      while (next < source.length && /[\x20\t\n\r]/.test(source[next])) next++;
      if (source[next] === ':' && stack.at(-1)?.type === '{') {
        let key;
        try { key = JSON.parse(source.slice(start, position + 1)); }
        catch { fail('json', 'O arquivo não contém JSON válido.'); }
        const keys = stack.at(-1).keys;
        if (keys.has(key)) fail('json', 'O JSON contém uma chave repetida.');
        keys.add(key);
      }
    } else if (character === '{' || character === '[') {
      stack.push({ type: character, keys: character === '{' ? new Set() : null });
      if (stack.length > LIMITS.maxJsonDepth) fail('json', 'O JSON excede a profundidade permitida.');
    } else if (character === '}' || character === ']') {
      const open = stack.pop();
      if (!open || open.type !== (character === '}' ? '{' : '[')) {
        fail('json', 'O arquivo não contém JSON válido.');
      }
    }
  }
  if (stack.length) fail('json', 'O arquivo não contém JSON válido.');
}

export function parseBookJson(source) {
  if (typeof source !== 'string' || source.length > LIMITS.maxJsonBytes ||
      utf8.encode(source).byteLength > LIMITS.maxJsonBytes) {
    fail('json', 'Importe um arquivo JSON de até 20 MiB.');
  }
  inspectJson(source);
  let value;
  try { value = JSON.parse(source); }
  catch { fail('json', 'O arquivo não contém JSON válido.'); }
  return validateBook(value);
}

function mutateBook(book, mutate) {
  const next = validateBook(book);
  mutate(next);
  return validateBook(next);
}

function findAsset(book, assetId) {
  identifier(assetId, 'assetId');
  const index = book.assets.findIndex(asset => asset.id === assetId);
  if (index < 0) fail('assetId', 'O bem informado não existe.');
  return index;
}

function findChild(values, id, field) {
  identifier(id, field);
  const index = values.findIndex(value => value.id === id);
  if (index < 0) fail(field, 'O identificador informado não existe neste bem.');
  return index;
}

export function addAsset(book, asset) {
  return mutateBook(book, next => { next.assets.push(asset); });
}

export function replaceAsset(book, asset) {
  return mutateBook(book, next => {
    const replacement = cloneAsset(asset, 'asset', new Set(), { documentBytes: 0 });
    next.assets[findAsset(next, replacement.id)] = replacement;
  });
}

export function removeAsset(book, assetId) {
  return mutateBook(book, next => { next.assets.splice(findAsset(next, assetId), 1); });
}

export function addDocument(book, assetId, document) {
  return mutateBook(book, next => { next.assets[findAsset(next, assetId)].documents.push(document); });
}

export function removeDocument(book, assetId, documentId) {
  return mutateBook(book, next => {
    const values = next.assets[findAsset(next, assetId)].documents;
    values.splice(findChild(values, documentId, 'documentId'), 1);
  });
}

export function addMaintenance(book, assetId, task) {
  return mutateBook(book, next => { next.assets[findAsset(next, assetId)].maintenance.push(task); });
}

export function replaceMaintenance(book, assetId, task) {
  return mutateBook(book, next => {
    const replacement = cloneTask(task, 'task', new Set());
    const values = next.assets[findAsset(next, assetId)].maintenance;
    values[findChild(values, replacement.id, 'taskId')] = replacement;
  });
}

export function removeMaintenance(book, assetId, taskId) {
  return mutateBook(book, next => {
    const values = next.assets[findAsset(next, assetId)].maintenance;
    values.splice(findChild(values, taskId, 'taskId'), 1);
  });
}

// Número ordinal gregoriano sem Date/UTC: evita a regra especial dos anos 0–99.
function ordinal(date) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const previousYear = year - 1;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const beforeMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return previousYear * 365 + Math.floor(previousYear / 4) - Math.floor(previousYear / 100) +
    Math.floor(previousYear / 400) + beforeMonth[month - 1] + (leap && month > 2 ? 1 : 0) + Number(date.slice(8, 10));
}

export function daysBetween(fromDate, toDate) {
  return ordinal(calendarDate(toDate, 'toDate', false)) - ordinal(calendarDate(fromDate, 'fromDate', false));
}

function dateState(daysUntil) {
  return daysUntil < 0 ? 'past' : daysUntil > 0 ? 'future' : 'today';
}

export function warrantyInfo(asset, today) {
  const valid = cloneAsset(asset, 'asset', new Set(), { documentBytes: 0 });
  calendarDate(today, 'today', false);
  if (!valid.warrantyUntil) return { state: 'no-date', daysUntil: null };
  const daysUntil = daysBetween(today, valid.warrantyUntil);
  return { state: dateState(daysUntil), daysUntil };
}

export function agenda(book, today) {
  const valid = validateBook(book);
  calendarDate(today, 'today', false);
  const rows = [];
  for (const asset of valid.assets) {
    for (const task of asset.maintenance) {
      if (task.completedOn) continue;
      const daysUntil = daysBetween(today, task.dueOn);
      rows.push({ assetId: asset.id, assetName: asset.name, taskId: task.id, title: task.title,
        dueOn: task.dueOn, daysUntil, state: dateState(daysUntil) });
    }
  }
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  return rows.sort((left, right) => compare(left.dueOn, right.dueOn) ||
    compare(left.assetId, right.assetId) || compare(left.taskId, right.taskId));
}

export function createExampleBook() {
  return validateBook({ schemaVersion: 1, id: 'exemplo-ficticio', title: 'Inventário de exemplo — dados fictícios', assets: [
    { ...emptyAsset('exemplo-notebook'), name: 'Notebook — exemplo fictício', category: 'Eletrônicos',
      brand: 'Marca fictícia', model: 'Modelo fictício A', serial: 'FICTICIO-001',
      purchasedOn: '2025-11-10', warrantyUntil: '2026-11-10',
      notes: 'Dados fictícios para demonstração. Prazo informado apenas como exemplo.', maintenance: [
        { id: 'exemplo-limpeza-notebook', title: 'Limpar entradas de ar', dueOn: '2026-12-05', completedOn: '', notes: 'Tarefa de exemplo fictício.' },
        { id: 'exemplo-revisao-notebook', title: 'Revisão visual', dueOn: '2026-10-15', completedOn: '2026-10-10', notes: 'Conclusão antecipada fictícia; a data prevista foi preservada.' },
      ] },
    { ...emptyAsset('exemplo-cafeteira'), name: 'Cafeteira — exemplo fictício', category: 'Cozinha',
      brand: 'Marca fictícia', model: 'Modelo fictício B', purchasedOn: '2026-02-20', warrantyUntil: '2027-02-20',
      notes: 'Dados fictícios. Nenhum documento pessoal foi incluído.', maintenance: [
        { id: 'exemplo-limpeza-cafeteira', title: 'Consultar cuidados de limpeza', dueOn: '2026-11-15', completedOn: '', notes: 'Siga as instruções reais do fabricante do seu bem.' },
      ] },
    { ...emptyAsset('exemplo-bicicleta'), name: 'Bicicleta — exemplo fictício', category: 'Mobilidade',
      purchasedOn: '2024-06-01', notes: 'Dados fictícios; sem término de prazo informado.', maintenance: [
        { id: 'exemplo-revisao-bicicleta', title: 'Revisar freios', dueOn: '2026-11-01', completedOn: '', notes: 'Tarefa de exemplo fictício.' },
        { id: 'exemplo-pneus-bicicleta', title: 'Conferir pneus', dueOn: '2026-10-01', completedOn: '2026-10-01', notes: 'Conclusão fictícia.' },
      ] },
  ] });
}
