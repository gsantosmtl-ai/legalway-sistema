# Subir anexos do Trello para dentro do sistema

Procedimento usado em 19/10/2026 para levar 180 anexos (113 MB) de 12 cartões
para os processos. Escrito porque a rotina noturna vai repetir isso e porque
cada limite aqui custou uma tentativa perdida.

## Os três limites que mandam

**O campo de arquivo aceita 10 MB por envio.** É limite da ponte do navegador,
não do sistema. Em base64 o conteúdo cresce 33%, então o lote tem de fechar em
**6,6 MB brutos** para caber nos ~8,8 MB que saem do outro lado.

**Não existe rota de upload avulso.** O `arquivos.js` só tem `GET /arquivos/:id`.
Arquivo entra de duas formas: embutido como `data:` dentro de um bloco, ou no
array `arquivos` de um backup restaurado. A segunda é melhor — o bloco não
precisa viajar junto em cada lote.

**A CSP do sistema é `connect-src 'self'`.** A página não busca nada de fora,
nem de `localhost`. Então o conteúdo tem de passar por disco: baixa do Trello
numa aba, sobe pelo campo de arquivo na outra. Não enfraquecer a CSP para
encurtar isso.

## O caminho

1. Na aba do Trello, listar os anexos dos cartões que viraram processo:
   `GET /1/cards/<id>/attachments?fields=name,url,bytes,mimeType,date`.
   A URL do anexo baixa com a própria sessão.

2. Empacotar por **first-fit decreasing** com teto de 6,6 MB. Empacotar na
   ordem natural desperdiça: a primeira tentativa deu 23 lotes com um arquivo
   cada; o first-fit deu 18 lotes quase todos cheios.

3. Cada lote vira um `legalway-backup-v1` só com `arquivos`:
   `{id, nome, tipo, tamanho, conteudo: <base64 puro>, criado_por}`.
   O `conteudo` é base64 **sem** o prefixo `data:` — é o que o restore espera.

4. **Id determinístico:** `sha256('trello:' + cartaoId + '/' + nome)` nos
   primeiros 32 caracteres. O restore usa `ON CONFLICT (id) DO NOTHING`, então
   reenviar um lote é inofensivo — e foi preciso, porque um lote não confirmou
   e só se percebeu pela contagem.

   Cuidado: dois anexos de mesmo nome no mesmo cartão colidem. Em 19/10 foram
   três casos, todos o mesmo arquivo anexado duas vezes, então perder a cópia
   era o certo. Se um dia forem arquivos diferentes, a chave precisa do tamanho.

5. Depois de todos os lotes, ligar: montar o bloco de processos com o array
   `anexos` preenchido (`url`, `nome`, `tipo`, `origem`, `quando`, `tamanho`,
   `arquivoId`) e restaurar. Até esse passo os arquivos existem no banco mas
   nenhum processo aponta para eles.

## Conferir sempre

Contar `arquivos` antes e depois de cada lote. Em 19/10 a conta acusou +16
quando devia dar +19 — um lote tinha falhado silenciosamente, e só a contagem
mostrou.

No fim, procurar anexo apontando para arquivo inexistente. Os **79 órfãos** que
aparecem são anteriores, da migração do Drive de 11/10 (origem `Drive`), e não
têm relação com o Trello — ver [[railway-disco-do-banco]].

## O que não passa por aqui

Quatro anexos excedem o lote inteiro e precisam de outro caminho:

| Arquivo | Tamanho |
|---|---|
| HISTORICO DE CONTATO COM A LEGACY — Darcione | 37,4 MB |
| Provas e fotos.docx | 8,1 MB |
| Declaração Evandro Selleri.pdf | 7,7 MB |
| EVIDENCIAS | 7,5 MB |

O sistema aceita até 40 MB por arquivo, então o problema é só a ponte do
navegador. O caminho natural é a pasta do Drive desses clientes, pelo
`importar-drive.cjs`, que não tem esse limite.
