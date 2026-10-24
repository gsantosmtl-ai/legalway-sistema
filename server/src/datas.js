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
export function hojeNoFuso(tz = FUSO_ESCRITORIO, quando = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(quando);
}
