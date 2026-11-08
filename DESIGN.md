---
name: Garantia Aberta
description: Um arquivo de bens, comprovantes e cuidados da LOFRANO TECNOLOGIA.
colors:
  ink: "#19212e"
  muted: "#5b6472"
  accent: "#ae185c"
  accent-hover: "#8c134a"
  canvas: "#f0f2f6"
  paper: "#fff"
  line: "#d8dde5"
  control-line: "#c1cad6"
  secondary-line: "#cbd2dc"
  section-line: "#bcc5d1"
  frame: "#17202d"
  focus: "#b23975"
  danger: "#a51d36"
  success: "#286248"
  status-neutral: "#eef1f5"
typography:
  headline:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  section:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  card-title:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
  field:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  action:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3
  metadata:
    fontFamily: "Lato, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  status: "5px"
  field: "6px"
  button: "7px"
  notice: "8px"
  surface: "12px"
spacing:
  tight: "6px"
  icon: "8px"
  control: "10px"
  compact: "12px"
  regular: "16px"
  group: "20px"
  section: "24px"
  panel: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-quiet-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    padding: "6px 0"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "10px 11px"
  navigation:
    textColor: "{colors.muted}"
    padding: "14px 0"
  date-status:
    backgroundColor: "{colors.status-neutral}"
    textColor: "{colors.muted}"
    rounded: "{rounded.status}"
    padding: "5px 8px"
  asset-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "20px"
  agenda-row:
    textColor: "{colors.ink}"
    padding: "24px 0"
---

# Design System: Garantia Aberta

## Overview

**Creative North Star: "Arquivo de bens"**

O Arquivo de bens reúne informações que precisam ser reconhecidas, consultadas e conservadas. A linguagem é a de uma ferramenta de uso cotidiano: Lato local, superfícies brancas sobre um plano frio, contornos finos e rosa de ação. A autoria da LOFRANO TECNOLOGIA aparece na moldura escura sem competir com o conteúdo dos registros.

A hierarquia nasce do nome, das datas e dos documentos de cada bem. Fichas, listas e formulários compartilham alinhamentos e uma escala compacta; as áreas de leitura têm respiro entre grupos. O sistema usa texto e SVGs funcionais de traço, com mudanças de estado que preservam a posição dos elementos.

**Key Characteristics:**

- Neutros frios, cabeçalho escuro e rosa reservado à ação e à seleção.
- Uma família tipográfica, com pesos regular e negrito.
- Superfícies planas delimitadas por bordas e divisórias.
- Datas explícitas e estados acompanhados de texto.

## Colors

A paleta mantém o conteúdo em papel branco e tinta azulada; o rosa concentra a identidade e a resposta dos controles.

### Primary

- **Rosa LOFRANO** (`accent`): ações principais, links, navegação selecionada, cursor de edição e checkbox.
- **Rosa profundo** (`accent-hover`): resposta de botões primários e ações textuais ao ponteiro.
- **Rosa de foco** (`focus`): contorno de teclado nos controles e no seletor de arquivos.

### Neutral

- **Tinta azulada** (`ink`): nomes, títulos, valores e ações secundárias.
- **Cinza de apoio** (`muted`): categorias, instruções, metadados e placeholders com opacidade total.
- **Plano frio** (`canvas`): fundo contínuo da aplicação.
- **Papel branco** (`paper`): fichas, campos, formulários e painéis.
- **Linha fria** (`line`): contornos de superfícies e separações entre informações.
- **Linha de campo** (`control-line`): bordas de entradas e seletores.
- **Linha secundária** (`secondary-line`): botões secundários, linhas da agenda e rodapé.
- **Linha de seção** (`section-line`): base da navegação e início das listas de cuidados.
- **Azul da moldura** (`frame`): cabeçalho com marca e links claros.
- **Plano de estado neutro** (`status-neutral`): etiqueta de data ainda não informada.

O vermelho de correção (`danger`) acompanha erros e ações destrutivas. O verde de acompanhamento (`success`) identifica datas futuras e conclusões sobre um fundo verde claro. Datas passadas usam vermelho sobre rosa claro; a data de hoje usa marrom sobre creme. Essas cores sempre acompanham uma descrição textual. Avisos usam planos rosados claros e texto escuro, sem assumir o peso da ação principal.

**The Acento de Ação Rule.** Preserve os grandes planos de leitura em neutros; use o rosa para ação, seleção e foco de edição.

**The Estado por Extenso Rule.** Acompanhe cor e tratamento visual com texto que nomeie o estado, a data ou a correção necessária.

## Typography

**Display Font:** Lato, com Arial e sans-serif como fallback.
**Body Font:** Lato, com os mesmos fallbacks. Os arquivos locais fornecem os pesos (400 e 700).

**Character:** A mesma família conduz marca, títulos, campos e registros. Tamanho, peso e espaço distinguem as funções sem introduzir outra voz tipográfica.

### Hierarchy

- **Headline:** abertura da aplicação; usa o papel `headline`, reduzido para (29px) até o breakpoint intermediário e (28px) no móvel.
- **Title:** título da área ativa; usa `title`, reduzido para (20px) no móvel.
- **Section:** grupos de documentos e cuidados; usa `section`. A agenda usa títulos de (16px), reduzidos para (15px) no móvel.
- **Card title:** nome de cada bem, em `card-title`, com quebra de palavras longas.
- **Body:** base em `body`; textos de apoio usam em geral (12–14px). Ajuda e observações usam entrelinha de (1,7); os parágrafos dos painéis de backup usam (1,8).
- **Label / Field:** rótulos em `label` acima de valores em `field`. No móvel, os rótulos passam a (11px) e os campos a (16px).
- **Action / Metadata:** ações em `action`; contagens, estados e rodapé em `metadata`. Ações textuais de listas também podem usar (11px).

Ajuda e observações extensas preservam uma medida de até (75ch); os parágrafos dos painéis de backup usam até (65ch).

**The Datas para Conferência Rule.** Use algarismos tabulares nas datas das fichas e da agenda; alinhe os valores resumidos das fichas à direita para facilitar a comparação.

## Layout

A área principal é centralizada, com largura máxima de (1280px), respiro superior e lateral de `panel` e respiro inferior de `section`. O cabeçalho usa a mesma referência de largura para os alinhamentos externos. Navegação e estado de salvamento compartilham uma linha de base visual acima do conteúdo ativo.

O inventário organiza fichas em três colunas iguais, com intervalo de `group`. A busca recebe mais largura que os dois seletores, na proporção (1,7fr / 1fr / 1fr). A ficha detalhada reúne dados e documentos em duas colunas; os cuidados continuam abaixo como lista de linhas. Os formulários agrupam campos em duas colunas, com campos extensos atravessando a grade. Os painéis de backup usam duas colunas na proporção (1,25fr / 1fr).

Até (1050px), as fichas passam a duas colunas; o respiro lateral geral cai para `section`, e as áreas de dados e documentos passam à proporção (1fr / 1,1fr). Até (700px), as fichas e os formulários passam a uma coluna, com respiro lateral de `regular`. A busca ocupa uma linha inteira sobre os dois seletores. Dados e documentos se empilham e sua divisória passa de vertical a horizontal; os painéis de backup também se empilham. A navegação mantém seus três acessos em linha, e o estado da sessão passa para a linha seguinte.

A agenda usa colunas para data, descrição e ação (150px / espaço flexível / automático). No móvel, a data passa a (95px), e a ação fica abaixo da descrição. Grupos de ações podem quebrar linha; nomes, documentos e observações extensas quebram dentro da área disponível.

## Elevation & Depth

A composição não usa sombras. A profundidade vem do contraste entre a moldura escura, o plano frio da aplicação e as superfícies brancas. Bordas finas e divisórias organizam as camadas; estados de foco acrescentam um contorno temporário, sem elevar ou deslocar o controle.

**The Planos sem Elevação Rule.** Distinga superfícies por fundo, contorno e espaçamento; preserve fichas e painéis planos em repouso e no hover.

## Shapes

Cantos discretos marcam a diferença entre etiquetas (`status`), campos (`field`), botões (`button`), avisos (`notice`) e superfícies maiores (`surface`). Fichas, formulários e painéis compartilham o mesmo raio de superfície. As bordas usuais têm espessura de (1px); o estado vazio usa borda tracejada para diferenciar a área ainda sem registros.

Ícones funcionais são SVGs sem preenchimento, com traço de (1,7px), pontas e junções arredondadas. O padrão é (20px), reduzido conforme o controle: botões usam (16px), etiquetas de conclusão usam (13px). Textos identificam as ações junto aos ícones.

## Components

### Buttons

Ações compactas, legíveis e identificadas por verbo.

- **Shape:** raio `button`, altura mínima de (42px), espaço ícone–texto de `icon` e padding do componente `button-primary`.
- **Primary:** rosa com texto branco para cadastrar, salvar e baixar a cópia completa; o hover usa o rosa profundo.
- **Secondary:** branco, tinta azulada e borda secundária; o hover usa rosa muito claro e borda rosada.
- **Danger:** o pedido de remoção usa texto e contorno de correção sobre fundo transparente; a confirmação usa fundo vermelho e texto branco. O hover reforça cada tratamento.
- **Text:** ações de retorno, abertura e gestão de registros usam texto rosa; o sublinhado permanece nas ações textuais, exceto nos acessos de ficha e retorno com ícone.
- **States:** fundo, cor e borda transitam em (0,16s ease-out). O foco tem contorno rosa de (3px), afastado (3px). Controles desabilitados usam opacidade de (0,55) e cursor correspondente. Ações compactas de listas têm altura mínima de (36px).

### Chips

Etiquetas de prazo são informativas e não são filtros clicáveis.

- **Shape:** raio `status`, texto negrito de (11px), com padding do componente `date-status`.
- **States:** sem data, passada, hoje e futura têm texto explícito e plano tonal próprio. Conclusões reutilizam o verde e acrescentam um SVG de verificação.
- **Flow:** largura ajustada ao conteúdo, limitada à largura disponível; a etiqueta acompanha as datas completas do registro.

### Cards / Containers

As superfícies brancas agrupam informação sem criar uma pilha elevada.

- **Asset card:** borda fria, raio `surface` e padding do componente `asset-card`; no móvel, o espaço interno passa a (22px).
- **Information:** nome clicável, categoria, etiqueta de prazo e duas linhas de fatos. O rodapé fica após uma divisória, com contagem de arquivos e acesso à ficha.
- **States:** no hover do nome, o texto muda para rosa e recebe sublinhado. A ficha inteira não é um controle; os acessos são botões nomeados.
- **Panels:** dados, documentos e backup usam espaços internos de `panel`, reduzidos em larguras menores. O formulário de bem tem espaço interno de (32px) e largura máxima de (820px); o formulário de manutenção usa `panel` e máximo de (760px).

### Inputs / Fields

Rótulos visíveis antecedem campos brancos com contorno definido.

- **Style:** raio `field`, altura mínima de (42px), padding do componente `field` e borda de campo. Textarea admite redimensionamento vertical.
- **Focus:** borda rosa, cursor de edição no acento e contorno comum de teclado.
- **Placeholder:** cinza de apoio, com opacidade (1).
- **Error:** borda vermelha, plano levemente rosado e mensagem de (11px) logo abaixo; o campo recebe `aria-invalid` e relação com a mensagem.
- **Search:** ícone à esquerda dentro do campo; o texto começa após um recuo de (38px).

### Navigation

O cabeçalho escuro contém marca à esquerda e acesso ao código à direita. A navegação de trabalho usa botões sem fundo, com uma linha inferior transparente de (3px); o item com `aria-current="page"` recebe texto e linha rosa. O hover escurece o texto, e o foco usa o contorno comum. A área de bens permanece selecionada ao abrir uma ficha ou seu formulário.

### Records and Feedback

Documentos, cuidados e agenda usam linhas com divisórias, títulos claros, metadados menores e ações junto ao registro. Datas completas preservam a referência para conferência. A tarefa concluída continua visível com título em cinza e opacidade de (0,85), acompanhada da data efetiva.

Avisos e confirmações aparecem no fluxo da página, sobre fundos rosados e com bordas próprias. O estado de salvamento permanece textual junto à navegação; mensagens de operação também alimentam uma região de status. Estados vazios têm instrução e ação relacionada. A navegação entre áreas troca a superfície visível sem movimento ornamental. A preferência por movimento reduzido remove as transições.

## Do's and Don'ts

### Do:

- **Do** preservar Lato local e usar peso, tamanho e espaço para criar hierarquia.
- **Do** manter rótulos visíveis, placeholders legíveis e foco de teclado destacado.
- **Do** apresentar datas completas junto aos estados relativos e usar números tabulares nas áreas de conferência.
- **Do** conservar textos de estado, erro e confirmação próximos do contexto a que pertencem.
- **Do** adaptar grades, divisórias e grupos de ações à largura disponível.

### Don't:

- **Don't** usar rosa como fundo extenso das áreas de leitura.
- **Don't** elevar fichas com sombras ou deslocamentos no hover.
- **Don't** comunicar prazo, conclusão, erro ou salvamento apenas pela cor.
- **Don't** substituir rótulos de campo por placeholders ou ações textuais por ícones sem nome.
- **Don't** acrescentar animação ornamental às trocas de área ou de estado.
