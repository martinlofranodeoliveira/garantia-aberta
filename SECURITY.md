# Segurança e dados locais

## Relatar um problema

Para comunicar uma vulnerabilidade, procure o canal privado de contato indicado no [site da LOFRANO TECNOLOGIA](https://lofranotecnologia.com.br). Se o repositório oferecer relato privado na área **Security**, esse canal também pode ser usado. Não publique inventários, backups, notas fiscais, números de série ou documentos pessoais em issues, pull requests ou capturas.

Inclua a versão ou commit afetado, navegador e sistema, passos reproduzíveis com dados fictícios, impacto observado e uma reprodução mínima. Uma descrição inicial sem dados pessoais é suficiente para iniciar a investigação. Não há prazo de resposta ou serviço de suporte garantido. Correções são concentradas no código atual; versões antigas não têm uma política de manutenção separada.

## Modelo de uso

O Garantia Aberta é uma aplicação estática que processa o inventário no navegador. Não possui conta, backend de negócio, sincronização em nuvem ou armazenamento remoto de anexos. As fontes são locais e a política de conteúdo da página bloqueia conexões iniciadas pelos scripts. O provedor de hospedagem continua recebendo as requisições necessárias para servir o site, e links externos levam a outros sites.

O inventário começa em memória. O usuário pode optar por gravá-lo em IndexedDB. O salvamento compara e atualiza a revisão na mesma transação, resolvendo sucesso apenas após o commit. Uma limpeza preserva a revisão por meio de um registro vazio, impedindo que uma revisão antiga seja aceita depois de apagar e recriar dados. Essas medidas tratam conflitos e falhas de gravação; não são controle de acesso.

Os dados em memória, IndexedDB, JSON e CSV não são criptografados pelo aplicativo. Pessoas com acesso ao perfil de navegador e código de outros aplicativos da mesma origem podem acessá-los. Em hospedagens como GitHub Pages, diretórios diferentes sob o mesmo domínio de usuário compartilham a origem. Use uma origem dedicada e controle o acesso ao dispositivo quando isso for necessário para seus dados.

Políticas de armazenamento do navegador, exclusão do perfil, navegação privada e ações do usuário podem remover dados locais. Guarde backups fora do navegador e confira se consegue restaurá-los. Quando o aplicativo indicar uma falha de persistência, a versão em memória pode ser exportada antes de fechar ou recarregar a aba. Um formulário ainda não salvo não faz parte do inventário exportado.

## Limites das verificações

As entradas usam um esquema fechado, limites de tamanho e validação de datas e identificadores. O importador JSON recusa campos ausentes ou desconhecidos, chaves duplicadas, profundidade excessiva e arquivos acima de 20 MiB. Antes da confirmação de substituição, também verifica Base64 canônico, tamanho real, assinatura básica do tipo e SHA256 dos anexos.

O hash registrado em cada anexo detecta divergência entre os bytes e o hash fornecido. Ele não autentica o remetente nem o documento: alguém que modifica os bytes também pode calcular um novo hash. Não há assinatura digital do backup, auditoria completa de PNG/JPEG/PDF, antivírus, OCR ou avaliação da validade de um comprovante.

Os anexos são oferecidos por download, sem incorporação no documento da aplicação. O programa usado para abrir o arquivo baixado tem seu próprio modelo de segurança. Trabalhe com arquivos de procedência conhecida.

O CSV protege células com prefixos reconhecidos como fórmulas, mas é uma exportação de consulta e seu tratamento final depende da planilha usada. Evite compartilhar backups ou CSVs sem antes conferir os dados que eles contêm.

## Ao modificar ou hospedar uma cópia

Preserve a política de conteúdo, o tratamento de entradas como texto e a validação completa antes da restauração. Sirva a aplicação por HTTPS ou em um servidor local compatível com as APIs do navegador. Não inclua segredos, chaves ou documentos reais no repositório ou no build. Reavalie o modelo de segurança se adicionar scripts de terceiros, serviços remotos, incorporação de arquivos ou outros aplicativos na mesma origem.
