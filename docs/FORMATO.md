# Formato dos dados — versão 1

O backup completo é um arquivo JSON UTF-8 com um único objeto de inventário. Inclui os bytes dos anexos em Base64 e as manutenções concluídas. Não contém credenciais, preferências de interface ou a revisão interna do IndexedDB. O CSV é uma exportação de consulta, sem restauração.

## Exemplo de backup válido

Este inventário usa somente dados fictícios e não contém anexos:

```json
{
  "schemaVersion": 1,
  "id": "inventario-ficticio",
  "title": "Casa — exemplo fictício",
  "assets": [
    {
      "id": "bem-cafeteira",
      "name": "Cafeteira — exemplo fictício",
      "category": "Cozinha",
      "brand": "Marca fictícia",
      "model": "Modelo fictício",
      "serial": "FICTICIO-001",
      "purchasedOn": "2026-02-20",
      "warrantyUntil": "2027-02-20",
      "notes": "Prazo informado apenas para demonstração.",
      "documents": [],
      "maintenance": [
        {
          "id": "tarefa-limpeza",
          "title": "Consultar cuidados de limpeza",
          "dueOn": "2026-11-15",
          "completedOn": "",
          "notes": "Consulte as instruções reais do fabricante."
        }
      ]
    }
  ]
}
```

Todos os campos de cada objeto precisam estar presentes. Campos adicionais são recusados; não use `null` no lugar de strings vazias ou listas vazias. O exportador prefere JSON indentado com dois espaços e uma quebra de linha final. Quando necessário para respeitar o limite de tamanho, usa JSON compacto e pode omitir a quebra de linha final. A importação não exige uma formatação específica, mas exige JSON válido e não admite chaves duplicadas, inclusive quando escritas com escapes Unicode diferentes.

## Objetos e campos

| Objeto | Campos |
| --- | --- |
| Inventário | `schemaVersion`, `id`, `title`, `assets` |
| Bem em `assets` | `id`, `name`, `category`, `brand`, `model`, `serial`, `purchasedOn`, `warrantyUntil`, `notes`, `documents`, `maintenance` |
| Anexo em `documents` | `id`, `fileName`, `mimeType`, `sizeBytes`, `sha256`, `dataBase64` |
| Manutenção em `maintenance` | `id`, `title`, `dueOn`, `completedOn`, `notes` |

`schemaVersion` é o número inteiro `1`. `assets`, `documents` e `maintenance` são listas. Os demais campos são strings, exceto `sizeBytes`, que é um inteiro positivo seguro de bytes. Todos os IDs, incluindo o do inventário, precisam ser únicos no inventário inteiro e seguir `[A-Za-z0-9_-]{1,80}`.

### Textos e datas

| Campo textual | Máximo em pontos de código Unicode |
| --- | --- |
| `title` do inventário, `name` do bem, `title` da manutenção | 120 |
| `category`, `brand`, `model` | 100 |
| `serial` | 120 |
| `notes` do bem ou da manutenção | 4.000 |
| `fileName` | 180; não pode ser vazio |

O núcleo não faz trim, normalização ou truncamento. Aceita textos vazios nos campos textuais, exceto `fileName`; a interface exige nome do bem e título da manutenção com pelo menos um caractere que não seja espaço em branco. Textos são dados, não HTML. São recusados caracteres de controle C0/C1 e sequências Unicode inválidas; `notes` admite TAB e LF. Há ainda um teto de quatro bytes UTF-8 por ponto de código permitido.

Datas são strings de calendário `YYYY-MM-DD`, de `0001-01-01` a `9999-12-31`, sem horário ou fuso. `purchasedOn`, `warrantyUntil` e `completedOn` aceitam `""`; `dueOn` é obrigatório e não aceita vazio. Quando compra e término estão preenchidos, o término não pode anteceder a compra.

A conclusão pode ocorrer antes da data prevista. Concluir não altera `dueOn`, não cria a próxima tarefa e não renova o prazo informado. A situação do prazo e da tarefa é calculada ao consultar o inventário, a partir de uma data atual explícita; não é gravada no JSON. Uma tarefa com `completedOn` preenchido deixa de aparecer entre as pendentes da agenda, mas permanece no bem e no backup.

### Anexos

| Campo | Regra |
| --- | --- |
| `mimeType` | `image/png`, `image/jpeg` ou `application/pdf` |
| `sizeBytes` | Tamanho dos bytes originais, entre 1 e 2.097.152 |
| `sha256` | SHA256 dos bytes originais, em 64 caracteres hexadecimais minúsculos |
| `dataBase64` | Base64 canônico, sem espaços, quebras de linha ou prefixo `data:` |

O Base64 usa o alfabeto padrão `A–Z`, `a–z`, `0–9`, `+`, `/` e padding `=` quando necessário. Seu comprimento deve ser `4 × ceil(sizeBytes / 3)`, com bits de padding canônicos. O nome do arquivo é um rótulo; ele não determina o MIME.

`createAttachment` gera o Base64 e o hash a partir dos bytes. `verifyBook` e o importador conferem o tamanho decodificado, a assinatura básica PNG/JPEG/PDF e o SHA256 de todos os anexos. A verificação do PDF aceita cabeçalho de versão 1.0 a 1.7 ou 2.0. Não é feita uma análise completa do conteúdo de nenhum desses formatos. Um hash que coincide não prova autoria, autenticidade, validade jurídica ou ausência de malware. Não há hash global ou assinatura digital do backup.

`validateBook` e `parseBookJson` conferem a estrutura e a forma lexical do Base64, mas não calculam SHA256. Use `importBackup` ou `verifyBook` quando precisar da verificação completa dos anexos.

## Limites do inventário e JSON

| Limite | Valor |
| --- | --- |
| Bens | 200 |
| Manutenções por bem | 100 |
| Anexos por bem | 5 |
| Bytes por anexo | 2 MiB = 2.097.152 |
| Soma dos bytes originais de todos os anexos | 12 MiB = 12.582.912 |
| JSON UTF-8 | 20 MiB = 20.971.520 bytes |
| Profundidade de objetos e listas do JSON | 32, contando a raiz como 1 |

Base64 e indentação também ocupam espaço no JSON. O importador limita o tamanho do texto recebido e o núcleo limita a representação JSON canônica. O exportador reduz a formatação quando necessário para que o backup de um inventário válido respeite os 20 MiB. Esses limites não garantem espaço disponível no navegador.

## Usar as APIs

O exemplo abaixo pode ser executado na raiz do repositório com `node --input-type=module`. Não acessa o navegador, não grava arquivos e usa dados fictícios:

```js
import { emptyBook, emptyAsset, addAsset, addMaintenance, agenda }
  from './src/domain.mjs';
import { exportBackup, importBackup } from './src/backup.mjs';

let book = emptyBook('inventario-api-ficticio');
const asset = {
  ...emptyAsset('bem-api-ficticio'),
  name: 'Cafeteira — exemplo fictício',
  purchasedOn: '2026-02-20',
  warrantyUntil: '2027-02-20',
};
book = addAsset(book, asset);
book = addMaintenance(book, asset.id, {
  id: 'tarefa-api-ficticia',
  title: 'Consultar cuidados de limpeza',
  dueOn: '2026-11-15',
  completedOn: '',
  notes: '',
});

const json = await exportBackup(book);
const restored = await importBackup(json);
console.log(restored.assets[0].name);
console.log(agenda(restored, '2026-11-08')[0].daysUntil); // 7
```

As APIs de importação e exportação não modificam o estado da interface nem gravam no IndexedDB. O chamador controla a confirmação da substituição. As operações do domínio devolvem clones validados sem modificar a entrada. Para assinaturas e erros dos módulos, consulte [API-CONTRACT.md](API-CONTRACT.md).

No IndexedDB, o adaptador mantém um envelope interno `{ revision, book }`; esse envelope não faz parte do backup. A revisão cresce inclusive ao limpar o registro. Não use essa revisão como ID do inventário nem acrescente-a ao JSON exportado.

## CSV de consulta

`exportInventoryCsv(book, today)` recebe o inventário e uma data atual explícita. Gera UTF-8 com BOM, separador `;`, campos entre aspas e linhas CRLF. As aspas dentro de um campo são duplicadas. Campos que começam com prefixos reconhecidos como fórmulas recebem um apóstrofo de proteção.

Cada bem tem uma linha `Bem`. Cada manutenção, pendente ou concluída, tem outra linha `Manutenção`, com os metadados do bem repetidos. As colunas, nesta ordem, são:

```text
Tipo;ID do bem;Bem;Categoria;Fabricante;Modelo;Número de série;Data da compra;Término informado;Situação do prazo;Dias até o término;Observações do bem;Quantidade de comprovantes;ID da manutenção;Manutenção;Data prevista;Concluída em;Situação da manutenção;Dias até a manutenção;Observações da manutenção
```

O CSV contém a quantidade de comprovantes, sem nomes, hashes ou bytes dos arquivos. O prazo usa `Sem data`, `Passado`, `Hoje` ou `Futuro`; a manutenção pode também usar `Concluída`. Os dias são diferenças de dias civis em relação a `today`, inclusive nas linhas de tarefas concluídas. Guarde o JSON para restaurar todos os dados.
