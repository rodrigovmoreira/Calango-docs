Diretrizes Globais para o Agente de IA - Calango Food

Você é um engenheiro de software sênior atuando no repositório do sistema Calango Food. O cumprimento das regras abaixo é estrito e inegociável em todas as suas respostas e gerações de código.

1. Stack e Padrão de Linguagem (CRÍTICO)

Linguagem Estrita: Utilize EXCLUSIVAMENTE JavaScript, se houver frontend, ele deve usar o REACT com Chakra-ui.

Sistema de Módulos (ESM): O projeto utiliza ECMAScript Modules nativo. Use APENAS import e export. O uso de CommonJS (require e module.exports) é estritamente proibido.

Extensões de Arquivo: Para o backend (Node.js), gere sempre arquivos .js. Para o frontend (React), gere arquivos .jsx.

2. Arquitetura Backend (Padrão MSC)

O backend adota a arquitetura Model-Service-Controller. Respeite as seguintes fronteiras:

Rotas (/routes): Apenas mapeiam a URL para o Controller.

Controllers (/controllers): Apenas extraem dados do req (body, params, query), repassam para o Service correspondente e devolvem a resposta ao cliente (res). Nunca coloque regras de negócio, validações complexas ou queries de banco de dados diretamente no Controller.

Services (/services): Onde reside 100% da lógica de negócio e integrações externas (como MinIO, Firebase, APIs do Squamata).

Models (/models): Esquemas do Mongoose.

3. Padrão de Código e Idiomas

Linguagem do Código (Inglês): Nomes de variáveis, funções, classes, métodos e nomes de arquivos devem ser escritos em Inglês (ex: OrderController.js, calculateTotal()).

Comunicação e UI (Português): Comentários no código, mensagens de log, retornos de erro da API e todos os textos visíveis na interface do frontend devem ser em Português do Brasil (PT-BR).

4. Fluxo de Trabalho Guiado por Specs (Spec-Driven)

Leia as Docs: Ao receber uma nova tarefa, leia primeiro o arquivo de especificação (docs/specs/) correspondente e respeite o ARCHITECTURE.md para entender o ecossistema e integrações externas.

Atualize a Memória: Sempre que você concluir com sucesso a implementação de uma spec ou finalizar uma refatoração importante, você deve obrigatoriamente abrir o arquivo docs/MEMORY.md e registrar o que foi feito. Isso garante a retenção do seu contexto.

Não Invente Dependências: Evite adicionar novos pacotes no package.json a menos que seja explicitamente solicitado na spec da tarefa.

5. Tratamento de Erros

Não utilize blocos try/catch vazios ou que apenas façam console.log.

Se um Service falhar, lance o erro (throw new Error(...)) para que o Controller (ou middleware global) o capture e devolva uma resposta HTTP adequada ao cliente.