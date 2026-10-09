# Instruções do Copilot

Leia o `README.md` e os documentos em `docs/` antes de implementar funcionalidades.

## Regras obrigatórias

- Use **TypeScript + Svelte + Vite** no front-end. A aplicação final será desktop via **Tauri**, com backend Rust.
- Trabalhe somente na etapa solicitada em `docs/ROADMAP.md`. Não tente implementar toda a aplicação de uma vez.
- Antes de alterar arquivos, informe brevemente quais arquivos pretende criar/alterar e por quê.
- Prefira componentes pequenos, com responsabilidades claras. Separe componentes visuais, estado/serviços, domínio, viewport 3D, logging e integração.
- Ative TypeScript estrito. Evite `any`; se precisar representar algo ainda indefinido, use `unknown` e valide explicitamente.
- Não invente os modelos definitivos da estrutura, dos elementos, dos materiais, das seções ou dos resultados. Use tipos provisórios isolados em `src/lib/domain/` e marque-os como provisórios até o usuário fornecer os contratos.
- Não implementar cálculo estrutural/solver no navegador. O front-end modela, valida o básico de interface e apresenta dados; o backend Rust será responsável pela análise.
- A integração com Tauri deve ficar atrás de uma interface/serviço, nunca espalhada por componentes. Enquanto o backend não existir, use uma implementação simulada claramente identificada.
- Nunca fingir que uma análise, importação ou gravação foi concluída. Diferencie estados `idle`, `running`, `success` e `error` quando aplicável.
- Valide resultados recebidos antes de exibi-los. No mínimo, conferir se a quantidade de nós dos resultados corresponde à quantidade de nós do modelo; trate também arquivos inválidos, dados ausentes e erros de leitura.
- Centralize o logging e use níveis `debug`, `info`, `warn` e `error`. Logs devem incluir contexto útil e não conter dumps enormes de matrizes ou dados sensíveis.
- Para operações importantes, registre início, conclusão e falha. Não duplique a mesma mensagem em vários níveis.
- Use nomes de variáveis e funções claros. Comentários devem explicar decisões ou restrições, não narrar código óbvio.
- Acessibilidade básica: botões com rótulos claros, foco de teclado visível, controles identificáveis e mensagens de erro compreensíveis.
- Não adicionar dependências sem necessidade. Para viewport 3D, avalie uma biblioteca apropriada e explique a escolha antes de introduzi-la.
- Não apagar ou substituir arquivos existentes sem explicar a necessidade.
- Ao concluir uma etapa, informe: arquivos alterados, como executar, como testar e limitações conhecidas.

## Logging

Use a API central definida em `docs/LOGGING.md`. Evite `console.log` diretamente em componentes; exceções temporárias devem ser justificadas e removidas antes de concluir a etapa.

## Escopo visual inicial

A interface deve acomodar:
- árvore/painel do modelo;
- ferramentas para nós, elementos, malha, materiais, seções, cargas e apoios;
- viewport 3D com navegação, vistas predefinidas, grid configurável e snap-to-grid;
- painel de propriedades/contexto;
- análise e importação de resultados em etapas futuras;
- painel de logs/diagnósticos.

## Ao encontrar ambiguidades

Não faça suposições silenciosas sobre regras de engenharia ou contratos de dados. Isole a decisão, registre a dúvida e peça esclarecimento quando a ambiguidade impedir uma implementação correta.
