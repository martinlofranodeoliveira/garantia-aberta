import { LIMITS, ValidationError, validateBook, parseBookJson, warrantyInfo, daysBetween } from './domain.mjs';
import { verifyBook } from './attachments.mjs';

export async function exportBackup(book) {
  const verified = await verifyBook(book);
  const encoder = new TextEncoder();
  const formatted = `${JSON.stringify(verified, null, 2)}\n`;
  if (encoder.encode(formatted).byteLength <= LIMITS.maxJsonBytes) return formatted;
  const compact = JSON.stringify(verified);
  const compactBytes = encoder.encode(compact).byteLength;
  if (compactBytes > LIMITS.maxJsonBytes) {
    throw new ValidationError('json', 'O backup excede o limite de 20 MiB.');
  }
  return compactBytes < LIMITS.maxJsonBytes ? `${compact}\n` : compact;
}

export async function importBackup(text) {
  return verifyBook(parseBookJson(text));
}

function csvCell(value) {
  let text = String(value ?? '');
  // Neutralize before quoting: CSV quotes alone do not stop spreadsheet formulas.
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text) || /^[\u0000-\u001f\u007f]/u.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function dateState(state) {
  return { 'no-date': 'Sem data', past: 'Passado', today: 'Hoje', future: 'Futuro' }[state];
}

/** CSV carries inventory metadata and every maintenance date, without document bytes. */
export function exportInventoryCsv(book, today) {
  daysBetween(today, today);
  const verified = validateBook(book);
  const rows = [[
    'Tipo', 'ID do bem', 'Bem', 'Categoria', 'Fabricante', 'Modelo', 'Número de série',
    'Data da compra', 'Término informado', 'Situação do prazo', 'Dias até o término',
    'Observações do bem', 'Quantidade de comprovantes', 'ID da manutenção', 'Manutenção',
    'Data prevista', 'Concluída em', 'Situação da manutenção', 'Dias até a manutenção',
    'Observações da manutenção',
  ]];
  for (const asset of verified.assets) {
    const warranty = warrantyInfo(asset, today);
    const metadata = [asset.id, asset.name, asset.category, asset.brand, asset.model, asset.serial,
      asset.purchasedOn, asset.warrantyUntil, dateState(warranty.state), warranty.daysUntil ?? '',
      asset.notes, asset.documents.length];
    rows.push(['Bem', ...metadata, '', '', '', '', '', '', '']);
    for (const task of asset.maintenance) {
      const daysUntil = daysBetween(today, task.dueOn);
      const state = task.completedOn ? 'Concluída' : dateState(daysUntil < 0 ? 'past' : daysUntil === 0 ? 'today' : 'future');
      rows.push(['Manutenção', ...metadata, task.id, task.title, task.dueOn,
        task.completedOn, state, daysUntil, task.notes]);
    }
  }
  return `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

export function backupFilename(book, extension = 'json') {
  if (extension !== 'json' && extension !== 'csv') {
    throw new ValidationError('extension', 'Extensão deve ser json ou csv.');
  }
  const verified = validateBook(book);
  return `garantia-aberta-${verified.id}.${extension}`;
}
