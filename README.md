# Fíbula Online

RPG 2D de sobrevivência em ondas, feito com React, Vite, TypeScript e Canvas 2D. O mapa reúne combate, coleta de recursos e crescimento natural da vegetação.

## Requisitos
- Node.js 20 ou superior
- npm

## Como rodar
```bash
npm install
npm run dev
```
Abra o endereço local informado pelo Vite.

## Controles
- PC: WASD ou setas para mover; C alterna a câmera; 1, 2 e 3 trocam a arma de teste.
- Celular: D-pad na tela para mover; botões para alternar câmera e arma.
- Mouse/toque: botões da interface.

## Sistema de árvores
- A partida começa com 20 árvores espalhadas pelo mapa.
- A cada 15 segundos, o sistema tenta gerar até 3 árvores.
- O limite é de 150 árvores vivas no mapa.
- A atração entre árvores favorece a formação de bosques; quanto maior a concentração local, maior a chance de novos nascimentos perto dela.
- Um núcleo com 25 árvores próximas deixa de atrair novas árvores. Outros locais válidos do mapa continuam podendo crescer.

## Como rodar
O jogo pode ser executado localmente com Node.js 20 ou superior e npm. Use `npm install` e depois `npm run dev`.
