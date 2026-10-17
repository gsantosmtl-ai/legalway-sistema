// Leitor de CSV que respeita aspas e quebra de linha dentro do campo.
// Contar linha com split('\n') erra em endereço com quebra e em pedido com
// mais de um item — foi o que quase entrou no inventário.
function lerCsv(texto, sep) {
  texto = texto.replace(/^﻿/, '');
  if (!sep) { const l1 = texto.slice(0, 2000); sep = (l1.split(';').length > l1.split(',').length) ? ';' : ','; }
  const linhas = []; let campo = '', linha = [], dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) {
      if (c === '"') { if (texto[i+1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const cab = linhas.shift() || [];
  return { separador: sep, colunas: cab, linhas: linhas.filter(l => l.some(x => String(x).trim())),
           registros: linhas.filter(l => l.some(x => String(x).trim())).map(l => Object.fromEntries(cab.map((c,i) => [c.trim(), l[i]]))) };
}
module.exports = { lerCsv };
