# Estratégia de testes

Compilação não comprova correção matemática.

## Protocolo
Testar JSON válido/inválido, camelCase, versão suportada/não suportada, requestId preservado, operação desconhecida, campos ausentes/desconhecidos e serialização de sucesso/erro.

## Estrutura
Testar IDs duplicados, referências inexistentes, valores não finitos, conectividade inválida, geometria degenerada e propriedades ausentes/incompatíveis.

## DOF map e montagem
Testar índices reversíveis, elementos compartilhando nós, ausência de rigidez artificial, soma de contribuições coincidentes, dimensões incompatíveis e simetria quando aplicável.

## Elementos
Cada formulação precisa de solução analítica ou benchmark confiável, geometria degenerada, orientação/conectividade, transformação local-global, equilíbrio e patch/convergência quando apropriado.

## Solver/análise
Testar solução conhecida, sistema singular, restrições insuficientes, deslocamento prescrito não nulo, reações, equilíbrio global e falha numérica sem falso sucesso.

## Tolerâncias
Cada teste declara grandeza, unidade, tolerância absoluta/relativa e justificativa. Não escolher tolerância universal sem considerar escala e condicionamento.

## Comandos
```bash
cargo fmt --check
cargo check
cargo test
```

Guardar fixtures JSON em `tests/fixtures/` e reutilizá-las para conferir compatibilidade com o front-end.
