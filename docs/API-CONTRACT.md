# Contrato do núcleo e dos adaptadores

Aplicação: Garantia Aberta. Identificadores são fornecidos pelo chamador, únicos no livro, com 1–80 caracteres ASCII alfanuméricos, `_` ou `-`. O domínio não consulta relógio nem gera IDs.

```js
{
  schemaVersion: 1, id: 'inventario-001', title: 'Meu inventário',
  assets: [{
    id: 'bem-001', name: 'Notebook', category: 'Eletrônicos', brand: '', model: '', serial: '',
    purchasedOn: '', warrantyUntil: '', notes: '',
    documents: [{ id:'doc-001', fileName:'comprovante.pdf', mimeType:'application/pdf', sizeBytes:123,
      sha256:'<64 caracteres hex minúsculos>', dataBase64:'<base64 canônico>' }],
    maintenance: [{ id:'tarefa-001', title:'Limpeza', dueOn:'2026-12-01', completedOn:'', notes:'' }]
  }]
}
```

Campos desconhecidos são recusados. Textos não são HTML. Datas são `YYYY-MM-DD` válidas ou vazias nos campos opcionais. `purchasedOn` e `warrantyUntil` opcionais; quando ambos existem, o término não antecede a compra. Tarefa exige `dueOn`; `completedOn` opcional, inclusive conclusão antecipada. Não há renovação automática de prazo.

## src/domain.mjs

- `LIMITS`: maxAssets=200, maxDocumentsPerAsset=5, maxDocumentBytes=2097152, maxTotalDocumentBytes=12582912, maxJsonBytes=20971520, maxMaintenancePerAsset=100; limites textuais documentados pelo módulo.
- `ValidationError`, com `field`.
- `emptyBook(id)` → livro sem bens, título `Meu inventário`.
- `emptyAsset(id)` → bem sem documentos/tarefas e campos textuais vazios.
- `validateBook(value)` → clone canônico; valida estrutura, IDs, limites e forma lexical Base64/tamanho declarado, sem calcular SHA256.
- `parseBookJson(text)` → validateBook após parser estrito com tamanho, profundidade e chaves duplicadas.
- `addAsset(book, asset)`, `replaceAsset(book, asset)`, `removeAsset(book, assetId)` → novo livro validado; IDs existentes/inexistentes são erros conforme a operação.
- `addDocument(book, assetId, document)`, `removeDocument(book, assetId, documentId)` → novo livro validado.
- `addMaintenance(book, assetId, task)`, `replaceMaintenance(book, assetId, task)`, `removeMaintenance(book, assetId, taskId)` → novo livro validado.
- `daysBetween(fromDate, toDate)` → inteiro de dias civis, datas obrigatórias.
- `warrantyInfo(asset, today)` → `{state:'no-date'|'past'|'today'|'future', daysUntil:number|null}`; `today` explícito.
- `agenda(book, today)` → tarefas pendentes ordenadas por dueOn, assetId e taskId, com `{assetId,assetName,taskId,title,dueOn,daysUntil,state:'past'|'today'|'future'}`.
- `createExampleBook()` → dados explicitamente fictícios, IDs e datas fixos, sem anexos reais; 3 bens e tarefas pendentes/concluídas.

## src/attachments.mjs

- `createAttachment({id,fileName,mimeType,bytes}, options?)` → Promise documento; bytes Uint8Array. SHA256 via Web Crypto; confere limite e assinatura básica PNG/JPEG/PDF, não autenticidade ou conteúdo completo.
- `verifyBook(book, options?)` → Promise clone validado, conferindo Base64 canônico, comprimento, assinatura básica MIME e SHA256 de todos os anexos. Nunca modifica a entrada. Opcional `crypto` para injeção do Web Crypto compatível; padrão globalThis.crypto.
- `attachmentBytes(document)` → Uint8Array decodificado com verificações lexicais/tamanho.

## src/backup.mjs

- `exportBackup(book)` → Promise JSON completo verificado; usa indentação quando couber no teto de 20 MiB e formato compacto quando necessário para garantir restauração.
- `importBackup(text)` → Promise livro verificado; não modifica estado externo.
- `exportInventoryCsv(book, today)` → CSV de metadados e prazos, sem anexos; UTF8 BOM, `;`, CRLF, proteção contra fórmulas.
- `backupFilename(book, extension='json')` → nome ASCII seguro, aceita apenas json/csv.

## src/storage.mjs

- `openBookStore({indexedDB=globalThis.indexedDB, dbName='lofrano-garantia-aberta-v1'}={})` → Promise adaptador.
- adaptador `.load()` → Promise `{revision:0, book:null}` para ausente, ou cópia validada/verificada do registro existente.
- adaptador `.save(book, expectedRevision)` → Promise `{revision,book}` após commit transacional. Verificação de anexos ocorre antes da transação. Comparação de revisão e escrita no mesmo readwrite transaction. Só resolve após transaction.complete.
- adaptador `.clear(expectedRevision)` → Promise `{revision,book:null}`; mantém tombstone com revisão crescente para evitar ABA. Não apaga outro banco ou chave.
- `.close()` encerra conexão própria.
- `ConflictError` com `expectedRevision` e `actualRevision`; `StorageError` com `code` sem conteúdo privado.

Nenhuma escrita de documento ocorre no primeiro load. Não há fallback silencioso de persistência para memória. A interface pode continuar explicitamente em memória em caso de falha e oferecer backup.
