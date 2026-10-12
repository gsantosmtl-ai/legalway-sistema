# Drive — onde cada leva parou

Caderno: `drive-metadados.json`. Os registros saem dele **uma vez só**, no fim,
com `montar-registros-drive.cjs`. Nenhuma leva escreve registros por conta.

O id de cada arquivo é `sha256('drive:' + pasta + '/' + nome)` cortado em 32.
Por isso reprocessar a mesma pasta não duplica nada: o id é o mesmo.

## Regra que nasceu da noite de 11/10

**Conferir antes de subir.** Na leva 2 eu reenviei 87 arquivos que já estavam no
banco porque não conferi primeiro. O teste é um HEAD em `/api/arquivos/<id>`,
espaçado 300 ms (o limite do servidor é 600 pedidos por minuto, por IP).

## Situação

| Leva | Pastas | Conteúdo no banco | No caderno |
|---|---|---|---|
| L01 | as 14 primeiras da ordem alfabética | sim | sim (refeita) |
| L02 | as 21 seguintes | 94 de 94 pequenos | sim |
| L03 a L10 | as 179 restantes | sim, menos os grandes | sim |

**A L01 foi refeita.** Ela tinha rodado antes de o caderno existir e as pastas
já haviam saído do disco. O conteúdo estava no banco, mas as referências nos
cards se perderam quando a L02 gravou registros por cima. Refazer custou só o
download: das 77 fatias conferidas, 76 já estavam no banco.

Fechou em **887 documentos, 214 pastas**.

## Arquivos grandes

O que passa de 9,8 MB não cabe na minha ponte de envio (10 MB por chamada).
Esses vão para `~/Desktop/DRIVE-GRANDES`. No fim, **um ⌘A** nessa pasta, na tela
Restaurar, sobe todos de uma vez — o limite do servidor por pedido é 500 MB e
cada arquivo vai sozinho.

## Por leva

1. Selecionar as pastas no Drive, Baixar (o Google compacta e manda o zip)
2. `ditto -x -k --sequesterRsrc <zip> ~/drive-legalway`  — `unzip` estraga acento
3. `node importar-drive.cjs --pasta ~/drive-legalway --base estado-atual.json --gravar --rotulo Lnn --fatias N`
4. Conferir no banco o que já existe; subir só o que falta
5. Mover as fatias grandes para `~/Desktop/DRIVE-GRANDES`
6. Apagar as pastas extraídas e o zip

No fim de tudo: `node montar-registros-drive.cjs --base estado-atual.json --gravar`
e subir `drive-registros.json`.
