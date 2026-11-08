import { LIMITS, ValidationError, emptyBook, emptyAsset, validateBook, addAsset, replaceAsset, removeAsset,
  addDocument, removeDocument, addMaintenance, replaceMaintenance, removeMaintenance,
  createExampleBook, warrantyInfo, agenda, daysBetween } from './domain.mjs';
import { createAttachment, attachmentBytes } from './attachments.mjs';
import { exportBackup, importBackup, exportInventoryCsv, backupFilename } from './backup.mjs';
import { openBookStore, ConflictError } from './storage.mjs';

const assetFields = ['name', 'category', 'brand', 'model', 'serial', 'purchasedOn', 'warrantyUntil', 'notes'];
const taskFields = ['title', 'dueOn', 'completedOn', 'notes'];
const makeRandomId = () => globalThis.crypto?.randomUUID?.() || 'id-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const dateLabel = value => value ? value.split('-').reverse().join('/') : 'Não informada';
const plural = (count, one, many = one + 's') => `${count} ${count === 1 ? one : many}`;
export function todayInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = key => parts.find(value => value.type === key).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function downloadFile(data, mime, filename) {
  const blob = new Blob([data], { type: mime }), url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement('a'); link.href = url; link.download = filename;
  globalThis.document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safeFileName = value => value.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').trim() || 'arquivo';

/** The real UI and DOM tests execute these same handlers. */
export async function createApp({ document = globalThis.document, eventTarget = globalThis.window,
  storeFactory = () => openBookStore(), makeId = makeRandomId, today = todayInSaoPaulo, onDownload = downloadFile } = {}) {
  const $ = id => document.getElementById(id);
  const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag); element.textContent = text;
    if (className) element.className = className; return element;
  };
  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#i-' + name); svg.append(use); return svg;
  };
  const action = (label, dataKey, value, className = 'text-button') => {
    const button = node('button', label, className); button.type = 'button'; button.dataset[dataKey] = value; return button;
  };
  let book = emptyBook(makeId()), revision = 0, store = null, remember = false, paused = false, conflict = false;
  let view = 'inventory', selectedId = null, draftId = null, editingExisting = false, taskId = null;
  let dirty = false, busy = false, previous = null, pendingImport = null, lastAction = Promise.resolve(), pendingFocus = null;
  let referenceDate = today(); daysBetween(referenceDate, referenceDate);
  const currentAsset = () => book.assets.find(asset => asset.id === selectedId);
  const message = (text, { undo = false } = {}) => {
    $('notice').hidden = !text; $('notice-text').textContent = text; $('live').textContent = text;
    $('undo').hidden = !(undo && previous); $('reload-saved').hidden = !conflict;
  };
  function status() {
    $('save-status').textContent = conflict ? 'Conflito: alterações só nesta aba' : paused ? 'Salvamento pausado: faça um backup' : remember ? 'Salvo neste navegador' : 'Somente na memória desta aba';
    $('today-label').textContent = 'Referência: ' + dateLabel(referenceDate);
    $('remember').checked = remember; $('remember').disabled = !store;
    $('storage-detail').textContent = !store ? 'O armazenamento local não está disponível. Você pode editar e baixar um backup nesta aba.'
      : remember && !paused && !conflict ? `Revisão salva: ${revision}. Novas alterações confirmadas serão guardadas neste navegador.`
      : conflict ? 'A versão salva mudou em outra aba. Baixe sua cópia ou carregue a versão salva antes de retomar.'
      : paused ? 'Esta versão continua na memória. O último salvamento não foi confirmado.' : 'Nenhum novo dado será salvo automaticamente neste navegador.';
    $('retry-save').hidden = !(store && remember && paused && !conflict);
    for (const id of ['new-asset', 'first-asset']) $(id).disabled = book.assets.length >= LIMITS.maxAssets;
    const asset = currentAsset();
    if (asset) { $('document-file').disabled = asset.documents.length >= LIMITS.maxDocumentsPerAsset; $('new-task').disabled = asset.maintenance.length >= LIMITS.maxMaintenancePerAsset; }
  }
  function setBusy(value) {
    busy = value; document.querySelector('main').setAttribute('aria-busy', String(value));
    if (value) {
      document.querySelectorAll('button,input,textarea,select').forEach(element => {
        element.dataset.previousDisabled = String(element.disabled); element.disabled = true;
      });
    } else {
      document.querySelectorAll('[data-previous-disabled]').forEach(element => {
        element.disabled = element.dataset.previousDisabled === 'true'; delete element.dataset.previousDisabled;
      }); status();
      if (pendingFocus) { $(pendingFocus)?.focus(); pendingFocus = null; }
    }
  }
  async function run(fn) {
    if (busy) return false;
    setBusy(true);
    try { return await fn(); }
    catch (error) { message(error instanceof ValidationError ? error.message : 'A operação não foi concluída. Os dados desta aba foram preservados; tente novamente ou baixe um backup.'); return false; }
    finally { setBusy(false); }
  }
  const bind = (id, eventName, fn) => $(id).addEventListener(eventName, event => {
    event.preventDefault(); if (busy) return; lastAction = run(() => fn(event));
  });
  function cleanToLeave() {
    if (!dirty) return true;
    message('Há alterações em edição. Salve ou cancele o formulário antes de trocar de área, abrir outro registro ou exportar.'); return false;
  }
  function selectView(next) {
    view = next;
    for (const name of ['inventory', 'detail', 'edit', 'agenda', 'backup']) $('view-' + name).hidden = name !== view;
    for (const name of ['inventory', 'agenda', 'backup']) {
      const active = name === view || (name === 'inventory' && ['detail', 'edit'].includes(view));
      if (active) $('nav-' + name).setAttribute('aria-current', 'page'); else $('nav-' + name).removeAttribute('aria-current');
    }
  }
  function navigation(next) {
    if (!cleanToLeave()) return false;
    $('confirm-example').hidden = true;
    $('task-form').hidden = true; pendingImport = null; $('import-confirm').hidden = true;
    selectView(next); render(); return true;
  }
  function dateStatus(state, daysUntil, completed = false) {
    const label = completed ? 'Concluída' : state === 'no-date' ? 'Sem prazo cadastrado' : state === 'past' ? `Há ${plural(-daysUntil, 'dia')}`
      : state === 'today' ? 'Data de hoje' : `Em ${plural(daysUntil, 'dia')}`;
    const span = node('span', label, 'date-status ' + (completed ? 'future' : state));
    if (completed) span.prepend(icon('check')); return span;
  }
  function renderInventory() {
    const currentCategory = $('category').value || '', categories = [...new Set(book.assets.map(asset => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('category').replaceChildren(); $('category-options').replaceChildren();
    for (const value of ['', ...categories]) {
      const option = node('option', value || 'Todas as categorias'); option.setAttribute('value', value); option.selected = value === currentCategory; $('category').append(option);
      if (value) { const suggestion = node('option'); suggestion.setAttribute('value', value); $('category-options').append(suggestion); }
    }
    if (!categories.includes(currentCategory) && currentCategory) $('category').firstElementChild.selected = true;
    const query = $('search').value.toLocaleLowerCase('pt-BR'), category = $('category').value || '';
    let assets = book.assets.filter(asset => (!category || asset.category === category) && [asset.name, asset.category, asset.brand, asset.model, asset.serial].some(text => text.toLocaleLowerCase('pt-BR').includes(query)));
    assets.sort((a, b) => $('sort').value === 'warranty' ? (a.warrantyUntil || '9999-99-99').localeCompare(b.warrantyUntil || '9999-99-99') || a.name.localeCompare(b.name, 'pt-BR') : a.name.localeCompare(b.name, 'pt-BR'));
    $('inventory-count').textContent = `${book.title || 'Meu inventário'} · ${plural(book.assets.length, 'bem', 'bens')}${assets.length !== book.assets.length ? ` · ${assets.length} na busca` : ''}`;
    $('asset-list').replaceChildren();
    for (const asset of assets) {
      const article = node('article', '', 'asset-card'), heading = node('h3'), opener = action(asset.name, 'open', asset.id);
      opener.setAttribute('aria-label', 'Abrir ficha de ' + asset.name); heading.append(opener); article.append(heading, node('p', asset.category || 'Sem categoria', 'asset-category'));
      const info = warrantyInfo(asset, referenceDate); article.append(dateStatus(info.state, info.daysUntil));
      const facts = node('dl', '', 'card-facts');
      for (const [label, value] of [['Término informado', dateLabel(asset.warrantyUntil)], ['Próximo cuidado', dateLabel(asset.maintenance.filter(task => !task.completedOn).map(task => task.dueOn).sort()[0])]]) {
        const line = node('div'); line.append(node('dt', label), node('dd', value)); facts.append(line);
      }
      article.append(facts);
      const foot = node('div', '', 'card-foot'), button = action('Abrir ficha', 'open', asset.id); button.setAttribute('aria-label', 'Ver detalhes de ' + asset.name); button.append(icon('arrow'));
      foot.append(node('span', plural(asset.documents.length, 'arquivo')), button); article.append(foot); $('asset-list').append(article);
    }
    $('inventory-empty').hidden = book.assets.length > 0; $('no-results').hidden = !book.assets.length || !!assets.length;
  }
  function renderDetail() {
    const asset = currentAsset(); if (!asset) { if (view === 'detail') selectView('inventory'); return; }
    $('detail-title').textContent = asset.name; $('detail-category').textContent = asset.category || 'Sem categoria';
    const info = warrantyInfo(asset, referenceDate); $('asset-facts').replaceChildren();
    for (const [label, value] of [['Fabricante', asset.brand || 'Não informado'], ['Modelo', asset.model || 'Não informado'], ['Número de série', asset.serial || 'Não informado'], ['Data da compra', dateLabel(asset.purchasedOn)], ['Término informado', dateLabel(asset.warrantyUntil)]]) {
      const line = node('div'); line.append(node('dt', label), node('dd', value)); $('asset-facts').append(line);
    }
    const line = node('div'); line.append(node('dt', 'Em relação à data de referência')); const value = node('dd'); value.append(dateStatus(info.state, info.daysUntil)); line.append(value); $('asset-facts').append(line);
    $('detail-notes').textContent = asset.notes; $('detail-notes').hidden = !asset.notes;
    $('document-list').replaceChildren(); $('documents-empty').hidden = !!asset.documents.length;
    for (const file of asset.documents) {
      const item = node('li', '', 'document-row'), content = node('div'), buttons = node('div', '', 'action-group'); item.append(icon('file'));
      content.append(node('p', file.fileName, 'document-name'), node('p', `${file.mimeType.split('/')[1].toUpperCase()} · ${(file.sizeBytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KiB`, 'document-meta'));
      buttons.append(action('Baixar arquivo', 'downloadDoc', file.id), action('Remover arquivo', 'removeDoc', file.id)); content.append(buttons); item.append(content); $('document-list').append(item);
    }
    $('document-file').disabled = asset.documents.length >= LIMITS.maxDocumentsPerAsset;
    $('task-list').replaceChildren(); $('tasks-empty').hidden = !!asset.maintenance.length;
    for (const task of [...asset.maintenance].sort((a, b) => Number(!!a.completedOn) - Number(!!b.completedOn) || a.dueOn.localeCompare(b.dueOn))) {
      const row = node('div', '', 'task-row' + (task.completedOn ? ' completed' : '')), content = node('div'), buttons = node('div', '', 'action-group');
      const until = daysBetween(referenceDate, task.dueOn); content.append(node('h4', task.title), dateStatus(until < 0 ? 'past' : until === 0 ? 'today' : 'future', until, !!task.completedOn), node('p', 'Prevista: ' + dateLabel(task.dueOn) + (task.completedOn ? ' · Concluída: ' + dateLabel(task.completedOn) : '')));
      if (task.notes) content.append(node('p', task.notes));
      if (!task.completedOn) buttons.append(action('Concluir', 'completeTask', task.id, 'button secondary'));
      buttons.append(action('Editar', 'editTask', task.id), action('Remover', 'removeTask', task.id)); row.append(content, buttons); $('task-list').append(row);
    }
    $('new-task').disabled = asset.maintenance.length >= LIMITS.maxMaintenancePerAsset;
  }
  function renderAgenda() {
    const tasks = agenda(book, referenceDate); $('agenda-list').replaceChildren(); $('agenda-empty').hidden = !!tasks.length;
    for (const task of tasks) {
      const row = node('article', '', 'agenda-row'), when = node('div'), content = node('div');
      when.append(node('div', dateLabel(task.dueOn), 'agenda-date'), dateStatus(task.state, task.daysUntil)); content.append(node('h3', task.title), node('p', task.assetName));
      const button = action('Abrir bem', 'open', task.assetId, 'button secondary'); button.setAttribute('aria-label', 'Abrir bem: ' + task.assetName); row.append(when, content, button); $('agenda-list').append(row);
    }
  }
  function render() {
    renderInventory(); renderDetail(); renderAgenda(); $('book-title').value = book.title;
    $('confirm-remove-asset').hidden = true; $('confirm-empty-book').hidden = true; $('confirm-example').hidden = true; status();
  }
  async function commit(next, text, nextView = view) {
    next = validateBook(next); const old = book; let result = text;
    if (remember && store && !conflict && !paused) {
      try { const saved = await store.save(next, revision); revision = saved.revision; }
      catch (error) {
        paused = true; conflict = error instanceof ConflictError;
        result += conflict ? ' A versão salva mudou em outra aba. Esta alteração está somente nesta aba; baixe um backup ou carregue a versão salva.' : ' O salvamento local falhou. Esta alteração está somente nesta aba; baixe um backup.';
      }
    } else if (remember && (paused || conflict)) result += ' Esta alteração está somente nesta aba; o salvamento continua pausado.';
    previous = old; book = next; dirty = false; $('task-form').hidden = true; selectView(nextView); render(); message(result, { undo: true });
    return true;
  }
  function fieldErrors(error, prefix) {
    document.querySelectorAll('.field-error').forEach(element => { element.textContent = ''; });
    document.querySelectorAll('[aria-invalid]').forEach(element => element.removeAttribute('aria-invalid'));
    const field = error.field?.split('.').at(-1), id = prefix + '-' + field, input = $(id), help = $('error-' + id);
    if (input) { input.setAttribute('aria-invalid', 'true'); if (help) { help.textContent = error.message; input.setAttribute('aria-describedby', help.id); } pendingFocus = id; }
    message(error instanceof ValidationError ? error.message : 'Confira os campos antes de salvar.');
  }
  function clearErrors() {
    document.querySelectorAll('.field-error').forEach(element => { element.textContent = ''; });
    document.querySelectorAll('[aria-invalid]').forEach(element => element.removeAttribute('aria-invalid'));
  }
  function openAsset(id) {
    if (!cleanToLeave()) return false;
    selectedId = id; $('task-form').hidden = true; selectView('detail'); renderDetail(); status(); return true;
  }
  function openEditor(existing) {
    if (!cleanToLeave()) return;
    const asset = existing ? currentAsset() : emptyAsset(makeId()); if (!asset) return;
    draftId = asset.id; editingExisting = !!existing; clearErrors();
    for (const key of assetFields) $('asset-' + key).value = asset[key];
    $('edit-title').textContent = existing ? 'Editar dados do bem' : 'Cadastrar bem'; dirty = false; selectView('edit'); pendingFocus = 'asset-name';
  }
  function openTask(id = null, complete = false) {
    if (!cleanToLeave()) return;
    const asset = currentAsset(), task = id ? asset.maintenance.find(task => task.id === id) : { id: makeId(), title: '', dueOn: '', completedOn: '', notes: '' };
    if (!task) return;
    taskId = task.id; clearErrors();
    for (const key of taskFields) $('task-' + key).value = complete && key === 'completedOn' ? referenceDate : task[key];
    dirty = complete; $('task-form-title').textContent = id ? 'Atualizar manutenção' : 'Agendar manutenção'; $('task-form').hidden = false; pendingFocus = 'task-title';
  }
  async function restoreSaved() {
    if (!cleanToLeave() || !store) return false;
    const saved = await store.load(); previous = book; book = saved.book || emptyBook(makeId()); revision = saved.revision;
    remember = saved.book !== null; conflict = paused = false; dirty = false; selectedId = null; selectView('inventory'); render(); message('Versão salva carregada. A versão anterior desta aba pode ser recuperada.', { undo: true }); return true;
  }

  for (const name of ['inventory', 'agenda', 'backup']) bind('nav-' + name, 'click', () => navigation(name));
  bind('back-inventory', 'click', () => navigation('inventory')); bind('agenda-inventory', 'click', () => navigation('inventory'));
  bind('new-asset', 'click', () => openEditor(false)); bind('first-asset', 'click', () => openEditor(false)); bind('edit-asset', 'click', () => openEditor(true));
  async function loadExample() {
    selectedId = null; await commit(createExampleBook(), 'Exemplo fictício carregado. Substitua os dados antes de usar seu inventário.', 'inventory');
  }
  bind('load-example', 'click', async () => {
    if (!cleanToLeave()) return;
    if (!book.assets.length) return loadExample();
    $('example-summary').textContent = `Substituir ${plural(book.assets.length, 'bem', 'bens')} e seus arquivos e manutenções pelos dados fictícios? Baixe um backup antes se quiser guardar esta versão.`;
    $('confirm-example').hidden = false; message('Você já tem dados neste inventário. Confira a substituição antes de carregar o exemplo.');
  });
  bind('confirm-example-replace', 'click', async () => { if (!cleanToLeave() || $('confirm-example').hidden) return; await loadExample(); });
  bind('cancel-example', 'click', () => { $('confirm-example').hidden = true; message('Exemplo cancelado. Seu inventário foi preservado.'); });
  for (const id of ['search', 'category', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { if (!busy) renderInventory(); });
  for (const id of ['asset-form', 'task-form']) $(id).addEventListener('input', () => { dirty = true; });
  $('book-title').addEventListener('input', () => { dirty = $('book-title').value !== book.title; });
  bind('asset-form', 'submit', async () => {
    const asset = editingExisting ? structuredClone(currentAsset()) : emptyAsset(draftId);
    for (const key of assetFields) asset[key] = $('asset-' + key).value;
    try {
      if (!asset.name.trim()) throw new ValidationError('name', 'Informe um nome para reconhecer este bem.');
      const next = editingExisting ? replaceAsset(book, asset) : addAsset(book, asset); selectedId = asset.id;
      clearErrors(); await commit(next, 'Bem salvo.', 'detail');
    } catch (error) { fieldErrors(error, 'asset'); }
  });
  bind('cancel-edit', 'click', () => { dirty = false; clearErrors(); selectView(editingExisting ? 'detail' : 'inventory'); render(); message('Edição cancelada. Os dados confirmados foram preservados.'); });
  bind('ask-remove-asset', 'click', () => { if (!cleanToLeave()) return; $('confirm-remove-text').textContent = `Remover “${currentAsset().name}” e seus arquivos e manutenções desta versão?`; $('confirm-remove-asset').hidden = false; });
  bind('cancel-remove-asset', 'click', () => { $('confirm-remove-asset').hidden = true; });
  bind('remove-asset', 'click', async () => { if (!cleanToLeave()) return; const next = removeAsset(book, selectedId); selectedId = null; await commit(next, 'Bem removido. Você pode desfazer esta alteração.', 'inventory'); });
  for (const id of ['asset-list', 'agenda-list']) bind(id, 'click', event => { const button = event.target.closest('[data-open]'); if (button) openAsset(button.dataset.open); });
  bind('document-file', 'change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (!cleanToLeave()) return;
      if (file.size > LIMITS.maxDocumentBytes) { message('O arquivo excede 2 MiB. Escolha uma cópia menor.'); return; }
      const asset = currentAsset(); if (!asset) return;
      const attachment = await createAttachment({ id: makeId(), fileName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
      await commit(addDocument(book, asset.id, attachment), 'Arquivo adicionado à ficha. Guarde também uma cópia de backup.');
    } finally { event.target.value = ''; }
  });
  bind('document-list', 'click', async event => {
    const download = event.target.closest('[data-download-doc]'), remove = event.target.closest('[data-remove-doc]');
    if (!cleanToLeave()) return;
    if (download) { const file = currentAsset().documents.find(file => file.id === download.dataset.downloadDoc); onDownload(attachmentBytes(file), 'application/octet-stream', safeFileName(file.fileName)); message('Arquivo preparado para download.'); }
    if (remove) await commit(removeDocument(book, selectedId, remove.dataset.removeDoc), 'Arquivo removido. Você pode desfazer esta alteração.');
  });
  bind('new-task', 'click', () => openTask());
  bind('cancel-task', 'click', () => { dirty = false; clearErrors(); $('task-form').hidden = true; message('Edição da manutenção cancelada.'); });
  bind('task-list', 'click', async event => {
    const edit = event.target.closest('[data-edit-task]'), complete = event.target.closest('[data-complete-task]'), remove = event.target.closest('[data-remove-task]');
    if (edit) openTask(edit.dataset.editTask); if (complete) openTask(complete.dataset.completeTask, true);
    if (remove && cleanToLeave()) await commit(removeMaintenance(book, selectedId, remove.dataset.removeTask), 'Manutenção removida. Você pode desfazer esta alteração.');
  });
  bind('task-form', 'submit', async () => {
    const task = { id: taskId }; for (const key of taskFields) task[key] = $('task-' + key).value;
    try {
      if (!task.title.trim()) throw new ValidationError('title', 'Descreva a manutenção para reconhecê-la.');
      const exists = currentAsset().maintenance.some(value => value.id === taskId);
      const next = exists ? replaceMaintenance(book, selectedId, task) : addMaintenance(book, selectedId, task);
      clearErrors(); await commit(next, task.completedOn ? 'Conclusão registrada. A data prevista foi preservada.' : 'Manutenção salva.');
    } catch (error) { fieldErrors(error, 'task'); }
  });
  bind('undo', 'click', async () => { if (!cleanToLeave() || !previous) return; const next = previous; await commit(next, 'A versão anterior desta aba foi recuperada.', 'inventory'); previous = null; $('undo').hidden = true; });
  bind('reload-saved', 'click', restoreSaved);
  bind('remember', 'change', async () => {
    if (!cleanToLeave()) { $('remember').checked = remember; return; }
    const requested = $('remember').checked;
    if (!store) { $('remember').checked = false; return; }
    if (requested) {
      remember = true;
      if (conflict || paused) { status(); message('O salvamento continua pausado. Baixe esta versão ou carregue a versão salva.'); return; }
      try { const saved = await store.save(book, revision); revision = saved.revision; message('Inventário salvo neste navegador. Mantenha seu próprio backup.'); }
      catch (error) { paused = true; conflict = error instanceof ConflictError; message(conflict ? 'A versão salva mudou. Esta aba foi preservada; baixe um backup ou carregue a versão salva.' : 'O navegador não confirmou o salvamento. Os dados continuam nesta aba; baixe um backup.'); }
    } else {
      try { const cleared = await store.clear(revision); revision = cleared.revision; remember = false; paused = conflict = false; message('Salvamento desativado e cópia local desta revisão removida. O inventário continua na memória da aba.'); }
      catch (error) {
        remember = false; paused = false; conflict = error instanceof ConflictError;
        message(conflict ? 'Salvamento desta aba desativado. A cópia alterada em outra aba foi preservada.' : 'Salvamento desta aba desativado. Não foi possível confirmar a remoção da cópia local; ela pode continuar neste navegador.');
      }
    }
    status();
  });
  bind('retry-save', 'click', async () => {
    if (!cleanToLeave() || !store || !remember || conflict) return;
    try { const saved = await store.save(book, revision); revision = saved.revision; paused = false; message('Esta versão foi salva neste navegador.'); }
    catch (error) { paused = true; conflict = error instanceof ConflictError; message(conflict ? 'A versão salva mudou. Baixe esta cópia ou carregue a versão salva.' : 'O salvamento não foi confirmado. Baixe um backup para guardar esta versão.'); }
    status();
  });
  bind('export-backup', 'click', async () => { if (!cleanToLeave()) return; const text = await exportBackup(book); onDownload(text, 'application/json;charset=utf-8', backupFilename(book)); message('Backup completo preparado para download, incluindo os arquivos. Guarde-o em um local seu.'); });
  bind('export-csv', 'click', () => { if (!cleanToLeave()) return; onDownload(exportInventoryCsv(book, referenceDate), 'text/csv;charset=utf-8', backupFilename(book, 'csv')); message('Lista CSV preparada para download. Os anexos ficam somente no backup JSON.'); });
  bind('import-file', 'change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    pendingImport = null; $('import-confirm').hidden = true;
    try {
      if (!cleanToLeave()) return;
      if (file.size > LIMITS.maxJsonBytes) { message('O JSON excede 20 MiB. O inventário atual foi preservado.'); return; }
      pendingImport = await importBackup(await file.text());
      $('import-summary').textContent = `Backup verificado: ${plural(pendingImport.assets.length, 'bem', 'bens')} e ${plural(pendingImport.assets.reduce((sum, asset) => sum + asset.documents.length, 0), 'arquivo')}. Substituir os dados confirmados desta aba?`;
      $('import-confirm').hidden = false; message('Backup validado. Confira a substituição antes de confirmar.');
    } catch { pendingImport = null; $('import-confirm').hidden = true; message('O backup não passou pela verificação de formato e integridade. Nenhum dado atual foi substituído.'); }
    finally { event.target.value = ''; }
  });
  bind('cancel-import', 'click', () => { pendingImport = null; $('import-confirm').hidden = true; message('Restauração cancelada.'); });
  bind('confirm-import', 'click', async () => { if (!cleanToLeave() || !pendingImport) return; const next = pendingImport; pendingImport = null; $('import-confirm').hidden = true; selectedId = null; await commit(next, 'Backup restaurado. Confira seus bens, arquivos e datas.', 'inventory'); });
  bind('rename-book', 'click', async () => { const next = structuredClone(book); next.title = $('book-title').value; await commit(next, 'Nome do inventário salvo.'); });
  bind('ask-empty-book', 'click', () => { if (cleanToLeave()) $('confirm-empty-book').hidden = false; });
  bind('cancel-empty-book', 'click', () => { $('confirm-empty-book').hidden = true; });
  bind('empty-book', 'click', async () => { if (!cleanToLeave()) return; selectedId = null; await commit(emptyBook(makeId()), 'Inventário vazio criado. A versão anterior pode ser recuperada.', 'inventory'); });
  const onBeforeUnload = event => { if (dirty || ((!remember || paused || conflict) && book.assets.length)) { event.preventDefault(); event.returnValue = ''; } };
  const onFocus = () => { if (busy) return; const next = today(); daysBetween(next, next); if (next !== referenceDate) { referenceDate = next; renderInventory(); renderAgenda(); renderDetail(); status(); } };
  eventTarget?.addEventListener('beforeunload', onBeforeUnload); eventTarget?.addEventListener('focus', onFocus);
  setBusy(true);
  try {
    store = await storeFactory(); const saved = await store.load(); revision = saved.revision;
    if (saved.book) { book = saved.book; remember = true; message('Inventário recuperado deste navegador.'); }
  } catch { store?.close(); store = null; message('O salvamento local não está disponível ou os dados salvos não puderam ser verificados. Eles não foram alterados. Você pode trabalhar nesta aba e baixar um backup.'); }
  render(); setBusy(false);
  return { getBook: () => validateBook(book), whenIdle: () => lastAction,
    destroy() { store?.close(); eventTarget?.removeEventListener('beforeunload', onBeforeUnload); eventTarget?.removeEventListener('focus', onFocus); } };
}
if (typeof window !== 'undefined' && globalThis.document?.getElementById('asset-form')) {
  createApp().catch(() => { document.getElementById('fatal').hidden = false; });
}
