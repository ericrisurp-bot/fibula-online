# P7 — limites de frequência das proficiências

**Escopo:** proteção por conta, aplicada exclusivamente no servidor. A RPC usa o relógio do PostgreSQL; nenhum timestamp enviado pelo dispositivo participa do cálculo.

## Limites iniciais por chave

Cada chave tem uma janela móvel de 60 segundos, compartilhada por todos os dispositivos da mesma conta.

| Proficiência | Teto / 60 s | Base de calibração |
|---|---:|---|
| espada, arco, cajado, bastao_natureza | 1.200 acertos | teto alto para ataques rápidos, múltiplos alvos e explosões |
| golpes_recebidos | 600 impactos | margem para vários inimigos atacando em sequência |
| machado_madeira, picareta, faca_esfolar, foice_mao | 240 ações | 4 ações/s, acima da cadência normal de ações concluídas |
| vara_pesca | 12 puxadas | intervalo configurado de 8,5 s equivale a cerca de 7,1 puxadas/min |
| carroca_distancia | 18.000 unidades | 300 unidades/s, acima da velocidade configurada de 260 |

Esses tetos são limites de segurança deliberadamente generosos, não metas de gameplay nem valores de progressão. Devem ser revistos se mudanças legítimas na cadência do motor os aproximarem.

## Comportamento

1. A RPC valida conta, emissor Arena, lote, catálogo ativo e idempotência como antes.
2. Um lock transacional por conta serializa envios simultâneos de dispositivos diferentes.
3. O servidor calcula o saldo disponível por chave usando uma janela móvel de 60 segundos e o relógio do banco.
4. Se apenas parte do lote couber no saldo, aplica somente essa parte e grava no recibo o mapa exato `applied_deltas`.
5. O cliente confirma localmente apenas os valores aceitos e cria outro ID de lote para o restante. Os contadores locais não confirmados permanecem na fila IndexedDB.
6. Se nada puder ser aplicado, a RPC retorna `rate_limited` e `retry_after_seconds`, sem criar recibo. O cliente aguarda e reenvia o mesmo lote.
7. Repetir um lote já recebido retorna exatamente os valores aplicados no primeiro processamento, sem somar novamente.

## Limitações conhecidas

- Como o mundo é offline/local, a RPC não prova criptograficamente que cada evento ocorreu. O rate limit dificulta inflação acelerada e abuso de sincronização, mas não substitui validação de gameplay autoritativa.
- O limite por conta não diferencia Solo/Duo nem dispositivos; isso impede que alternar dispositivos contorne a janela.
- O progresso excedente não é descartado: ele permanece pendente e é drenado gradualmente conforme o servidor libera capacidade.
- Recibos antigos sem `applied_deltas` representam lotes integralmente aplicados antes da P7 e continuam sendo reconhecidos como completos.

## Verificações necessárias antes do merge

- Aplicar a migration no ambiente de preview/projeto autorizado e testar limites, expiração da janela e duas chamadas concorrentes.
- Simular perda de resposta depois da aplicação parcial e confirmar que o retry não duplica.
- Testar fila offline grande, incluindo troca de conta e reconexão.
- Confirmar que os limites não bloqueiam sessões legítimas longas em Solo e Duo.
