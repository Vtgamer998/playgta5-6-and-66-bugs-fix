# GTA Mobile Pack

🌐 **[🇺🇸 Read in English](README.en.md)**

Extensão de navegador (Manifest V3) para jogar **GTA V** no celular Android. Ela reúne três coisas em um único pacote:

| Módulo | Arquivo | O que faz |
|---|---|---|
| Console na tela | `debug-console.js` | Botão 🐞 que mostra e copia o log do navegador sem precisar de DevTools |
| Correções de compatibilidade | `gta-memory64-fix.js` | Corrige `WebAssembly.Memory`, workers, texturas BC e shaders com `clip_distances` |
| Controle virtual | `virtual-gamepad.js` | Gamepad estilo Xbox na tela, com layout editável |

> **Aviso:** projeto não oficial, sem relação com a Rockstar Games nem com a Take-Two. O pack não inclui nenhum arquivo do jogo. Ele só altera o comportamento do navegador na página.

---

## Requisitos

- Android com um navegador que aceite extensões, como **Kiwi Browser** ou Chromium com suporte a extensões.
- Navegador com **WebGPU** e **WebAssembly Memory64** habilitados.
- Bastante memória livre. O jogo usa cerca de 2,2 GB de memória do WebAssembly, então feche as outras abas e os apps em segundo plano.

---

## Instalação

1. Baixe o `.zip` da página de [Releases](../../releases) (ou use **Code → Download ZIP**).
2. Extraia a pasta `gta-mobile-pack`.
3. No navegador, abra `chrome://extensions` (ou `kiwi://extensions`).
4. Ative o **Modo do desenvolvedor**.
5. Toque em **Carregar sem compactação** (*Load unpacked*) e escolha a pasta extraída.
6. Abra a página do jogo e recarregue.

> Sempre que atualizar os arquivos, toque em **recarregar** na extensão e depois recarregue a página do jogo.

---

## Como usar

### Console na tela (🐞)

O botão 🐞 aparece no canto da tela. Ao tocar nele, abre o painel de log:

- **Copiar**: copia todo o log para a área de transferência, para você colar em uma issue ou conversa.
- **So erros**: alterna entre ver tudo e ver só os erros.
- **Limpar**: apaga o log da tela.
- **Fechar**: fecha o painel.

O console guarda as últimas 600 linhas e também captura erros de workers e promessas rejeitadas.

### Controle virtual

Gamepad no padrão *Standard Gamepad* (Xbox) com sticks analógicos, direcional, A/B/X/Y, LB/RB, LT/RT, L3/R3, Back/Start e botão central. Os botões do topo são:

- 🎮 mostrar ou ocultar o controle;
- ⚙️ abrir as configurações;
- ⛶ tela cheia.

Nas configurações você pode ajustar:

- **Opacidade** do controle;
- **Tamanho geral**;
- **Teclado virtual** (modo de teclas na tela);
- **Ocultar teclado do Android** enquanto o controle estiver ativo;
- **Tela cheia automática** no primeiro toque;
- **Editar posições**: arraste cada botão para onde quiser. **Restaurar posições** volta ao layout padrão.

As configurações ficam salvas no `localStorage` do site.

### Correções de compatibilidade

Funcionam sozinhas, sem precisar de ação. O que elas fazem:

1. **Memory64:** se o navegador exigir `BigInt` ou `Number` nos limites da memória, o pack converte. Se o navegador já suporta nativamente, não altera nada.
2. **Workers:** reinjeta a correção em cada Worker, inclusive os aninhados, e ajusta a URL base de scripts e `fetch` dentro de workers `blob:`.
3. **Texturas BC (opcional):** GPUs sem `texture-compression-bc` (por exemplo, Mali) usam um formato descomprimido. As texturas ficam vazias, o que serve para o jogo passar do carregamento.
4. **`clip_distances`:** se a GPU não tem a feature `clip-distances`, o pack pede a feature quando existe, ou remove `clip_distances` dos shaders WGSL (sem planos de recorte do usuário). Isso evita pipelines inválidos.

---

## Configuração

No topo do `gta-memory64-fix.js` existe o objeto `CFG`:

| Opção | Padrão | Descrição |
|---|---|---|
| `MAX_PAGES_CAP` | `65536` | Limite do `maximum` da memória, em páginas de 64 KiB (65536 = 4 GiB). `0` desativa o limite. |
| `BC_FALLBACK` | `true` | Ativa o fallback de texturas BC. |
| `CLIP_FALLBACK` | `true` | Ativa o tratamento de `clip_distances`. |
| `BC_TINY` | `true` | Texturas BC viram 4×4 sem mipmaps, economizando bastante memória. |
| `LOG_GROW` | `true` | Registra cada `memory.grow` (e falhas) no console. |
| `FORCE` | `false` | Aplica o patch de memória mesmo que o navegador já suporte. |
| `DEBUG` | `true` | Mostra os logs `[GTA Fix:...]`. |

---

## Problemas comuns

**`memory access out of bounds - this looks like a lack of memory`**
O jogo usou quase toda a memória disponível (a arena fica em torno de 2,2 GB). Feche as outras abas, reinicie o navegador antes de jogar e reduza textura e densidade de tráfego e pedestres nas configurações do jogo.

**Erros `clip_distances` ou `structure constructor has too many inputs`**
Confira se a extensão está ativa e se aparecem linhas `[GTA Fix:worker]` no console. Se não aparecerem, a extensão não foi injetada: recarregue a extensão e a página. Se aparecer `Sobrou clip_distances em ...`, abra uma issue com essa linha.

**O fix some depois de recarregar**
Ative **Preserve log** no DevTools para não perder as linhas do pack ao recarregar. Veja se aparece `Worker #N interceptado` ou `inline NAO patchado`.

**Warnings que não são do pack e podem ser ignorados:** `Texture ... not found`, `... doesn't exist`, avisos do parser (`pausemenu.xml`, `defaulttasks.ymt.pso`), arquivos de áudio ausentes e `NetworkAssertf FAILED` (multiplayer).

---

## Como reportar um bug

Abra uma issue contendo:

1. Modelo do aparelho, GPU (se souber), versão do Android e do navegador.
2. Versão do pack (campo `version` do `manifest.json`).
3. O log copiado pelo botão 🐞, principalmente as linhas `[GTA Fix:...]` e os erros logo antes da falha.
4. O que você estava fazendo quando travou.

---

## Estrutura

```
gta-mobile-pack/
├── manifest.json          # Configuração da extensão (MV3)
├── debug-console.js       # Console 🐞 na tela
├── gta-memory64-fix.js    # Correções de Memory64, workers, texturas BC e clip_distances
└── virtual-gamepad.js     # Controle virtual
```

Os scripts rodam no *MAIN world* com `run_at: document_start`, ou seja, antes de qualquer script da página. O console e as correções valem só para o site do jogo (veja `matches` no `manifest.json`). O controle virtual está configurado para todas as páginas (`<all_urls>`); se quiser restringir, edite `matches` no `manifest.json`.

---

## Limitações conhecidas

- O jogo tem um limite de memória interno que o pack não consegue aumentar.
- Sem `texture-compression-bc`, as texturas ficam vazias.
- Sem `clip-distances`, alguns efeitos de recorte (vidro, nuvens, partículas) podem ficar levemente diferentes.
- O comportamento depende do navegador e da GPU. Nem todo aparelho vai rodar.

---

## Licença

Defina a licença do seu repositório (por exemplo, MIT) adicionando um arquivo `LICENSE`.
