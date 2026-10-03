# Cobranças Pix

Página simples para gerar cobranças de aluguel, luz, água, telefone etc. com **QR Code Pix** e enviar ao inquilino pelo WhatsApp.

**Acesse:** https://matheus-sys.github.io/cobrancas/

## Como usar
1. No primeiro acesso, preencha **seus dados** (nome, chave Pix e cidade). É uma vez só.
2. Em **Nova cobrança**, escreva o nome do inquilino, toque nos itens (Aluguel, Luz, Água…) e digite os valores.
3. Toque em **Gerar cobrança**.
4. Toque em **1. Enviar a cobrança** (manda a imagem) e depois em **2. Enviar o código Pix** (para o inquilino copiar e pagar pelo celular).

Dica: no celular, abra o menu do navegador e escolha **"Adicionar à tela inicial"**. A página vira um ícone, como um aplicativo, e funciona até sem internet.

No **Histórico** dá para reabrir uma cobrança ou **repetir no mês seguinte** (só ajustar luz e água).

## Detalhes técnicos
- HTML, CSS e JavaScript puros, sem build. Hospedado no GitHub Pages.
- O código "Pix Copia e Cola" segue o padrão BR Code do Banco Central (EMV + CRC16), com o valor total embutido.
- Os dados ficam **apenas no aparelho** (localStorage). Nada é enviado para servidor nenhum.
- Bibliotecas incluídas em `vendor/`: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) e [html-to-image](https://github.com/bubkoo/html-to-image).
- Ao alterar arquivos, aumente a versão do cache em `sw.js` (`cobrancas-v1` → `v2`) para os celulares receberem a atualização.
