# Produto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

HTML, CSS e módulos JavaScript estáticos, com núcleo independente e testes Node.js. Publicação pelo GitHub Pages. IndexedDB para salvamento local opcional; sem dependências de execução no navegador.

## Users

Público proposto: pessoas e pequenos negócios que querem organizar bens, comprovantes e datas de manutenção. Ainda não há pesquisa de uso documentada.

## Product Purpose

Manter um inventário pessoal com os prazos informados pelo usuário, anexos e uma agenda de cuidados. Possibilitar backup completo e restauração sem conta ou servidor de negócio.

## Operating Context

Uso no navegador, em uma aba por vez de preferência. Sem envio de inventário ou anexos a serviços externos. O aplicativo começa vazio; o exemplo é identificado como fictício. A agenda é consultada ao abrir o aplicativo e não promete notificações em segundo plano.

## Capabilities and Constraints

Até 200 bens. Cada bem admite nome, categoria, fabricante, modelo, número de série, compra, término de prazo informado, observações, comprovantes e tarefas de manutenção. Comprovantes PNG, JPEG ou PDF: até 2 MiB por arquivo, 5 arquivos por bem e 12 MiB no conjunto. Backup JSON inclui os anexos e exige validação de formato e SHA256 antes de substituir o inventário. Datas são explícitas; conclusão preserva a data prevista. Nenhum cálculo determina garantia legal ou contratual. Salvamento local opcional com revisão transacional e conflitos explícitos. Não há nuvem, autenticação, envio de mensagens, OCR ou IA.

## Brand Commitments

Uma aplicação aberta da LOFRANO TECNOLOGIA, vinculada a https://lofranotecnologia.com.br. Mantém a família tipográfica Lato, a marca em rosa e a clareza operacional do Orçamento Aberto. A composição nova prioriza a busca de bens e o acesso aos seus documentos e prazos. Exemplos e capturas públicas usam apenas dados fictícios.
