# Contribuir com o Garantia Aberta

Relatos de problemas, melhorias de documentação e propostas de código são bem-vindos no [repositório](https://github.com/martinlofranodeoliveira/garantia-aberta). Use dados fictícios em exemplos, testes e capturas. Para vulnerabilidades ou exposição de dados, consulte [SECURITY.md](SECURITY.md) antes de abrir uma issue pública.

## Preparar o ambiente

Use Node.js 22 ou superior e npm:

```sh
npm ci
npm run dev
```

O aplicativo será servido em [http://127.0.0.1:4175](http://127.0.0.1:4175). O servidor usa `dist/`; refaça o build após editar os arquivos e recarregue a página.

Antes de enviar a mudança:

```sh
npm test
npm run build
npm run check
```

Para conferir o resultado montado, execute `npm run preview` sem outro servidor ocupando a porta 4175. Descreva no pull request o problema, o comportamento obtido e como o verificou. Inclua capturas com dados fictícios quando a mudança alterar a interface.

## O que preservar

- O núcleo de `src/domain.mjs` não usa relógio, geração de IDs ou I/O. Recebe datas e identificadores explicitamente e devolve novos valores validados.
- Mantenha o esquema fechado, os limites documentados e a validação de anexos antes de oferecer a confirmação de restauração. Mudanças de formato precisam tratar a versão e a compatibilidade de backups de forma explícita.
- Compare a revisão e grave no mesmo `readwrite` transaction do IndexedDB. Uma escrita só deve ser anunciada como salva depois do commit. A limpeza mantém revisão crescente para impedir o reaproveitamento de uma revisão antiga.
- Falhas de persistência e conflitos precisam aparecer na interface; a versão em memória deve continuar disponível para backup. Não esconda a falha anunciando sucesso de salvamento.
- Preserve o fluxo sem conta e sem envio de inventário a terceiros. Novas dependências de execução ou serviços externos exigem uma proposta que explique a necessidade e o impacto no uso local.
- Trate textos cadastrados como texto, sem interpretá-los como HTML. Arquivos anexados são disponibilizados por download, sem prévia incorporada.
- Use linguagem de prazo informado pelo usuário. O projeto não deduz garantia legal ou contratual, não autentica comprovantes e não promete notificações em segundo plano.

## Escolher a verificação

Adicione ou ajuste testes quando mudar regras de negócio, parsing, integridade, restauração, persistência ou comportamento relevante da interface. Os testes devem demonstrar o problema e o resultado esperado, incluindo falhas quando fizer sentido. Para correções pequenas de texto ou estilo, uma inspeção do resultado pode ser suficiente.

Confira a interface em largura estreita e ampla, navegação por teclado, mensagens de erro, retorno de foco e estados vazios quando a mudança tocar esses fluxos. Ao alterar datas ou a agenda, forneça uma data fixa nos testes para que o resultado não dependa do dia de execução.

O escopo do produto está em [PRODUCT.md](PRODUCT.md). O [contrato das APIs](docs/API-CONTRACT.md) e a [documentação do formato](docs/FORMATO.md) devem acompanhar mudanças que os afetem.

## Licenciamento

Ao propor uma contribuição, declare qualquer material de terceiros introduzido e sua licença. Contribuições destinadas ao código e à documentação deste projeto são oferecidas sob a licença MIT do repositório. Preserve os avisos existentes; fontes e demais materiais de terceiros mantêm suas próprias licenças em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
