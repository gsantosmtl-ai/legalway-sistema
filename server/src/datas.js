// "Hoje" é o dia DO ESCRITÓRIO, não o do relógio UTC do servidor.
//
// Por que isto existe: cada arquivo tinha o seu `new Date().toISOString()`, que
// devolve a data em UTC. Orlando está 4 horas atrás, então a partir das 20h o
// servidor já virava o dia — e a rotina que marca atraso passava a tratar como
// vencida toda parcela que vence HOJE. Toda noite, 21 parcelas e US$ 7.346
// entravam na inadimplência; de manhã saíam sozinhas.
//
// Para quem recebe cobrança isso não é detalhe: a pessoa tem até o fim do dia
// para pagar, e às 20h já aparecia na lista de inadimplentes do escritório.
//
// 'en-CA' é o truque para o Intl devolver AAAA-MM-DD, que é o formato que o
// sistema inteiro usa para comparar datas como texto.
export const FUSO_ESCRITORIO = process.env.FUSO_ESCRITORIO || 'America/New_York';

// `quando` existe para quem já tem o instante em mãos — tipicamente um teste,
// ou um cálculo que precisa ser determinístico. Sem ele a função lia o relógio
// por dentro, e aí quem recebia "agora" como argumento ainda assim dependia do
// dia de verdade: um teste escrito ontem passava ontem e quebrava hoje.
// Ler uma data que pode vir pura ("2026-10-20") ou com hora.
//
// `new Date("2026-10-20")` é meia-noite UTC — que em Orlando é o DIA ANTERIOR
// às 20h. Dezesseis horas de diferença, e isso muda resposta:
//
//  · a rede de segurança que reconcilia contratos dos últimos 7 dias passava a
//    tratar "assinado há 7 dias" como "7 dias e 16 horas", e o contrato ficava
//    de fora em silêncio;
//  · o popup de "contrato assinado" tem janela de 45 minutos, e nenhum
//    contrato com data pura caía dentro dela.
//
// Data pura vira MEIO-DIA. Não é o instante exato — ninguém o tem —, é a hora
// que não escorrega para o dia vizinho em nenhum fuso que o escritório use.
// O jeito certo já existia em três telas (`+ 'T12:00:00'`); aqui no servidor
// ninguém tinha feito.
export function instanteDe(valor) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function hojeNoFuso(tz = FUSO_ESCRITORIO, quando = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(quando);
}
