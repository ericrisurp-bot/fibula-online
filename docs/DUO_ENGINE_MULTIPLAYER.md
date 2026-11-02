# Obsoleto — arquitetura Duo no mesmo motor

Este documento descrevia a proposta anterior de executar dois jogadores dentro do mesmo motor, com mundo compartilhado, snapshots/inputs e autoridade de host. Essa arquitetura foi abandonada e não deve orientar novas implementações.

O segundo jogador dentro do mesmo motor foi substituído pelo modelo **cada jogador no seu mundo**: cada dispositivo executa sua própria instância de `GameEngine`, e a dupla compartilha somente a coordenação mínima da sessão e dos ciclos de noite.

`PlayerRuntime` e `PlayerEntity`, introduzidos nas PRs #256 e #257, permanecem no código exatamente como estão. Não devem receber novas extensões para implementar o antigo modelo de dois jogadores no mesmo motor.

Não implementar a partir deste documento:
- segundo jogador dentro do mesmo GameEngine;
- mundo compartilhado ou host autoritativo;
- snapshots/inputs por Realtime;
- espectador ou transmissão do mapa de outro jogador.

A documentação vigente é **[DUO_COOP_PROTOCOL.md](./DUO_COOP_PROTOCOL.md)**. Ela define o modelo de mundos independentes, as responsabilidades planejadas de `DuoSession` e `DuoCycleSync`, as regras de horda, morte, queda, servidor, ranking e o plano incremental.

A D0 é somente documental. Este aviso não altera nem remove código.
