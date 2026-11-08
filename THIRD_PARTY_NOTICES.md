# Avisos de terceiros

O código próprio do Garantia Aberta usa a [licença MIT](LICENSE). As exceções e dependências estão identificadas abaixo. O build estático não incorpora pacotes npm: os módulos do navegador não têm dependências de execução.

## Material reutilizado do Orçamento Aberto

As verificações de objetos e listas do núcleo foram adaptadas do Orçamento Aberto, projeto da própria LOFRANO TECNOLOGIA sob licença MIT. As fontes Lato e a linguagem visual de marca também foram reaproveitadas dessa base.

Copyright (c) 2026 Contribuidores da LOFRANO TECNOLOGIA.

O aviso e os termos MIT estão preservados em [LICENSE](LICENSE). A licença dos arquivos Lato permanece separada, conforme a seção seguinte.

## Fontes Lato

- Arquivos distribuídos: `assets/lato-regular.ttf` e `assets/lato-bold.ttf`.
- Autoria e copyright indicados no aviso da fonte: Copyright (c) 2010–2011, Łukasz Dziedzic.
- Licença: SIL Open Font License 1.1 (OFL-1.1).
- Texto de licença e informações de origem: [assets/LATO-LICENSE.txt](assets/LATO-LICENSE.txt).

As fontes são servidas pelo próprio site, sem requisição a um provedor de fontes. Preserve o aviso OFL ao redistribuir os arquivos. A licença MIT do aplicativo não substitui a licença das fontes.

## Dependências diretas de desenvolvimento

| Pacote | Versão fixada | Uso | Licença |
| --- | --- | --- | --- |
| [linkedom](https://github.com/WebReflection/linkedom) | 0.18.15 | DOM para testes da interface em Node | ISC |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | 6.2.7 | IndexedDB em memória nos testes | Apache-2.0 |

O `npm ci` instala os textos completos nas pastas dos pacotes. O linkedom inclui o seguinte aviso:

```text
ISC License

Copyright (c) 2021, Andrea Giammarchi, @WebReflection

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

O fake-indexeddb inclui `Copyright 2017 Jeremy Scheff` e a [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), disponível integralmente em `node_modules/fake-indexeddb/LICENSE` depois da instalação. Preserve os avisos e termos desse pacote se redistribuir seu código.

## Dependências transitivas de desenvolvimento

Inventário das versões resolvidas em `package-lock.json`. Elas pertencem à árvore de ferramentas de desenvolvimento, sem inclusão no build estático.

| Pacote | Versões resolvidas | Licença declarada |
| --- | --- | --- |
| boolbase | 2.0.0 | ISC |
| css-select | 7.0.0 | BSD-2-Clause |
| css-what | 8.0.0 | BSD-2-Clause |
| cssomnom | 0.1.11 | Apache-2.0 |
| dom-serializer | 3.1.1, 2.0.0 | MIT |
| domelementtype | 3.0.0, 2.3.0 | BSD-2-Clause |
| domhandler | 6.0.1, 5.0.3 | BSD-2-Clause |
| domutils | 4.0.2, 3.2.2 | BSD-2-Clause |
| entities | 8.1.0, 7.0.1, 4.5.0 | BSD-2-Clause |
| html-escaper | 3.0.3 | MIT |
| htmlparser2 | 10.1.0 | MIT |
| nth-check | 3.0.1 | BSD-2-Clause |
| uhyphen | 0.2.0 | ISC |

Os avisos completos de copyright e licença acompanham os respectivos pacotes em `node_modules/`. Este inventário facilita a identificação e não substitui esses textos. Ao atualizar dependências ou passar a distribuir ferramentas de desenvolvimento, confira as licenças e atualize este arquivo.
