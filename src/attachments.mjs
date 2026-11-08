import { LIMITS, ValidationError, emptyBook, emptyAsset, validateBook } from './domain.mjs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf']);

function fail(field, message) {
  throw new ValidationError(field, message);
}

function encodeBase64(bytes) {
  const chunks = [];
  let chunk = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset];
    const hasB = offset + 1 < bytes.length;
    const hasC = offset + 2 < bytes.length;
    const b = hasB ? bytes[offset + 1] : 0;
    const c = hasC ? bytes[offset + 2] : 0;
    chunk += ALPHABET[a >>> 2] + ALPHABET[((a & 3) << 4) | (b >>> 4)]
      + (hasB ? ALPHABET[((b & 15) << 2) | (c >>> 6)] : '=')
      + (hasC ? ALPHABET[c & 63] : '=');
    if (chunk.length >= 16384) {
      chunks.push(chunk);
      chunk = '';
    }
  }
  chunks.push(chunk);
  return chunks.join('');
}

function base64Value(code) {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

/** Decode canonical Base64, checking its actual size before allocating bytes. */
export function attachmentBytes(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    fail('document', 'Comprovante inválido.');
  }
  const { dataBase64, sizeBytes } = document;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > LIMITS.maxDocumentBytes) {
    fail('document.sizeBytes', 'Tamanho de comprovante inválido.');
  }
  if (typeof dataBase64 !== 'string' || dataBase64.length === 0
    || dataBase64.length > Math.ceil(LIMITS.maxDocumentBytes / 3) * 4
    || dataBase64.length % 4 !== 0) {
    fail('document.dataBase64', 'Base64 canônico obrigatório.');
  }
  const padding = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0;
  const contentLength = dataBase64.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (base64Value(dataBase64.charCodeAt(index)) < 0) {
      fail('document.dataBase64', 'Base64 canônico obrigatório.');
    }
  }
  const lastValue = base64Value(dataBase64.charCodeAt(contentLength - 1));
  if ((padding === 2 && (lastValue & 15) !== 0)
    || (padding === 1 && (lastValue & 3) !== 0)) {
    fail('document.dataBase64', 'Padding Base64 não canônico.');
  }
  const byteLength = (dataBase64.length / 4) * 3 - padding;
  if (byteLength !== sizeBytes) {
    fail('document.sizeBytes', 'O tamanho declarado difere dos bytes do comprovante.');
  }
  const bytes = new Uint8Array(byteLength);
  let position = 0;
  for (let index = 0; index < dataBase64.length; index += 4) {
    const a = base64Value(dataBase64.charCodeAt(index));
    const b = base64Value(dataBase64.charCodeAt(index + 1));
    const c = index + 2 < contentLength ? base64Value(dataBase64.charCodeAt(index + 2)) : 0;
    const d = index + 3 < contentLength ? base64Value(dataBase64.charCodeAt(index + 3)) : 0;
    bytes[position++] = (a << 2) | (b >>> 4);
    if (position < byteLength) bytes[position++] = ((b & 15) << 4) | (c >>> 2);
    if (position < byteLength) bytes[position++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

function verifySignature(bytes, mimeType, field) {
  if (!MIME_TYPES.has(mimeType)) fail(field, 'Use comprovante PNG, JPEG ou PDF.');
  let matches = false;
  if (mimeType === 'image/png') {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    matches = bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  } else if (mimeType === 'image/jpeg') {
    matches = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  } else {
    // This checks only the PDF header. It does not parse, audit or authenticate a PDF.
    matches = bytes.length >= 8 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68
      && bytes[3] === 70 && bytes[4] === 45 && bytes[6] === 46
      && ((bytes[5] === 49 && bytes[7] >= 48 && bytes[7] <= 55)
        || (bytes[5] === 50 && bytes[7] === 48));
  }
  if (!matches) fail(field, 'Os bytes não correspondem à assinatura básica do tipo informado.');
}

function cryptoProvider(options) {
  const provider = options?.crypto ?? globalThis.crypto;
  if (!provider?.subtle || typeof provider.subtle.digest !== 'function') {
    fail('crypto', 'Web Crypto SHA256 indisponível neste ambiente.');
  }
  return provider;
}

async function sha256(bytes, options) {
  const provider = cryptoProvider(options);
  const result = await provider.subtle.digest('SHA-256', bytes);
  const hashBytes = new Uint8Array(result);
  if (hashBytes.length !== 32) fail('crypto', 'Resposta SHA256 inválida.');
  return Array.from(hashBytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateDocument(document) {
  // Reuse the domain's closed schema without reserving otherwise valid document IDs.
  const bookId = document.id === 'attachment-book' ? 'attachment-book-2' : 'attachment-book';
  const assetId = document.id === 'attachment-asset' ? 'attachment-asset-2' : 'attachment-asset';
  const book = emptyBook(bookId);
  const asset = emptyAsset(assetId);
  asset.name = 'Comprovante';
  asset.documents = [document];
  book.assets = [asset];
  return validateBook(book).assets[0].documents[0];
}

/** Creates a document after basic type and size checks; this is not authentication. */
export async function createAttachment(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('document', 'Comprovante inválido.');
  const allowed = new Set(['id', 'fileName', 'mimeType', 'bytes']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail(`document.${key}`, 'Campo desconhecido.');
  }
  const { id, fileName, mimeType } = input;
  if (!(input.bytes instanceof Uint8Array)) fail('document.bytes', 'Bytes devem ser Uint8Array.');
  if (input.bytes.length < 1 || input.bytes.length > LIMITS.maxDocumentBytes) {
    fail('document.sizeBytes', 'O comprovante deve ter entre 1 byte e 2 MiB.');
  }
  // Snapshot the caller's bytes before crossing the asynchronous digest boundary.
  const bytes = new Uint8Array(input.bytes);
  verifySignature(bytes, mimeType, 'document.mimeType');
  const document = validateDocument({
    id, fileName, mimeType, sizeBytes: bytes.length,
    sha256: '0'.repeat(64), dataBase64: encodeBase64(bytes),
  });
  document.sha256 = await sha256(bytes, options);
  return document;
}

/** Returns a validated clone only after every document's integrity checks pass. */
export async function verifyBook(book, options = {}) {
  const verified = validateBook(book);
  for (let assetIndex = 0; assetIndex < verified.assets.length; assetIndex += 1) {
    const asset = verified.assets[assetIndex];
    for (let documentIndex = 0; documentIndex < asset.documents.length; documentIndex += 1) {
      const document = asset.documents[documentIndex];
      const field = `assets[${assetIndex}].documents[${documentIndex}]`;
      const bytes = attachmentBytes(document);
      verifySignature(bytes, document.mimeType, `${field}.mimeType`);
      if (await sha256(bytes, options) !== document.sha256) {
        fail(`${field}.sha256`, 'A soma SHA256 difere dos bytes do comprovante.');
      }
    }
  }
  return verified;
}
