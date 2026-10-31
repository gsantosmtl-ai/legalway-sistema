// Comportamentos comuns a todas as telas (fase 2): menu no celular, indicador de carregando, confirmação padrão.
// Carregado depois de storage.js. Não mexe na lógica de cada tela — só adiciona por cima.
(function(){
  // ---- CSS injetado (evita editar 17 arquivos) ----
  const css = `
    .lw-menu-btn{ display:none; position:fixed; left:12px; top:10px; z-index:1200; width:42px; height:42px; border-radius:10px; border:none;
      background:#16204F; color:#fff; font-size:20px; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); }
    .lw-menu-fundo{ display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1100; }
    @media (max-width:820px){
      .lw-menu-btn{ display:flex; align-items:center; justify-content:center; }
      body.lw-menu-aberto .sidebar{ display:flex !important; position:fixed !important; left:0; top:0; height:100vh !important; z-index:1150; width:min(280px, 85vw) !important; overflow-y:auto; box-shadow:0 0 30px rgba(0,0,0,.4); }
      body.lw-menu-aberto .lw-menu-fundo{ display:block; }
      body{ padding-top:0; }
      .topbar, .topbar2{ padding-left:64px !important; }

    }

    /* ====================================================================
       REGRAS DE CELULAR — presas a uma CLASSE, não ao @media.

       Por quê: quando a página estoura, o Chrome do celular ESTICA a janela
       para caber o conteudo. Numa tela de 390px, a Agenda reportava
       innerWidth de 933 — e aí o @media de max-width:820px deixa de valer
       justamente onde mais precisa. Vira um laço: estoura, a regra não
       aplica, continua estourando.

       A classe e posta por JS a partir de screen.width, que e o aparelho e
       não estica. O @media continua valendo para o menu, que já funcionava.
    ==================================================================== */
    html.lw-celular .sidebar{ display:none; }
    html.lw-celular body.lw-menu-aberto .sidebar{ display:flex !important; }
    html.lw-celular .main{ width:100%; max-width:100%; min-width:0; }

    /* Coluna lateral de largura fixa vira linha de baixo. "1fr 300px" numa
       tela de 390 dava 1.582px de página em Contratos. */
    html.lw-celular .content-cols,
    html.lw-celular .resumo-cols{ grid-template-columns:1fr !important; }
    html.lw-celular .side-panel,
    html.lw-celular .painel-lateral{ width:auto !important; max-width:100% !important; }

    /* Faixa de indicadores. Quatro colunas numa tela de 375 dão 107px cada e
       o número sai pela direita — medido em Clientes, sobrando 161px.
       Algumas telas resolviam isso num @media de 820px, que é exatamente o
       que deixa de valer quando a página estica. Aqui vale sempre. */
    html.lw-celular .kpi-strip,
    html.lw-celular .kpi-strip2{ grid-template-columns:repeat(2,1fr) !important; }

    /* Janela e gaveta cabem na tela. */
    html.lw-celular .modal{ max-width:calc(100vw - 20px) !important; }
    html.lw-celular .drawer{ max-width:100vw !important; }

    /* Topo quebra linha em vez de esticar. */
    html.lw-celular .topbar,
    html.lw-celular .topbar2,
    html.lw-celular .topbar-right{ flex-wrap:wrap; }

    /* Alvo de toque: 44px é o confortável, 40 é o que cabe sem desmontar o
       que já existe. Antes, 34 dos 37 botões do Funil eram menores. */
    html.lw-celular button,
    html.lw-celular .side-link{ min-height:40px; }
    html.lw-celular button.lw-compacto{ min-height:0; }

    /* Filho de flex/grid precisa poder encolher, senão o conteúdo manda na
       largura e o pai acompanha. */
    html.lw-celular .content,
    html.lw-celular .content2,
    html.lw-celular .panel,
    html.lw-celular .panel2,
    html.lw-celular .card,
    html.lw-celular .wrap,
    html.lw-celular .content-cols > *,
    html.lw-celular .resumo-cols > *{ min-width:0; }

    /* Tabela larga rola dentro da própria caixa. Sem min-width:max-content:
       eu tinha posto e ele alargou tabelas que já cabiam. */
    /* Tabela larga rola dentro de si mesma.
       Era feito por JS, embrulhando a tabela numa caixa com rolagem — mas as
       telas refazem a tabela a cada render e desmanchavam o embrulho; ficava
       uma corrida que o JS perdia. Em CSS não há corrida.
       thead e tbody continuam sendo partes de tabela, então as colunas seguem
       alinhadas; o que muda é a tabela virar uma caixa que rola. */
    html.lw-celular table{ display:block; overflow-x:auto; -webkit-overflow-scrolling:touch;
      max-width:var(--lw-tela, 100%); }

    /* O teto que não estica.
       Nem 100%, nem 100vw servem: quando a página estoura, o Chrome do celular
       alarga a janela e as duas medidas acompanham — o teto sobe junto com o
       problema. --lw-tela vem de screen.width, que é o aparelho e fica parado.
       Sem isto, o Financeiro ia de 390 para 757 só por a tabela virar bloco. */
    html.lw-celular .main,
    html.lw-celular .content,
    html.lw-celular .content2,
    html.lw-celular .wrap,
    html.lw-celular .painel{ max-width:var(--lw-tela, 100%); overflow-x:clip; }

    /* Caixa de entrada: tres colunas lado a lado ("330px 300px 1fr") somam
       763px numa tela de 390. No celular viram uma embaixo da outra. */
    html.lw-celular .painel{ grid-template-columns:1fr !important; height:auto !important; }
    html.lw-celular .painel > .col{ border-right:none; border-bottom:1px solid var(--line); }

    /* A gaveta fica fora da tela, à direita, e com isso estica a página toda:
       Clientes media 1.281px por causa dela. "clip" corta sem criar barra de
       rolagem nova e sem quebrar o que é sticky ou fixed, ao contrário de
       "hidden". Os quadros kanban continuam rolando, porque a rolagem deles
       é dentro do próprio .board. */
    html.lw-celular body{ overflow-x:clip; }
    /* "overflow:clip" no body NÃO corta quem é position:fixed — o bloco que
       contém esses é a janela. A gaveta fechada mora fora da tela, à direita,
       e estica a página (Clientes media 1.281px). No celular ela some
       enquanto está fechada: perde o deslizar, mantém a página inteira. */
    html.lw-celular .drawer:not(.show){ display:none; }
    .lw-carregando{ position:fixed; left:0; top:0; height:3px; width:0; background:linear-gradient(90deg,#86285F,#3B6FE0); z-index:1300; transition:width .3s, opacity .4s; opacity:0; pointer-events:none; }
    .lw-carregando.on{ opacity:1; }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  // A largura que vale é a do APARELHO. `innerWidth` estica quando a página
  // estoura (medido: Agenda reportando 933 numa tela de 390), e usar ela aqui
  // desligaria as regras exatamente nas telas quebradas.
  const LARGURA_CELULAR = 820;
  function marcarCelular(){
    const aparelho = (window.screen && window.screen.width) || window.innerWidth || 0;
    const ehCelular = Math.min(aparelho || Infinity, window.innerWidth || Infinity) <= LARGURA_CELULAR;
    document.documentElement.classList.toggle('lw-celular', ehCelular);
    // A medida do aparelho vira variável de CSS: é o único teto que não sobe
    // junto quando a página estoura.
    if(aparelho) document.documentElement.style.setProperty('--lw-tela', aparelho + 'px');
  }
  marcarCelular();
  window.addEventListener('resize', marcarCelular);
  window.addEventListener('orientationchange', marcarCelular);

  function prontoDom(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  prontoDom(()=>{
    // Botão que cria dado de teste some para quem não é sócio. Marcar com
    // data-so-admin basta; não precisa cada tela saber da regra.
    if(!window.LW.ehAdministrador()){
      document.querySelectorAll('[data-so-admin]').forEach(el => { el.hidden = true; });
    }

    // ---- Menu no celular ----
    const sidebar = document.querySelector('.sidebar');
    if(sidebar){
      const btn = document.createElement('button'); btn.className = 'lw-menu-btn'; btn.setAttribute('aria-label', 'Abrir menu'); btn.textContent = '☰';
      const fundo = document.createElement('div'); fundo.className = 'lw-menu-fundo';
      const fechar = ()=> document.body.classList.remove('lw-menu-aberto');
      btn.addEventListener('click', ()=> document.body.classList.toggle('lw-menu-aberto'));
      fundo.addEventListener('click', fechar);
      sidebar.addEventListener('click', (e)=>{ if(e.target.closest('a')) fechar(); });
      document.body.appendChild(btn); document.body.appendChild(fundo);
    }
    // ---- Link "Como usar" no fim do menu ----
    // (o menu é montado por JS em cada tela; garante o link depois de qualquer re-render)
    const nav = sidebar && (sidebar.querySelector('#side-nav, nav') || sidebar);
    if(nav && !location.pathname.endsWith('/ajuda.html')){
      const garantir = ()=>{
        if(nav.querySelector('a[href="ajuda.html"]')) return;
        const a = document.createElement('a'); a.href = 'ajuda.html'; a.className = 'side-link';
        a.style.cssText = 'margin-top:8px;opacity:.8;';
        a.innerHTML = '<span style="width:16px;text-align:center;">❔</span><span>Como usar</span>';
        nav.appendChild(a);
      };
      garantir();
      new MutationObserver(garantir).observe(nav, { childList:true });
    }

    // A barra fina de "carregando" no topo foi removida em 20/10/2026.
    //
    // Ela acendia a cada chamada ao servidor. Como o sistema recarrega os
    // dados sozinho quando outra tela salva algo (aviso por WebSocket), ela
    // piscava sem parar — azul indo e voltando no alto da página o dia
    // inteiro. Sinal que aparece o tempo todo deixa de ser sinal e vira
    // ruído: ninguém mais olha para ele, e ele ainda cansa a vista.
    //
    // Quem precisa saber que algo está acontecendo já tem resposta melhor
    // no próprio lugar da ação: o botão que vira "enviando…", o toast que
    // confirma, a linha que muda. A regra de CSS continua logo acima, sem
    // uso, para quem um dia quiser ligar isto de volta só em operação lenta.
  });

  // ---- Confirmação com senha pra ações que não têm volta. Fica registrado na auditoria quem confirmou. ----
  window.LW = window.LW || {};
  window.LW.confirmar = (msg)=> window.confirm(msg);

  // ---- Filtro de período (Dia / Semana / Mês / Período) -------------------
  // Peça única, usada pelo Financeiro e pelo Dashboard. Nasceu dentro do
  // Financeiro e foi extraída para cá porque a aba Fluxo de Caixa tinha feito
  // a própria cópia da regra do rótulo — e, por isso, não recebeu nenhuma das
  // correções que as outras abas receberam. Uma terceira tela com uma terceira
  // cópia repetiria o mesmo erro.
  const hojeIso = ()=> new Date().toISOString().slice(0,10);
  const somarDias = (iso, n)=>{ const d = new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
  const semanaDe = (iso)=>{
    const d = new Date(iso+'T12:00:00');
    const ini = new Date(d); ini.setDate(d.getDate() - d.getDay());
    const fim = new Date(ini); fim.setDate(ini.getDate()+6);
    return [ini.toISOString().slice(0,10), fim.toISOString().slice(0,10)];
  };
  const curta = (iso)=>{ const [a,m,d] = String(iso).split('-'); return `${d}/${m}`; };
  // "semana" é feminino; os outros três são masculinos.
  const ARTIGOS = { no:['no','na'], do:['do','da'], neste:['neste','nesta'], deste:['deste','desta'] };

  const P = {
    modo: 'mes',
    dia: hojeIso(),
    mes: hojeIso().slice(0,7),
    de: hojeIso().slice(0,8) + '01',
    ate: hojeIso(),

    rotulo(){
      if(this.modo === 'dia') return 'dia';
      if(this.modo === 'semana') return 'semana';
      if(this.modo === 'personalizado') return 'período';
      if(this.modo === 'tudo') return 'tempo todo';
      return 'mês';
    },
    // "Contratos assinados no mês" / "na semana" / "em todo o período". O modo
    // 'tudo' não cabe no artigo — "no tempo todo" soa errado em português.
    com(artigo){
      if(this.modo === 'tudo') return 'em todo o período';
      return ARTIGOS[artigo][this.modo === 'semana' ? 1 : 0] + ' ' + this.rotulo();
    },

    dentro(dataIso){
      if(!dataIso) return false;
      // "Todo o período": tudo entra, sem recorte de data. É o que responde
      // "quanto este escritório já fez", pergunta que nenhum dos outros modos
      // alcançava — o mês mais cheio ainda é um mês.
      if(this.modo === 'tudo') return true;
      const d = String(dataIso).slice(0,10);
      if(this.modo === 'dia') return d === this.dia;
      if(this.modo === 'semana'){ const [i,f] = semanaDe(this.dia); return d >= i && d <= f; }
      if(this.modo === 'personalizado'){
        if(this.de && d < this.de) return false;
        if(this.ate && d > this.ate) return false;
        return true;
      }
      return String(dataIso).slice(0,7) === this.mes;
    },

    // O período imediatamente anterior, para as comparações. No intervalo
    // personalizado é a mesma quantidade de dias logo antes — comparar 3 dias
    // com 30 daria uma variação sem sentido.
    anterior(dataIso){
      if(!dataIso) return false;
      // Não existe "antes de tudo": com o tempo todo selecionado, a comparação
      // com o período anterior fica vazia, e os cartões deixam de mostrá-la.
      if(this.modo === 'tudo') return false;
      const d = String(dataIso).slice(0,10);
      if(this.modo === 'dia') return d === somarDias(this.dia, -1);
      if(this.modo === 'semana'){
        const [i] = semanaDe(this.dia); const ai = somarDias(i, -7);
        return d >= ai && d <= somarDias(ai, 6);
      }
      if(this.modo === 'personalizado'){
        if(!this.de || !this.ate) return false;
        const dias = Math.round((new Date(this.ate+'T12:00:00') - new Date(this.de+'T12:00:00'))/864e5);
        const fim = somarDias(this.de, -1);
        return d >= somarDias(fim, -dias) && d <= fim;
      }
      const [a,m] = this.mes.split('-').map(Number);
      const ant = new Date(a, m-2, 1);
      return String(dataIso).slice(0,7) === `${ant.getFullYear()}-${String(ant.getMonth()+1).padStart(2,'0')}`;
    },

    andar(passo){
      if(this.modo === 'dia'){ this.dia = somarDias(this.dia, passo); return; }
      if(this.modo === 'semana'){ this.dia = somarDias(this.dia, passo*7); return; }
      if(this.modo === 'personalizado' || this.modo === 'tudo') return;
      const [a,m] = this.mes.split('-').map(Number);
      const d = new Date(a, m-1+passo, 1);
      this.mes = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    },

    navHtml(){
      if(this.modo === 'dia'){
        const ehHoje = this.dia === hojeIso();
        return `<button data-p-prev>‹</button><div class="mes-label">${curta(this.dia)}</div><button data-p-next>›</button>`
             + (ehHoje ? '' : `<button class="btn-hoje" data-p-hoje>Hoje</button>`);
      }
      if(this.modo === 'semana'){
        const [i,f] = semanaDe(this.dia);
        const ehAtual = semanaDe(hojeIso())[0] === i;
        return `<button data-p-prev>‹</button><div class="mes-label">${curta(i)} – ${curta(f)}</div><button data-p-next>›</button>`
             + (ehAtual ? '' : `<button class="btn-hoje" data-p-hoje>Semana atual</button>`);
      }
      if(this.modo === 'tudo'){
        return `<div class="mes-label">Desde o começo</div>`;
      }
      if(this.modo === 'personalizado'){
        return `<label style="font-size:12px;">De</label>
          <input type="date" data-p-de value="${this.de}" style="font-family:inherit;font-size:12.5px;padding:4px 8px;border:1px solid var(--line);border-radius:7px;">
          <label style="font-size:12px;">até</label>
          <input type="date" data-p-ate value="${this.ate}" style="font-family:inherit;font-size:12.5px;padding:4px 8px;border:1px solid var(--line);border-radius:7px;">`;
      }
      const [a,m] = this.mes.split('-').map(Number);
      const nome = new Date(a, m-1, 1).toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
      const ehAtual = this.mes === hojeIso().slice(0,7);
      return `<button data-p-prev>‹</button><div class="mes-label">${nome}</div><button data-p-next>›</button>`
           + (ehAtual ? '' : `<button class="btn-hoje" data-p-hoje>Mês atual</button>`);
    },

    /** Desenha a barra dentro de `el` e chama `aoMudar()` a cada alteração. */
    montar(el, aoMudar){
      if(!el) return;
      const desenhar = ()=>{
        el.innerHTML =
          `<div class="chip-row">` +
          [['dia','Dia'],['semana','Semana'],['mes','Mês'],['personalizado','Período'],['tudo','Tudo']]
            .map(([v,t])=>`<div class="chip ${this.modo===v?'active':''}" data-p-modo="${v}">${t}</div>`).join('') +
          `</div><div class="mes-nav">${this.navHtml()}</div>`;

        el.querySelectorAll('[data-p-modo]').forEach(c=> c.addEventListener('click', ()=>{
          this.modo = c.getAttribute('data-p-modo');
          if(this.modo === 'dia' || this.modo === 'semana') this.dia = hojeIso();
          desenhar(); aoMudar();
        }));
        const liga = (sel, fn)=> el.querySelector(sel) && el.querySelector(sel).addEventListener('click', fn);
        liga('[data-p-prev]', ()=>{ this.andar(-1); desenhar(); aoMudar(); });
        liga('[data-p-next]', ()=>{ this.andar(1);  desenhar(); aoMudar(); });
        liga('[data-p-hoje]', ()=>{ this.dia = hojeIso(); this.mes = hojeIso().slice(0,7); desenhar(); aoMudar(); });
        const de = el.querySelector('[data-p-de]'), ate = el.querySelector('[data-p-ate]');
        if(de)  de.addEventListener('change', ()=>{ this.de  = de.value;  aoMudar(); });
        if(ate) ate.addEventListener('change', ()=>{ this.ate = ate.value; aoMudar(); });
      };
      desenhar();
    },
  };
  window.LW.periodo = P;

  // ---- Formas de pagamento ----------------------------------------------
  // Uma lista só, usada no contrato e no financeiro. Antes era texto livre em
  // cada tela, e o mesmo meio virava "cartão", "Cartao" e "CARTÃO" — três
  // coisas diferentes para o sistema, impossível de filtrar ou somar.
  //
  // `stripe: true` marca o que a plataforma consegue cobrar sozinha. O resto
  // o cliente paga por fora e o financeiro dá baixa na mão.
  window.LW.FORMAS_PAGAMENTO = [
    { valor: 'Cartão',                 stripe: true  },
    { valor: 'Zelle',                  stripe: false },
    { valor: 'Pix',                    stripe: false },
    { valor: 'Transferência bancária', stripe: false },
    { valor: 'Cheque',                 stripe: false },
    { valor: 'Dinheiro',               stripe: false },
    { valor: 'Outro',                  stripe: false },
  ];

  // O que veio do Bling não usa esses nomes: lá existe "Stripe Recebimentos",
  // "Cartão de Débito", "Cobrança automatica Square". Em vez de reescrever o
  // histórico — o que apagaria o que realmente foi combinado — a gente lê e
  // interpreta. O valor guardado continua como está; só a leitura é unificada.
  window.LW.lerForma = (bruto)=>{
    const t = String(bruto || '').trim();
    if(!t) return { valor:'', rotulo:'', stripe:null, definida:false };
    const n = t.toLowerCase();
    if(/cart|stripe|credit|debit/.test(n)) return { valor:t, rotulo:t, stripe:true,  definida:true };
    if(/square/.test(n))                   return { valor:t, rotulo:t, stripe:false, definida:true };
    const achou = window.LW.FORMAS_PAGAMENTO.find(f=> f.valor.toLowerCase() === n);
    return { valor:t, rotulo: achou ? achou.valor : t, stripe: achou ? achou.stripe : false, definida:true };
  };

  // Sem forma definida a plataforma não deve supor que pode cobrar no cartão —
  // mas também não pode travar as 1.004 parcelas antigas que vieram sem o campo.
  // Por isso "não definida" continua deixando cobrar, e a tela avisa.
  window.LW.podeCobrarNaStripe = (bruto)=>{
    const f = window.LW.lerForma(bruto);
    return !f.definida || f.stripe === true;
  };

  // ---- Regras do escritório (padrão da Legal Way + o que o escritório mudou). Carregadas uma vez por tela. ----
  let regrasPromessa = null, regrasCache = null;
  window.LW.regras = ()=>{
    if(regrasCache) return Promise.resolve(regrasCache);
    if(!regrasPromessa){
      const publico = new URLSearchParams(location.search).has('t');
      regrasPromessa = fetch(publico ? '/api/publico/regras' : '/api/regras', {credentials:'same-origin'})
        .then(r => r.ok ? r.json() : null)
        .then(d => { regrasCache = d ? (d.regras || d) : {}; return regrasCache; })
        .catch(()=> (regrasCache = {}));
    }
    return regrasPromessa;
  };
  window.LW.regrasAgora = ()=> regrasCache; // síncrono, depois que LW.regras() já resolveu
  window.LW.recarregarRegras = ()=>{ regrasPromessa = null; return window.LW.regras(); }; // depois de salvar as regras

  // O número de quem vai ligar. A mensagem chega no número oficial do escritório, mas a ligação
  // parte do número do consultor — se o cliente não souber disso, não atende.
  window.LW.numeroDoConsultor = (nome)=>{
    const R = regrasCache || {};
    const linhas = (R.agenda && Array.isArray(R.agenda.disponibilidade)) ? R.agenda.disponibilidade : [];
    const achou = linhas.find(d => String(d.vendedor||'').trim().toLowerCase() === String(nome||'').trim().toLowerCase() && String(d.numero||'').trim());
    return achou ? String(achou.numero).trim() : '';
  };

  // Monta a mensagem do primeiro contato a partir do modelo das Regras (Configurações → Regras →
  // Entrada de Leads). O mesmo texto vale pro atendente automático, pra Entrada de Leads e pro SDR —
  // vem de um lugar só pra ninguém falar diferente com o cliente.
  window.LW.mensagemContato = (dados)=>{
    const R = regrasCache || {};
    const modelo = (R.leads && R.leads.mensagemPrimeiroContato) ||
      'Olá, {cliente}! Aqui é da {empresa} 👋\n\nRecebemos seu contato sobre {servico}. Quem vai continuar seu atendimento é {vendedor}, e ele(a) vai te chamar {quando} pelo número {numero} — já pode salvar esse contato pra não perder a ligação.\n\nQualquer coisa, é só responder por aqui.';
    const numero = dados.numero || window.LW.numeroDoConsultor(dados.vendedor);
    return modelo
      .replace(/\{cliente\}/g, dados.cliente || '')
      .replace(/\{empresa\}/g, (R.empresa && R.empresa.nome) || 'Legal Way Group')
      .replace(/\{servico\}/g, dados.servico || 'seu processo')
      .replace(/\{vendedor\}/g, dados.vendedor || '')
      .replace(/\{numero\}/g, numero || '(número do consultor não cadastrado)')
      .replace(/\{quando\}/g, dados.quando || 'em breve');
  };

  // Copiar a mensagem, e abrir o WhatsApp já com ela escrita
  window.LW.copiarTexto = async (texto)=>{
    try{ await navigator.clipboard.writeText(texto); if(window.toast) toast('Mensagem copiada.'); return true; }
    catch(e){ window.prompt('Copie a mensagem:', texto); return false; }
  };
  window.LW.linkWhatsapp = (telefone, texto)=>
    'https://wa.me/' + String(telefone||'').replace(/\D/g,'') + (texto ? '?text=' + encodeURIComponent(texto) : '');

  // Marca do escritório nas telas (menu, título da aba, frase, nome no login/certificado)
  function aplicarMarca(){
    const e = (regrasCache && regrasCache.empresa) || null; if(!e || !e.nome) return;
    const padrao = e.nome === 'Legal Way Group';
    document.querySelectorAll('.side-logo .lw, .lw-word, .card-lw-word').forEach(el=>{
      if(padrao) return;
      const small = el.querySelector('small');
      el.textContent = (e.nomeCurto && e.nomeCurto.length <= 12 ? e.nomeCurto : e.nome).toUpperCase();
      if(small){ el.appendChild(small); small.textContent = ''; }
    });
    document.querySelectorAll('.card-lw-group, .lw-group, .qsign').forEach(el=>{ if(!padrao) el.textContent = e.nome.toUpperCase(); });
    document.querySelectorAll('.quote-block .quote, .hero-right .quote, .hero-quote').forEach(el=>{ if(e.slogan) el.textContent = '"' + e.slogan + '"'; });
    if(!padrao && document.title.includes('Legal Way Group')) document.title = document.title.replace('Legal Way Group', e.nome);
    if(!padrao) document.querySelectorAll('.side-brand, .footer-brand').forEach(el=>{ el.textContent = e.nome; });
    if(e.logo) document.querySelectorAll('.side-logo img').forEach(img=>{ img.src = e.logo; });
    else if(!padrao) document.querySelectorAll('.side-logo img').forEach(img=>{
      // Escritório sem logo: iniciais num círculo (o emblema padrão é da Legal Way)
      const ini = e.nome.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
      const badge = document.createElement('span');
      badge.style.cssText = 'width:34px;height:34px;border-radius:50%;background:#8A2A5B;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;letter-spacing:.02em;flex:none';
      badge.textContent = ini; img.replaceWith(badge);
    });
  }
  window.LW.regras().then(()=>{ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicarMarca); else aplicarMarca(); });

  // ---- Blocos personalizáveis: cada pessoa esconde/mostra cartões e painéis de cada módulo ----
  // Um bloco é qualquer elemento com data-bloco="id" (título vem de data-bloco-titulo ou do primeiro h2/h3/.lbl).
  const pagina = (location.pathname.split('/').pop() || 'index.html').replace('.html','');
  let prefs = null, prefsChave = null;
  async function carregarPrefs(){
    const sessao = LW.sessaoAtual(); if(!sessao || !window.storage || window.storage.modoPublico) return {};
    prefsChave = 'legalway-pref-' + sessao.usuarioId + '-v1';
    try{ const r = await window.storage.get(prefsChave, true); prefs = r && r.value ? JSON.parse(r.value) : {}; }catch(e){ prefs = {}; }
    return prefs;
  }
  async function salvarPrefs(){ if(prefsChave) try{ await window.storage.set(prefsChave, JSON.stringify(prefs), true); }catch(e){} }
  function tituloBloco(el){
    if(el.dataset.blocoTitulo) return el.dataset.blocoTitulo;
    const t = el.querySelector('h2, h3, .lbl, .label, .kpi-lbl, .sdr-kpi-lbl, b');
    return (t ? t.textContent : el.dataset.bloco).trim().replace(/\s+/g,' ').slice(0, 40);
  }
  function aplicarBlocos(){
    const ocultos = new Set(((prefs || {}).blocosOcultos || {})[pagina] || []);
    document.querySelectorAll('[data-bloco]').forEach(el => { el.style.display = ocultos.has(el.dataset.bloco) ? 'none' : ''; });
  }
  function abrirPersonalizar(){
    const blocos = [...document.querySelectorAll('[data-bloco]')];
    if(!blocos.length){ alert('Esta tela ainda não tem blocos personalizáveis.'); return; }
    const ocultos = new Set(((prefs || {}).blocosOcultos || {})[pagina] || []);
    const fundo = document.createElement('div');
    fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    fundo.innerHTML = `<div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:460px;width:100%;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:85vh;overflow:auto;">
      <div style="font-family:'Fraunces',serif;font-size:17px;color:#16204F;margin-bottom:4px;">⚙ Personalizar esta tela</div>
      <div style="font-size:12.5px;color:#6B6B75;margin-bottom:12px;">Desmarque o que você não quer ver. Só vale pra você.</div>
      <div id="lw-lista-blocos" style="display:flex;flex-direction:column;gap:6px;"></div>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;">
        <button id="lw-blocos-todos" style="font-family:inherit;font-size:12.5px;padding:8px 12px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">Mostrar todos</button>
        <button id="lw-blocos-fechar" style="font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;">Pronto</button>
      </div></div>`;
    const lista = fundo.querySelector('#lw-lista-blocos');
    blocos.forEach(el => {
      const id = el.dataset.bloco;
      const lab = document.createElement('label'); lab.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:13.5px;padding:6px 8px;border:1px solid #E4E1DA;border-radius:8px;cursor:pointer;';
      lab.innerHTML = `<input type="checkbox" ${ocultos.has(id)?'':'checked'}> <span>${tituloBloco(el).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span>`;
      lab.querySelector('input').addEventListener('change', (e)=>{ if(e.target.checked) ocultos.delete(id); else ocultos.add(id); prefs.blocosOcultos = prefs.blocosOcultos || {}; prefs.blocosOcultos[pagina] = [...ocultos]; aplicarBlocos(); salvarPrefs(); });
      lista.appendChild(lab);
    });
    fundo.querySelector('#lw-blocos-todos').addEventListener('click', ()=>{ ocultos.clear(); prefs.blocosOcultos = prefs.blocosOcultos || {}; prefs.blocosOcultos[pagina] = []; lista.querySelectorAll('input').forEach(i => i.checked = true); aplicarBlocos(); salvarPrefs(); });
    fundo.querySelector('#lw-blocos-fechar').addEventListener('click', ()=> fundo.remove());
    document.body.appendChild(fundo);
  }
  window.LW.aplicarBlocos = aplicarBlocos;

  // ---- Tela cheia: recolhe o menu da esquerda pra sobrar o máximo de largura pro quadro ----
  // Fica gravado por pessoa e por tela: quem trabalha o dia todo no funil deixa ligado e pronto.
  // Na tela cheia a barra de busca do topo sai inteira — são 62px, o maior pedaço que
  // ainda sobrava antes do quadro. Os botões dela (sair da tela cheia, personalizar,
  // chat, usuário) descem para a faixa de ações, senão a pessoa fica presa na tela cheia
  // sem o botão de sair. O ☰ é fixo no body e não depende dessa barra.
  let topoDeOnde = null;
  function moverAcoesDoTopo(ligado){
    const acoes = document.querySelector('.topbar-right');
    const faixa = document.querySelector('.page-head-row');
    if(!acoes || !faixa) return;
    if(ligado){
      if(!topoDeOnde) topoDeOnde = acoes.parentElement;
      if(acoes.parentElement !== faixa) faixa.appendChild(acoes);
    } else if(topoDeOnde && acoes.parentElement !== topoDeOnde){
      topoDeOnde.appendChild(acoes);
    }
    reservarEspacoDasAbas(ligado);
  }
  // A faixa fica por cima da linha das abas, então as abas precisam parar antes dela.
  // Medimos em vez de chutar um número: o nome da pessoa e a quantidade de funis mudam
  // a largura, e um valor fixo faria as abas passarem por baixo dos botões.
  function reservarEspacoDasAbas(ligado){
    const faixa = document.querySelector('.page-head-row');
    const area = document.querySelector('.content2');
    // A faixa é absoluta, e `right:0` mede pela caixa de recuo — sem isto o bloco do
    // usuário encosta na borda da janela, desalinhado das colunas do quadro logo abaixo.
    if(faixa) faixa.style.right = (ligado && area) ? getComputedStyle(area).paddingRight : '';
    const abas = document.querySelector('.content2 > .tabs');
    if(!abas) return;
    abas.style.paddingRight = (ligado && faixa) ? (faixa.offsetWidth + 16) + 'px' : '';
  }
  function aplicarTelaCheia(ligado){
    const menu = document.querySelector('.sidebar');
    if(menu) menu.style.display = ligado ? 'none' : '';
    document.body.classList.toggle('lw-tela-cheia', !!ligado);
    moverAcoesDoTopo(!!ligado);
    encaixarQuadro();
  }
  // Na tela cheia, tudo que não é o quadro sai da frente: título, subtítulo, botões de teste,
  // cartões de indicadores e os painéis de resumo. Sobra o quadro, do topo ao rodapé.
  (function estiloTelaCheia(){
    const css = document.createElement('style');
    css.textContent = `
      body.lw-tela-cheia .test-panel,
      body.lw-tela-cheia .pipeline-summary,
      body.lw-tela-cheia .funil-cols > div:last-child, body.lw-tela-cheia .sdr-cols > div:last-child,
      body.lw-tela-cheia .doc-cols > div:last-child { display:none !important; }

      /* ...mas só quando a tela é estreita. Numa janela larga, esconder uma
         coluna de 290px não compra largura nenhuma para o quadro e custa o
         painel inteiro — foi o que fez ela dizer "não tem a parte lateral
         ainda" no SDR, onde moram "Atividades de hoje" e "Metas do mês". */
      @media (min-width: 1500px){
        body.lw-tela-cheia .funil-cols > div:last-child,
        body.lw-tela-cheia .sdr-cols > div:last-child,
        body.lw-tela-cheia .doc-cols > div:last-child{ display:grid !important; }
      }

      /* Os indicadores do topo NÃO somem mais na tela cheia — eles encolhem.
         Antes era display:none, e o efeito prático foi este: ela abriu o SDR em
         tela cheia, viu o quadro sozinho e concluiu que "não tem dashboard ali
         para o SDR, nenhuma informação para ele". Tem — "na fila agora",
         "recuperados", "sem sucesso" e "taxa de recuperação" — e estava do
         outro lado do botão de tela cheia.
         A tela cheia existe para dar LARGURA ao quadro. Quatro números numa
         linha de 22px custam largura nenhuma; os painéis grandes, que ocupam
         uma coluna inteira, esses continuam saindo. */
      body.lw-tela-cheia .sdr-kpi-strip, body.lw-tela-cheia .kpi-strip{
        display:flex !important; flex-wrap:wrap; gap:4px 20px;
        margin:0 0 10px !important; padding:0 !important; }
      body.lw-tela-cheia .sdr-kpi-card, body.lw-tela-cheia .kpi-card{
        display:flex !important; align-items:baseline; gap:6px;
        background:transparent !important; border:none !important;
        padding:0 !important; min-height:0 !important; box-shadow:none !important; }
      body.lw-tela-cheia .sdr-kpi-top, body.lw-tela-cheia .kpi-top{
        display:contents !important; margin:0 !important; }
      body.lw-tela-cheia .sdr-kpi-icon, body.lw-tela-cheia .kpi-icon{ display:none !important; }
      body.lw-tela-cheia .sdr-kpi-lbl, body.lw-tela-cheia .kpi-lbl{ font-size:12px !important; }
      body.lw-tela-cheia .sdr-kpi-val, body.lw-tela-cheia .kpi-val{
        font-size:15px !important; font-family:inherit !important; }
      /* A faixa do título sai na tela cheia, mas os BOTÕES dela ficam: é onde moram
         "+ Adicionar lead", "+ Novo contrato", o seletor de vendedor. Escondendo a faixa
         inteira, o vendedor que trabalha em tela cheia perde a ação e conclui que ela não existe. */
      body.lw-tela-cheia .page-head-row{ display:flex !important; justify-content:flex-end;
        align-items:center; gap:8px; margin:0 !important; padding:0 !important; }
      body.lw-tela-cheia .page-head-row h1, body.lw-tela-cheia .page-head-row h2,
      body.lw-tela-cheia .page-head-row p, body.lw-tela-cheia .page-head-row .page-sub{ display:none !important; }
      /* Faixa que só tinha título fica sem altura; com botão, ganha um respiro antes do quadro. */
      body.lw-tela-cheia .page-head-row:has(button, select, a){ margin:0 0 10px !important; }
      body.lw-tela-cheia .content2{ padding-top:10px !important; padding-bottom:0 !important; }
      body.lw-tela-cheia .footer{ display:none !important; }

      /* ---- O canto de cima deixa de ser um amontoado -----------------------
         Em tela cheia o cabeçalho recebe "Sair da tela cheia" e "Personalizar"
         em cima do sino, do chat e do chip do usuário — que tem duas linhas.
         O resultado: o nome cortado, o cargo escapando por baixo da faixa e o
         seletor de visualização caindo em cima dele.

         Aqui: os dois botões viram ícone (o texto deles já some abaixo de
         900px — a tela cheia é o mesmo aperto), o cargo sai, e o cabeçalho
         ganha altura e permissão para quebrar linha em vez de empilhar. */
      body.lw-tela-cheia .topbar-right{ flex-wrap:wrap; align-items:center; row-gap:6px; }
      body.lw-tela-cheia .topbar-right button span{ display:none !important; }
      body.lw-tela-cheia .user-meta .urole{ display:none !important; }
      body.lw-tela-cheia .user-meta .uname{ font-size:12.5px; }
      body.lw-tela-cheia .page-head-row{ min-height:40px; }

      /* O seletor de visualização ganha a própria linha, à esquerda, em vez de
         flutuar ao lado de tudo. É ele que estava por cima do nome. */
      .lw-toggle-visao{ float:none !important; clear:both; }
      .board-wrap > .lw-toggle-visao{ display:inline-flex; position:relative; z-index:1; }
      body.lw-tela-cheia .board-wrap{ padding-bottom:6px !important; }
      /* Tela cheia de verdade. Num quadro com abas havia QUATRO faixas antes do primeiro
         card — ações, abas, filtros e o seletor Kanban/Lista — comendo 181px de 678.
         As ações sobem para a linha das abas e o seletor para a linha dos filtros:
         quatro faixas viram duas e o quadro ganha ~100px, que é uma fileira inteira
         de cards a mais no notebook do vendedor. Só a partir de 900px de largura:
         no celular as faixas continuam empilhadas, que é o certo lá. */
      @media (min-width: 900px){
        body.lw-tela-cheia .content2:has(> .tabs){ position:relative; }
        body.lw-tela-cheia .content2:has(> .tabs) .page-head-row{
          position:absolute; top:0; right:0; margin:0 !important; z-index:6; gap:8px; }
        body.lw-tela-cheia .content2{ padding-left:56px !important; }
        body.lw-tela-cheia .content2:has(> .tabs) > .tabs{ margin:0 !important; flex-wrap:wrap; }
        body.lw-tela-cheia .filtros-funil{ margin-top:6px !important; }
        /* O seletor de visão ficava PRESO no canto superior direito
           (position:absolute; top:38px; right:0). Com duas opções cabia; ao
           ganhar a terceira — Compacto — ficou mais largo, passou por cima do
           chip do usuário e saiu cortado pela borda da tela.
           Agora ele anda no fluxo, encostado à esquerda, logo acima do quadro:
           custa uma linha fina de altura e nunca mais cobre nem some. */
        body.lw-tela-cheia .funil-cols, body.lw-tela-cheia .board-wrap{ position:static !important; }
        /* Já tentei duas coisas aqui e as duas sobrepuseram. O seletor ficava
           ANCORADO no canto direito (position:absolute; right:0) para poupar
           altura — e é justamente onde moram o chip do usuário, o sino e o
           chat. Com duas opções passava raspando; com a terceira cobriu o nome
           e saiu cortado pela borda. Encolher para ícones não resolveu: o
           canto continua ocupado.
           Sobreposição é pior que 30px de altura. Ele anda no fluxo. */
        body.lw-tela-cheia .lw-toggle-visao{
          position:static !important; margin:0 0 8px !important; z-index:auto; }
        /* Só os ícones em tela cheia: com os três nomes escritos o seletor
           passou a cobrir o chip do usuário e a sair cortado pela borda. */
        body.lw-tela-cheia .lw-toggle-visao button span{ display:none; }
        body.lw-tela-cheia .lw-toggle-visao button{ padding:6px 11px !important; font-size:14px !important; }
        body.lw-tela-cheia #fechados-mes > div{ margin-top:6px !important; padding:5px 10px !important; }
      }
      body.lw-tela-cheia .tabs{ margin-top:0 !important; }
      /* o menu continua a um clique: o mesmo ☰ do celular aparece e o menu abre por cima */
      body.lw-tela-cheia .lw-menu-btn{ display:flex !important; align-items:center; justify-content:center; width:34px; height:34px; font-size:16px; left:10px; top:14px; border-radius:9px; }
      body.lw-tela-cheia .topbar, body.lw-tela-cheia .topbar2{ display:none !important; }
      body.lw-tela-cheia.lw-menu-aberto .sidebar{ display:flex !important; position:fixed !important; left:0; top:0; height:100vh !important; z-index:1150; width:min(280px, 85vw) !important; overflow-y:auto; box-shadow:0 0 30px rgba(0,0,0,.4); }
      body.lw-tela-cheia.lw-menu-aberto .lw-menu-fundo{ display:block; }`;
    document.head.appendChild(css);
  })();

  // ---- Aviso de que ainda tem conteúdo para o lado ----
  // "cortado, não está organizado": o quadro rolava de lado, mas nada na tela
  // dizia isso. A última coluna aparecia pela metade na borda e parecia
  // defeito, não continuação. Uma sombra na beirada resolve — e some quando
  // chega ao fim.
  (function(){
    const css = document.createElement('style');
    css.textContent = `
      .lw-tem-mais-direita{ position:relative; }
      .lw-tem-mais-direita::after{
        content:''; position:absolute; top:0; right:0; bottom:0; width:38px; pointer-events:none;
        background:linear-gradient(to right, rgba(247,245,240,0), rgba(247,245,240,.92));
        z-index:3; }
      .lw-tem-mais-esquerda::before{
        content:''; position:absolute; top:0; left:0; bottom:0; width:28px; pointer-events:none;
        background:linear-gradient(to left, rgba(247,245,240,0), rgba(247,245,240,.92));
        z-index:3; }
    `;
    document.head.appendChild(css);
  })();
  function marcarRolagemLateral(){
    document.querySelectorAll('.board-wrap, .lw-rolar, .rolar').forEach(el => {
      const sobra = el.scrollWidth - el.clientWidth;
      el.classList.toggle('lw-tem-mais-direita', sobra > 8 && el.scrollLeft < sobra - 4);
      el.classList.toggle('lw-tem-mais-esquerda', el.scrollLeft > 4);
    });
  }
  window.LW.marcarRolagemLateral = marcarRolagemLateral;
  prontoDom(()=>{
    marcarRolagemLateral();
    // o quadro é montado depois de buscar os dados, então vale reconferir
    new MutationObserver(()=>{ clearTimeout(window.__lwRolagem);
      window.__lwRolagem = setTimeout(marcarRolagemLateral, 200); })
      .observe(document.body, { childList:true, subtree:true });
    document.addEventListener('scroll', (e)=>{
      const el = e.target;
      if(el && el.classList && (el.classList.contains('board-wrap') || el.classList.contains('lw-rolar') || el.classList.contains('rolar')))
        marcarRolagemLateral();
    }, true);
    window.addEventListener('resize', marcarRolagemLateral);
  });

  // O quadro ocupa a altura que sobra de verdade: em vez de chutar um valor, medimos onde ele
  // começa e damos o resto da janela. Vale em qualquer notebook, com ou sem tela cheia.
  function encaixarQuadro(){
    const wrap = document.querySelector('.board-wrap');
    if(!wrap) return;
    const corpos = wrap.querySelectorAll('.col-body');
    if(!corpos.length) return;
    const aplicar = (h)=> corpos.forEach(c => { c.style.minHeight = h + 'px'; c.style.maxHeight = h + 'px'; });
    // 1) chute inicial a partir de onde o quadro começa
    const topo = wrap.getBoundingClientRect().top;
    let altura = Math.max(220, Math.round(window.innerHeight - topo - 60));
    aplicar(altura);
    // 2) mede o que sobrou (ou faltou) e corrige — assim encosta no rodapé em qualquer notebook,
    //    sem depender de saber a soma dos espaçamentos de cada tela
    const folga = Math.round(window.innerHeight - wrap.getBoundingClientRect().bottom - 10);
    if(Math.abs(folga) > 2) aplicar(Math.max(220, altura + folga));
  }
  window.LW.encaixarQuadro = encaixarQuadro;
  window.addEventListener('resize', ()=> { reservarEspacoDasAbas(document.body.classList.contains('lw-tela-cheia')); encaixarQuadro(); });
  function ligarTelaCheia(){
    const topo = document.querySelector('.topbar-right, .topbar2 .topbar-right, .topbar');
    // A tela precisa dizer que tem conteúdo largo. As classes abaixo cobriam só
    // os quadros originais — Contratos, Processos, Financeiro e Clientes
    // ficavam sem o botão, e era justamente onde o conteúdo cortava na borda.
    // Agora qualquer tela pede o botão marcando [data-tela-cheia] num
    // contêiner que exista no HTML desde o início: marcar algo criado depois
    // por JavaScript não funciona, porque esta decisão acontece antes.
    if(!topo || !document.querySelector('.kanban, .funil-cols, .sdr-cols, .doc-cols, [data-tela-cheia]')) return;
    const chave = 'telaCheia';
    const guardado = ((prefs || {})[chave] || {})[pagina];
    const PADRAO_LIGADO = ['funil-comercial', 'sdr', 'documentos'];   // telas de quadro nascem em tela cheia
    let ligado = guardado === undefined ? PADRAO_LIGADO.includes(pagina) : !!guardado;
    const b = document.createElement('button');
    const pintar = ()=>{ b.innerHTML = (ligado ? '⛶ <span>Sair da tela cheia</span>' : '⛶ <span>Tela cheia</span>'); b.style.background = ligado ? '#16204F' : '#fff'; b.style.color = ligado ? '#fff' : '#16204F'; };
    b.title = 'Esconde o menu da esquerda e usa a tela inteira';
    b.style.cssText = 'border:1px solid #E4E1DA;border-radius:9px;height:34px;padding:0 12px;cursor:pointer;font-size:12.5px;font-family:inherit;margin-right:8px;white-space:nowrap;';
    pintar();
    b.addEventListener('click', ()=>{
      ligado = !ligado;
      // `prefs` fica nulo quando a leitura das preferências não chegou a
      // acontecer (sessão ainda carregando, modo público). Antes isso
      // estourava "Cannot read properties of null" NO CLIQUE, e o botão não
      // fazia nada — sem erro visível para quem clicou. Só aparecia nas telas
      // que ainda não tinham preferência salva, que eram justamente as que
      // acabaram de ganhar o botão.
      if(!prefs) prefs = {};
      prefs[chave] = prefs[chave] || {}; prefs[chave][pagina] = ligado;
      aplicarTelaCheia(ligado); pintar(); salvarPrefs();
    });
    topo.insertBefore(b, topo.firstChild);
    if(window.innerWidth < 900) b.querySelector('span').style.display = 'none';
    if(ligado) aplicarTelaCheia(true);
  }
  prontoDom(async ()=>{
    if(!window.storage || window.storage.modoPublico) return;
    await carregarPrefs();
    aplicarBlocos();
    new MutationObserver(()=> { aplicarBlocos(); encaixarQuadro(); }).observe(document.body, { childList:true, subtree:true });
    // botão ⚙ Personalizar no cabeçalho (ao lado do usuário), só nas telas com blocos
    const topo = document.querySelector('.topbar-right, .topbar2 .topbar-right, .topbar');
    if(topo && document.querySelector('[data-bloco]')){
      const b = document.createElement('button'); b.title = 'Escolher o que aparece nesta tela';
      b.innerHTML = '⚙ <span>Personalizar</span>';
      b.style.cssText = 'border:1px solid #E4E1DA;background:#fff;border-radius:9px;height:34px;padding:0 12px;cursor:pointer;font-size:12.5px;font-family:inherit;color:#16204F;margin-right:8px;white-space:nowrap;';
      b.addEventListener('click', abrirPersonalizar);
      topo.insertBefore(b, topo.firstChild);
      if(window.innerWidth < 900) b.querySelector('span').style.display = 'none';
    }
    ligarTelaCheia();
  });
  // ---- A cor de cada serviço -------------------------------------------
  //
  // Pedido dela: "cada serviço poderia ter uma cor, para diferenciar".
  //
  // A cor NASCE DO NOME, por uma conta simples e estável. Não é configuração:
  // serviço novo que o escritório cadastrar já tem a sua, e o mesmo nome dá
  // sempre a mesma cor em toda tela. Ninguém precisa escolher nem manter nada.
  //
  // As oito cores foram escolhidas FORA do conjunto semântico. Verde, âmbar,
  // vermelho e azul já querem dizer resolvido, esperando, precisa de você e
  // informação — um serviço pintado de verde diria "pago" sem querer.
  // Estas são tons de categoria: índigo, teal, ameixa, terra, ardósia, oliva,
  // bordô e petróleo. Todas passam de 4,5:1 de contraste no texto.
  const CORES_DE_SERVICO = [
    { bg:'#E6E8F7', fg:'#3A449B' },  // índigo
    { bg:'#DFEFEC', fg:'#1F6B63' },  // teal
    { bg:'#EFE5F3', fg:'#6B4080' },  // ameixa
    { bg:'#F2E9DF', fg:'#7A5230' },  // terra
    { bg:'#E5EAF0', fg:'#3F5A75' },  // ardósia
    { bg:'#EAEEDF', fg:'#52632B' },  // oliva
    { bg:'#F4E6E8', fg:'#8A3A4A' },  // bordô
    { bg:'#E1EDF0', fg:'#2A5C६8'.replace('६','6') },  // petróleo
  ];
  window.LW.corDoServico = function(nome){
    const t = String(nome || '').trim().toLowerCase();
    if(!t) return { bg:'var(--paper-dim)', fg:'var(--ink-soft)' };
    // Soma simples dos códigos das letras: estável, e não depende de ordem
    // de cadastro nem de quantos serviços existem.
    let soma = 0;
    for(let i = 0; i < t.length; i++) soma = (soma * 31 + t.charCodeAt(i)) % 100000;
    return CORES_DE_SERVICO[soma % CORES_DE_SERVICO.length];
  };
  // A etiqueta pronta, para a tela não repetir o estilo em cada cartão.
  window.LW.etiquetaDeServico = function(nome){
    if(!nome) return '';
    const c = LW.corDoServico(nome);
    return `<span class="lw-servico" style="background:${c.bg}; color:${c.fg};">${LW.escaparHtml(nome)}</span>`;
  };

  // ---- Kanban ou lista: preferência de cada pessoa, por módulo, neste navegador ----
  window.LW.visao = (modulo, valor)=>{
    const k = 'legalway-visao-' + modulo;
    if(valor){ try{ localStorage.setItem(k, valor); }catch(e){} return valor; }
    try{ return localStorage.getItem(k) || 'kanban'; }catch(e){ return 'kanban'; }
  };
  // Três formas de ver o mesmo quadro: ▦ Kanban, ▤ Compacto e ☰ Lista.
  //
  // O compacto nasceu de um problema que eu mesma criei: ao pôr o tempo de
  // casa, o tempo na etapa e o protocolo no cartão, cada um ganhou três linhas
  // e a coluna ficou alta — "aqui começa a descer muito para visualizar". Ele
  // mantém o quadro e o arrastar, e esconde o detalhe: sobram nome, tempo e a
  // barra do quanto já foi pago. Para o detalhe, basta abrir o card.
  //
  // É só uma CLASSE no quadro. Nenhum cartão é montado diferente, então nada
  // some de verdade nem corre o risco de divergir entre as duas formas.
  // O ícone fica sempre; o nome vai num <span> para poder sumir quando o
  // espaço aperta — mesmo jeito dos botões de tela cheia e personalizar.
  const ROTULO_VISAO = {
    kanban:   ['▦', 'Kanban'],
    compacto: ['▤', 'Compacto'],
    lista:    ['☰', 'Lista'],
  };
  window.LW.toggleVisao = (alvo, modulo, aoMudar)=>{
    if(!alvo || alvo.querySelector('.lw-toggle-visao')) return;
    const atual = LW.visao(modulo);
    const box = document.createElement('div'); box.className = 'lw-toggle-visao';
    box.style.cssText = 'display:inline-flex;border:1px solid #E4E1DA;border-radius:8px;overflow:hidden;font-size:12px;margin:0 0 10px;';
    box.innerHTML = ['kanban','compacto','lista'].map(v=>{
      const [icone, nome] = ROTULO_VISAO[v];
      return `<button type="button" data-visao="${v}" title="${nome}" style="border:none;padding:6px 12px;cursor:pointer;font-family:inherit;font-size:12px;background:${v===atual?'#16204F':'#fff'};color:${v===atual?'#fff':'#1B1B1F'};white-space:nowrap;">${icone} <span>${nome}</span></button>`;
    }).join('');
    box.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{ LW.visao(modulo, b.getAttribute('data-visao')); box.remove(); LW.toggleVisao(alvo, modulo, aoMudar); aoMudar(); }));
    alvo.insertBefore(box, alvo.firstChild);
    const quadro = alvo.querySelector('.board');
    if(quadro) quadro.classList.toggle('compacto', atual === 'compacto');
  };
  // ---- Exportar uma lista: CSV e PDF ----
  //
  // O PDF sai pela impressão do próprio navegador ("Salvar como PDF"). Nenhuma
  // biblioteca entra no sistema por causa disto: o arquivo que ela manda para o
  // contador ou para o sócio não vale uma dependência nova em sete telas.
  //
  // A folha é montada numa janela à parte, só com a tabela — sem menu, sem
  // botão, sem a cor de fundo da tela. O que ela vê na tela é o que sai no
  // papel, e nada mais.
  const escCsv = (v)=>{
    const t = String(v ?? '');
    return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  // Ponto e vírgula, e BOM na frente: é o que faz o Excel em português abrir o
  // arquivo com as colunas separadas em vez de tudo numa célula só.
  window.LW.baixarCsv = (nomeArquivo, colunas, linhas)=>{
    const texto = '\ufeff' + [colunas.join(';')]
      .concat(linhas.map(l => l.map(escCsv).join(';'))).join('\r\n');
    const url = URL.createObjectURL(new Blob([texto], {type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo.replace(/[^\w\-. ]+/g, '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  };
  window.LW.imprimirPdf = (titulo, subtitulo, colunas, linhas, resumo)=>{
    const esc = (v)=> LW.escaparHtml(String(v ?? ''));
    const emp = (LW.regrasAgora() && LW.regrasAgora().empresa) || {};
    const agora = new Date().toLocaleString('pt-BR');
    // Coluna de número alinha à direita: é assim que se confere uma coluna de
    // dinheiro, e desalinhada ninguém soma de olho.
    const numerica = colunas.map((_, i)=> linhas.length > 0 && linhas.every(l => {
      const t = String(l[i] ?? '').trim();
      return t === '' || /^[-+]?(US\$\s*)?[\d.,]+%?$/.test(t);
    }));
    const janela = window.open('', '_blank');
    if(!janela){ LW.toast ? LW.toast('O navegador bloqueou a janela de impressão. Libere os pop-ups deste site.') : alert('Libere os pop-ups deste site para gerar o PDF.'); return; }
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>${esc(titulo)}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        *{ box-sizing:border-box; }
        body{ font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif; color:#1B1B1F; margin:0; }
        h1{ font-size:17px; margin:0 0 2px; color:#16204F; }
        .sub{ font-size:11px; color:#6B6B75; margin-bottom:12px; }
        .resumo{ font-size:11.5px; background:#ECEEF1; border-radius:6px; padding:8px 10px; margin-bottom:12px; line-height:1.5; }
        table{ width:100%; border-collapse:collapse; font-size:10.5px; }
        th{ text-align:left; border-bottom:1.5px solid #16204F; padding:5px 4px; font-size:9.5px;
            text-transform:uppercase; letter-spacing:.05em; color:#16204F; }
        td{ border-bottom:1px solid #E4E1DA; padding:5px 4px; vertical-align:top; }
        /* Repete o cabeçalho em toda folha: numa lista de 200 linhas, a partir
           da página 2 ninguém sabe mais qual coluna é qual. */
        thead{ display:table-header-group; }
        tr{ page-break-inside:avoid; }
        .num{ text-align:right; white-space:nowrap; }
        .rodape{ margin-top:14px; font-size:9.5px; color:#6B6B75; }
      </style></head><body>
      <h1>${esc(titulo)}</h1>
      <div class="sub">${esc(emp.nome || '')}${subtitulo ? ' · ' + esc(subtitulo) : ''} · gerado em ${esc(agora)}</div>
      ${resumo ? `<div class="resumo">${esc(resumo)}</div>` : ''}
      <table>
        <thead><tr>${colunas.map((c,i)=>`<th class="${numerica[i]?'num':''}">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map(l=>`<tr>${l.map((v,i)=>`<td class="${numerica[i]?'num':''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <div class="rodape">${linhas.length} linha${linhas.length===1?'':'s'}. Documento interno.</div>
      </body></html>`);
    janela.document.close();
    // Espera a folha montar antes de chamar a impressão: no Safari, imprimir
    // antes disso sai em branco.
    janela.onload = ()=> { janela.focus(); janela.print(); };
    setTimeout(()=>{ try{ janela.focus(); janela.print(); }catch(e){} }, 700);
  };
  // Os dois botões, prontos para pendurar em qualquer janela de lista.
  window.LW.botoesDeExportar = (id)=>
    `<button id="${id}-csv" style="font-family:inherit;font-size:12.5px;padding:8px 14px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">⬇ CSV</button>
     <button id="${id}-pdf" style="font-family:inherit;font-size:12.5px;padding:8px 14px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">🖨 PDF</button>`;
  window.LW.ligarExportar = (raiz, id, dados)=>{
    const csv = raiz.querySelector('#' + id + '-csv');
    const pdf = raiz.querySelector('#' + id + '-pdf');
    if(csv) csv.addEventListener('click', ()=>{ const d = dados(); LW.baixarCsv(d.arquivo || d.titulo, d.colunas, d.linhas); });
    if(pdf) pdf.addEventListener('click', ()=>{ const d = dados(); LW.imprimirPdf(d.titulo, d.subtitulo, d.colunas, d.linhas, d.resumo); });
  };

  // Lista de contratos numa janela, com a quebra por vendedor em cima e filtro por clique.
  // Mora aqui porque o Dashboard e o Financeiro mostram a MESMA lista: um número de
  // contratos assinados que não deixa ver quem são é um número em que ninguém confia.
  // Estilos inline de propósito: a janela tem que sair igual em qualquer tela, sem
  // depender do CSS de cada uma.
  // Toda janela que escurece a tela inteira precisa de saída: Esc e clique no
  // escuro, além do botão. Uma janela que fica presa não parece janela — parece
  // que "ficou tudo preto", e a pessoa não tem o que fazer a não ser recarregar.
  window.LW.saidaDaJanela = (fundo, aoFechar)=>{
    const fechar = ()=>{
      // Com uma pergunta na frente, a saída é dela, não desta janela. Fechar a
      // janela de baixo enquanto a pergunta ainda espera resposta deixa o
      // código que fez a pergunta falando com uma tela que já não existe — foi
      // assim que uma ficha com 10 anexos se perdeu numa unificação.
      if(document.querySelector('#lw-confirmar, #lw-confirmar-senha, #lw-pedir-texto, #lw-dependentes')) return;
      document.removeEventListener('keydown', tecla, true);
      if(typeof aoFechar === 'function') aoFechar(); else fundo.remove();
    };
    const tecla = (e)=>{ if(e.key === 'Escape'){ e.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', tecla, true);
    // Só o clique no escuro: dentro da caixa, não.
    fundo.addEventListener('click', (e)=>{ if(e.target === fundo) fechar(); });
    return fechar;
  };

  // ---- A ficha do cliente, sem sair da tela ----
  //
  // "Não queria sair da tela; gostaria de abrir uma tela maior, um popup, para
  // ver tudo, mas sem sair da tela que estou."
  //
  // A ficha tem nove abas e já existe pronta em clientes.html. Reescrevê-la
  // aqui como componente seria manter duas versões da mesma coisa, e elas vão
  // divergir — basta alguém arrumar um cálculo de saldo num lado só. Então o
  // popup mostra a própria página, em modo embutido (sem menu, sem barra de
  // cima), dentro de um quadro grande. Quem fecha volta exatamente para onde
  // estava, com os filtros e a rolagem intactos.
  // ---- A ficha do cliente, sem sair da tela ----
  //
  // "Clicar e ver situação financeira, contrato, processos, de uma forma
  // unificada. Quero ver tudo sobre a Edna."
  //
  // Unificada quer dizer numa tela só, lendo de cima a baixo — não nove abas
  // em que é preciso clicar uma a uma para descobrir se o cliente deve alguma
  // coisa. Cada bloco responde uma pergunta inteira: quanto ele deve, em que
  // pé está cada contrato, e onde anda cada processo.
  //
  // Lê os blocos direto, porque a ficha é chamada do Dashboard e do
  // Financeiro, que não têm esses dados à mão.
  const _cacheFicha = {};
  const lerBlocoFicha = async (chave)=>{
    if(_cacheFicha[chave]) return _cacheFicha[chave];
    try{
      const r = await window.storage.get(chave, true);
      const v = r && r.value ? JSON.parse(r.value) : [];
      _cacheFicha[chave] = Array.isArray(v) ? v : [];
    }catch(e){ _cacheFicha[chave] = []; }
    return _cacheFicha[chave];
  };

  window.LW.fichaDoCliente = async ({ contratoId, clienteId, nome })=>{
    const esc = v => LW.escaparHtml(String(v ?? ''));
    const dinheiro = v => 'US$ ' + Number(v||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    const data = v => { if(!v) return '—'; const d = new Date(String(v).length <= 10 ? v + 'T12:00:00' : v);
      return isNaN(d) ? String(v).slice(0,10) : d.toLocaleDateString('pt-BR'); };
    const normal = (t)=> String(t||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const soDig = (t)=> String(t||'').replace(/\D/g,'');

    document.getElementById('lw-ficha-cliente')?.remove();
    const fundo = document.createElement('div');
    fundo.id = 'lw-ficha-cliente';
    fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:2400;display:flex;align-items:center;justify-content:center;padding:18px;';
    const quadro = (miolo)=> `
      <div style="background:#fff;border-radius:14px;width:980px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:'IBM Plex Sans',sans-serif;color:#1B1B1F;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid #E4E1DA;">
          <div><div style="font-family:'Fraunces',serif;font-size:19px;color:#16204F;" id="lw-fc-nome">${esc(nome || 'Ficha do cliente')}</div>
          <div style="font-size:12px;color:#6B6B75;" id="lw-fc-sub"></div></div>
          <button id="lw-fc-fechar" style="font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;">Fechar</button>
        </div>
        <div id="lw-fc-corpo" style="flex:1;overflow:auto;padding:18px 22px 22px;">${miolo}</div>
      </div>`;
    fundo.innerHTML = quadro('<div style="color:#6B6B75;font-size:13px;">Juntando tudo deste cliente…</div>');
    document.body.appendChild(fundo);
    const fechar = ()=>{ fundo.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (e)=>{ if(e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', (e)=>{ if(e.target === fundo) fechar(); });
    fundo.querySelector('#lw-fc-fechar').addEventListener('click', fechar);

    const [clientes, contratos, financeiro, processos] = await Promise.all([
      lerBlocoFicha('legalway-clientes-v1'), lerBlocoFicha('legalway-contratos-v1'),
      lerBlocoFicha('legalway-financeiro-v1'), lerBlocoFicha('legalway-processos-documentacao-v1'),
    ]);
    if(!document.getElementById('lw-ficha-cliente')) return;   // fechou enquanto carregava

    // Quem é o cliente. Pelo id quando veio; pelo contrato quando foi daí que
    // ela clicou; e pelo nome quando o contrato nunca ganhou vínculo — o que
    // acontece em tudo que veio do Bling antes do cadastro de clientes.
    let cli = clienteId ? clientes.find(c=> String(c.id) === String(clienteId)) : null;
    const ctClicado = contratoId ? contratos.find(c=> String(c.id) === String(contratoId)) : null;
    if(!cli && contratoId) cli = clientes.find(c=> (c.contratoIds||[]).some(id=> String(id) === String(contratoId)));
    const nomeAlvo = (cli && cli.nome) || (ctClicado && ctClicado.cliente) || nome || '';
    if(!cli && nomeAlvo) cli = clientes.find(c=> normal(c.nome) === normal(nomeAlvo));

    // Tudo deste cliente, por vínculo quando existe e por nome/telefone quando
    // não — é assim que um cliente importado de três lugares vira um só aqui.
    const tel = soDig((cli && cli.telefone) || (ctClicado && ctClicado.telefone) || '');
    const ehDele = (x, campoNome)=> {
      const n = normal(x[campoNome]);
      if(n && n === normal(nomeAlvo)) return true;
      return tel.length >= 10 && soDig(x.telefone).slice(-10) === tel.slice(-10);
    };
    const meusContratos = contratos.filter(c=>
      (cli && (cli.contratoIds||[]).some(id=> String(id) === String(c.id))) || ehDele(c, 'cliente'));
    const idsContratos = new Set(meusContratos.map(c=> String(c.id)));
    const minhasParcelas = financeiro.filter(f=>
      (f.contratoId && idsContratos.has(String(f.contratoId))) || ehDele(f, 'clienteNome'));
    const meusProcessos = processos.filter(p=>
      (p.contratoId && idsContratos.has(String(p.contratoId))) || ehDele(p, 'clienteNome'));

    // ---- dinheiro ----
    const vivas = minhasParcelas.filter(f=> f.status !== 'Cancelado');
    const contratado = meusContratos.filter(c=> c.etapa !== 'Cancelado').reduce((s,c)=> s + Number(c.valor||0), 0);
    const recebido = vivas.reduce((s,f)=> s + Number(f.valorRecebido||0), 0);
    const emAberto = vivas.filter(f=> f.status !== 'Pago').reduce((s,f)=> s + (Number(f.valor||0) - Number(f.valorRecebido||0)), 0);
    const atrasadas = vivas.filter(f=> f.status === 'Atrasado');
    const atrasado = atrasadas.reduce((s,f)=> s + (Number(f.valor||0) - Number(f.valorRecebido||0)), 0);
    const pct = contratado > 0 ? Math.round((recebido / contratado) * 100) : 0;

    const cartao = (rotulo, valor, cor)=> `
      <div style="background:#ECEEF1;border-radius:9px;padding:10px 12px;">
        <div style="font-size:11px;color:#6B6B75;">${esc(rotulo)}</div>
        <div style="font-size:16px;font-weight:600;${cor?`color:${cor};`:''}">${esc(valor)}</div></div>`;
    const titulo = (t)=> `<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6B6B75;margin:20px 0 8px;">${esc(t)}</div>`;
    const vazio = (t)=> `<div style="font-size:12.5px;color:#6B6B75;">${esc(t)}</div>`;

    const porVenc = (a,b)=> String(a.vencimento||'').localeCompare(String(b.vencimento||''));
    const pilula = (texto, cor, fundoCor)=> `<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${fundoCor};color:${cor};white-space:nowrap;">${esc(texto)}</span>`;
    const statusParcela = (f)=> f.status === 'Pago' ? pilula('pago', '#1E6B43', '#E6F4EC')
      : f.status === 'Atrasado' ? pilula('atrasada', '#9B2C2C', '#FBE9E9')
      : f.status === 'Cancelado' ? pilula('cancelada', '#6B6B75', '#EFEFEF')
      : pilula('a vencer', '#6B6B75', '#F0F0F2');

    const miolo = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${cartao('Contratado', dinheiro(contratado))}
        ${cartao('Já recebido', dinheiro(recebido) + ' · ' + pct + '%', '#1E6B43')}
        ${cartao('Em aberto', dinheiro(emAberto))}
        ${cartao('Atrasado', atrasado > 0 ? dinheiro(atrasado) + ' · ' + atrasadas.length + ' parcela(s)' : '—', atrasado > 0 ? '#9B2C2C' : '')}
      </div>

      ${titulo('Contratos')}
      ${meusContratos.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <tbody>${meusContratos.slice().sort((a,b)=> String(b.dataAssinatura||'').localeCompare(String(a.dataAssinatura||''))).map(c=>`
          <tr style="border-top:1px solid #E4E1DA;">
            <td style="padding:7px 4px;font-weight:600;">${esc(c.servico||'—')}</td>
            <td style="padding:7px 4px;color:#6B6B75;">${esc(c.vendedor||'—')}</td>
            <td style="padding:7px 4px;color:#6B6B75;">${esc(c.etapa||'')}</td>
            <td style="padding:7px 4px;color:#6B6B75;white-space:nowrap;">assinado ${data(c.dataAssinatura)}</td>
            <td style="padding:7px 4px;text-align:right;font-weight:600;white-space:nowrap;">${dinheiro(c.valor)}</td>
          </tr>`).join('')}</tbody></table>` : vazio('Nenhum contrato ligado a este cliente.')}

      ${titulo(meusProcessos.length > 1 ? `Processos — ${meusProcessos.length} fichas separadas` : 'Processos')}
      ${meusProcessos.length > 1 ? `<div style="font-size:12px;color:#6B6B75;margin:-6px 0 10px;">
        São ${meusProcessos.length} fichas <b>diferentes</b> no quadro de Documentação, cada uma na sua etapa — não são as etapas por que um processo passou.</div>` : ''}
      ${meusProcessos.length ? meusProcessos.map(p=>{
        const total = (p.checklist||[]).length;
        const aprovados = (p.checklist||[]).filter(d=> d.status === 'Aprovado').length;
        const anexos = (p.anexos||[]).length;
        // O nome gravado NA FICHA, que nem sempre é o do cliente que se está
        // olhando: um processo preso ao contrato errado aparece aqui como se
        // fosse dele. Foi assim que o processo protocolado de um irmão passou
        // dias contando como processo do outro. Quando difere, a ficha grita.
        const doOutro = normal(p.clienteNome) && normal(p.clienteNome) !== normal(nomeAlvo);
        const ct = p.contratoId ? contratos.find(c=> String(c.id) === String(p.contratoId)) : null;
        return `<div style="border:1px solid ${doOutro ? '#D9A441' : '#E4E1DA'};border-radius:9px;padding:10px 12px;margin-bottom:8px;${doOutro ? 'background:#FDF8EC;' : ''}">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
            <b style="font-size:13px;">${esc(p.clienteNome || p.servico || 'Processo')}</b>
            ${pilula(p.status || 'sem status', '#16204F', '#EEF2FB')}
          </div>
          <div style="font-size:12px;color:#6B6B75;margin-top:5px;">
            ${esc(p.servico || '—')} · responsável: ${esc(p.responsavel || '—')} · documentos: ${aprovados}/${total} aprovados${anexos ? ' · ' + anexos + ' anexo(s)' : ''}
            ${p.protocolo && p.protocolo.recibo ? ' · recibo ' + esc(p.protocolo.recibo) : ''}
            ${p.uscis && p.uscis.status ? '<br>USCIS: ' + esc(p.uscis.status) : ''}
            <br>${ct ? `veio do contrato de ${dinheiro(ct.valor)} · ${esc(ct.etapa || 'sem etapa')}` : 'sem contrato ligado'}
          </div>
          ${doOutro ? `<div style="font-size:12px;color:#8A6410;margin-top:6px;font-weight:600;">
            ⚠️ Esta ficha está gravada no nome de <b>${esc(p.clienteNome)}</b>. Ela aparece aqui porque está presa ao contrato acima — confira se o contrato é da pessoa certa.</div>` : ''}
          </div>`; }).join('') : vazio('Nenhum processo aberto para este cliente.')}

      ${titulo('Extrato — todas as parcelas')}
      ${vivas.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="text-align:left;color:#6B6B75;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;">
          <th style="padding:5px 4px;">Parcela</th><th style="padding:5px 4px;">Vence</th>
          <th style="padding:5px 4px;">Situação</th>
          <th style="padding:5px 4px;text-align:right;">Valor</th>
          <th style="padding:5px 4px;text-align:right;">Recebido</th></tr></thead>
        <tbody>${vivas.slice().sort(porVenc).map(f=>`
          <tr style="border-top:1px solid #E4E1DA;">
            <td style="padding:6px 4px;">${esc(f.descricao || 'Parcela')}</td>
            <td style="padding:6px 4px;color:#6B6B75;white-space:nowrap;">${data(f.vencimento)}</td>
            <td style="padding:6px 4px;">${statusParcela(f)}</td>
            <td style="padding:6px 4px;text-align:right;white-space:nowrap;">${dinheiro(f.valor)}</td>
            <td style="padding:6px 4px;text-align:right;white-space:nowrap;color:${Number(f.valorRecebido||0) > 0 ? '#1E6B43' : '#6B6B75'};">${Number(f.valorRecebido||0) > 0 ? dinheiro(f.valorRecebido) : '—'}</td>
          </tr>`).join('')}</tbody></table>` : vazio('Nenhuma parcela lançada.')}
      ${minhasParcelas.length !== vivas.length ? `<div style="font-size:11.5px;color:#6B6B75;margin-top:6px;">${minhasParcelas.length - vivas.length} parcela(s) cancelada(s) não entram nas contas acima.</div>` : ''}`;

    fundo.querySelector('#lw-fc-corpo').innerHTML = miolo;
    fundo.querySelector('#lw-fc-nome').textContent = nomeAlvo || 'Ficha do cliente';
    fundo.querySelector('#lw-fc-sub').textContent = [
      cli && cli.telefone, cli && cli.email,
      meusContratos.length + ' contrato(s)', meusProcessos.length + ' processo(s)',
    ].filter(Boolean).join(' · ');
  };

  // O status do processo de cada contrato, pelo id do contrato. Lido aqui e não
  // recebido de fora porque o Dashboard e o Financeiro chamam esta janela sem
  // ter os processos à mão — e quem olha "contratos assinados" quer saber em
  // que pé cada um está, não só que foi assinado.
  let statusPorContrato = null;
  const carregarStatusDosProcessos = async ()=>{
    if(statusPorContrato) return statusPorContrato;
    statusPorContrato = new Map();
    try{
      const r = await window.storage.get('legalway-processos-documentacao-v1', true);
      const ps = r && r.value ? JSON.parse(r.value) : [];
      (Array.isArray(ps) ? ps : []).forEach(p=>{ if(p && p.contratoId) statusPorContrato.set(String(p.contratoId), p.status || ''); });
    }catch(e){ /* sem acesso à Documentação: a coluna fica vazia, a janela continua */ }
    return statusPorContrato;
  };

  // `acao` é opcional: {rotulo, quando(c), ao(c)} acrescenta uma coluna com um
// botão por linha. Nasceu para "Reativar" nos contratos cancelados, sem
// obrigar quem só quer ver a lista a carregar nada disso.
  window.LW.listaDeContratos = (titulo, lista, aviso, acao)=>{
    if(!lista || !lista.length) return;
    const esc = v => LW.escaparHtml(String(v ?? ''));
    const dinheiro = v => 'US$ ' + Number(v||0).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
    const data = v => { if(!v) return '—'; const d = new Date(String(v).length <= 10 ? v + 'T12:00:00' : v);
      return isNaN(d) ? String(v).slice(0,10) : d.toLocaleDateString('pt-BR'); };
    const nomeDe = c => String(c.vendedor||'').trim() || 'sem vendedor';

    const porVendedor = {};
    lista.forEach(c => { const v = nomeDe(c); porVendedor[v] = porVendedor[v] || {n:0, valor:0};
      porVendedor[v].n++; porVendedor[v].valor += Number(c.valor||0); });
    const ranking = Object.entries(porVendedor).sort((a,b)=> b[1].valor - a[1].valor);
    const total = lista.reduce((s,c)=> s + Number(c.valor||0), 0);

    document.getElementById('lw-lista-contratos')?.remove();
    const modal = document.createElement('div');
    modal.id = 'lw-lista-contratos';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:2200;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:22px 24px;width:700px;max-width:94vw;max-height:88vh;overflow:auto;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);">
        <div style="font-family:'Fraunces',serif;font-size:18px;color:#16204F;">${esc(titulo)}</div>
        <div style="font-size:12px;color:#6B6B75;margin:2px 0 14px;">${lista.length} contrato${lista.length===1?'':'s'} · ${dinheiro(total)}</div>
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6B6B75;font-weight:700;margin-bottom:6px;">Por vendedor <span style="font-weight:400;text-transform:none;letter-spacing:0;">— clique para filtrar</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          ${ranking.map(([v,d])=>`
            <div class="lw-vend" data-vend="${esc(v)}" title="Ver só os contratos de ${esc(v)}"
              style="background:#ECEEF1;border-radius:7px;padding:8px 12px;min-width:132px;cursor:pointer;border:1px solid transparent;">
              <div style="font-size:12.5px;font-weight:600;">${esc(v)}</div>
              <div style="font-size:11.5px;color:#6B6B75;">${d.n} contrato${d.n===1?'':'s'} · ${dinheiro(d.valor)}</div>
            </div>`).join('')}
        </div>
        ${aviso ? `<div style="font-size:12px;color:#6B6B75;line-height:1.5;background:#ECEEF1;border-radius:8px;padding:8px 11px;margin-bottom:10px;">${esc(aviso)}</div>` : ''}
        <div style="font-size:11.5px;color:#6B6B75;margin-bottom:6px;">Clique num cliente para abrir a ficha completa dele.</div>
        <div id="lw-lc-aviso" style="font-size:11.5px;color:#6B6B75;margin-bottom:8px;"></div>
        <div style="max-height:44vh;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr style="text-align:left;color:#6B6B75;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">
              <th style="padding:6px 4px;">Cliente</th><th style="padding:6px 4px;">Serviço</th>
              <th style="padding:6px 4px;">Vendedor</th><th style="padding:6px 4px;">Status</th>
              <th style="padding:6px 4px;">Assinado</th>
              <th style="padding:6px 4px;text-align:right;">Valor</th>
              ${acao ? '<th style="padding:6px 4px;"></th>' : ''}</tr></thead>
            <tbody id="lw-lc-corpo"></tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <span style="display:flex;gap:8px;">${LW.botoesDeExportar('lw-lc')}</span>
          <button id="lw-lc-fechar" style="font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Exporta o que está na tela, não a lista inteira: se ela filtrou por um
    // vendedor, o arquivo é daquele vendedor. Exportar outra coisa do que se vê
    // é a forma mais rápida de alguém mandar o número errado para fora.
    LW.ligarExportar(modal, 'lw-lc', ()=>{
      const visiveis = (filtro ? lista.filter(c => nomeDe(c) === filtro) : lista).slice().sort(porData);
      const soma = visiveis.reduce((s,c)=> s + Number(c.valor||0), 0);
      return {
        titulo, subtitulo: filtro ? 'Vendedor: ' + filtro : 'Todos os vendedores',
        arquivo: titulo + (filtro ? ' - ' + filtro : ''),
        colunas: ['Cliente', 'Serviço', 'Vendedor', 'Status', 'Assinado', 'Valor'],
        linhas: visiveis.map(c => [c.cliente || '', c.servico || '', String(c.vendedor||'').trim() || '—',
          statusDe(c), data(c.dataAssinatura), dinheiro(c.valor)]),
        resumo: `${visiveis.length} contrato(s) · ${dinheiro(soma)}` + (aviso ? ' — ' + aviso : ''),
      };
    });

    // Clicar no mesmo vendedor desfaz o filtro: sem isso quem filtra fica preso e
    // precisa fechar a janela para ver todos de novo.
    let filtro = null;
    const porData = (a,b)=> String(b.dataAssinatura||'').localeCompare(String(a.dataAssinatura||''));
    // Contrato cancelado não tem processo, e contrato recém-assinado ainda não
    // virou um: os dois casos aparecem com o motivo, não em branco.
    const statusDe = (c)=>{
      if(c.etapa === 'Cancelado') return 'contrato cancelado';
      if(!statusPorContrato) return '…';
      return statusPorContrato.get(String(c.id)) || 'sem processo ainda';
    };
    const pintar = ()=>{
      const visiveis = (filtro ? lista.filter(c => nomeDe(c) === filtro) : lista).slice().sort(porData);
      modal.querySelector('#lw-lc-corpo').innerHTML = visiveis.map(c=>`
        <tr data-ficha="${esc(c.id)}" title="Abrir a ficha de ${esc(c.cliente)}" style="border-top:1px solid #E4E1DA;cursor:pointer;">
          <td style="padding:7px 4px;font-weight:600;">${esc(c.cliente)}</td>
          <td style="padding:7px 4px;color:#6B6B75;">${esc(c.servico||'')}</td>
          <td style="padding:7px 4px;color:#6B6B75;">${String(c.vendedor||'').trim() ? esc(c.vendedor) : '—'}</td>
          <td style="padding:7px 4px;color:#6B6B75;">${esc(statusDe(c))}</td>
          <td style="padding:7px 4px;color:#6B6B75;white-space:nowrap;">${data(c.dataAssinatura)}</td>
          <td style="padding:7px 4px;text-align:right;font-weight:600;white-space:nowrap;">${dinheiro(c.valor)}</td>
          ${acao ? `<td style="padding:7px 4px;text-align:right;">${(!acao.quando || acao.quando(c))
            ? `<button data-lc-acao="${esc(c.id)}" style="font-family:inherit;font-size:11.5px;padding:5px 10px;border:1px solid #E4E1DA;border-radius:7px;background:#fff;cursor:pointer;white-space:nowrap;">${esc(acao.rotulo)}</button>`
            : ''}</td>` : ''}
        </tr>`).join('');
      if(acao) modal.querySelectorAll('[data-lc-acao]').forEach(b=> b.addEventListener('click', (e)=>{
        e.stopPropagation();   // senão a linha abre a ficha do cliente por baixo
        const ct = lista.find(x=> String(x.id) === String(b.getAttribute('data-lc-acao')));
        modal.remove();
        if(ct) acao.ao(ct);
      }));
      // A linha leva para a ficha do cliente — a mesma que já existe em Clientes,
      // com Resumo, Financeiro, Processos, Documentos e Timeline. Quem abre
      // "contratos assinados" e vê um nome quer saber do cliente, não da linha.
      modal.querySelectorAll('[data-ficha]').forEach(tr=>{
        tr.addEventListener('mouseenter', ()=> tr.style.background = '#ECEEF1');
        tr.addEventListener('mouseleave', ()=> tr.style.background = '');
        tr.addEventListener('click', ()=>{
          const id = tr.getAttribute('data-ficha');
          const ct = lista.find(x=> String(x.id) === String(id));
          LW.fichaDoCliente({ contratoId: id, nome: ct && ct.cliente });
        });
      });
      modal.querySelectorAll('.lw-vend').forEach(el=>{
        const ativo = el.getAttribute('data-vend') === filtro;
        el.style.borderColor = ativo ? '#16204F' : 'transparent';
        el.style.background = ativo ? '#EEF2FB' : '#ECEEF1';
      });
      const soma = visiveis.reduce((s,c)=> s + Number(c.valor||0), 0);
      modal.querySelector('#lw-lc-aviso').innerHTML = filtro
        ? `Mostrando <b>${visiveis.length}</b> de ${lista.length} · ${dinheiro(soma)} — só de <b>${esc(filtro)}</b>. Clique no mesmo cartão para ver todos.`
        : '';
    };
    modal.querySelectorAll('.lw-vend').forEach(el=> el.addEventListener('click', ()=>{
      const v = el.getAttribute('data-vend');
      filtro = (filtro === v) ? null : v;
      pintar();
    }));
    pintar();
    carregarStatusDosProcessos().then(()=>{ if(document.getElementById('lw-lista-contratos')) pintar(); });
    modal.querySelector('#lw-lc-fechar').addEventListener('click', ()=> modal.remove());
    modal.addEventListener('click', (e)=>{ if(e.target === modal) modal.remove(); });
    const tecla = (e)=>{ if(e.key === 'Escape'){ modal.remove(); document.removeEventListener('keydown', tecla); } };
    document.addEventListener('keydown', tecla);
  };

  // Tabela simples e ordenável pra visão em lista. colunas: [{titulo, valor:(item)=>texto|html, ordenar:(item)=>chave}]
  window.LW.tabelaLista = (itens, colunas, aoClicar, estado)=>{
    estado = estado || (window.__lwOrdem = window.__lwOrdem || {});
    const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let lista = itens.slice();
    if(estado.col != null){ const c = colunas[estado.col]; const f = c.ordenar || c.valor; lista.sort((a,b)=>{ const x=f(a), y=f(b); return (x>y?1:x<y?-1:0) * (estado.desc?-1:1); }); }
    const t = document.createElement('table');
    t.style.cssText = 'width:100%;border-collapse:collapse;background:#fff;border:1px solid #E4E1DA;border-radius:12px;overflow:hidden;font-size:12.5px;';
    t.innerHTML = `<thead><tr>${colunas.map((c,i)=>`<th data-col="${i}" style="text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6B6B75;padding:10px;border-bottom:1px solid #E4E1DA;background:#F4F5F7;cursor:pointer;white-space:nowrap;">${esc(c.titulo)}${estado.col===i?(estado.desc?' ▼':' ▲'):''}</th>`).join('')}</tr></thead>
      <tbody>${lista.length ? lista.map((it,i)=>`<tr data-i="${i}" style="cursor:pointer;">${colunas.map(c=>`<td style="padding:9px 10px;border-bottom:1px solid #E4E1DA;vertical-align:middle;">${c.html ? c.html(it) : esc(c.valor(it))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${colunas.length}" style="padding:24px;text-align:center;color:#6B6B75;">Nada por aqui.</td></tr>`}</tbody>`;
    t.querySelectorAll('th').forEach(th=> th.addEventListener('click', ()=>{ const i = Number(th.getAttribute('data-col')); if(estado.col===i) estado.desc = !estado.desc; else { estado.col = i; estado.desc = false; } t.dispatchEvent(new CustomEvent('lw:reordenar', {bubbles:true})); }));
    t.querySelectorAll('tbody tr[data-i]').forEach(tr=> tr.addEventListener('click', ()=> aoClicar(lista[Number(tr.getAttribute('data-i'))])));
    return t;
  };
  // sessão da pessoa (o que login.html gravou); as funções comuns abaixo usam isto em vez da variável de cada tela
  // Quem tem acesso total. Usado para esconder o que cria dado de verdade só
  // para testar — esses botões existiam soltos nas telas, para qualquer um.
  window.LW.ehAdministrador = ()=>{
    try{ const se = window.LW.sessaoAtual(); return !!(se && se.acessoTotal); }catch(e){ return false; }
  };

  window.LW.sessaoAtual = ()=>{ try{ const v = localStorage.getItem('legalway-sessao-v1'); return v ? JSON.parse(v) : null; }catch(e){ return null; } };
  // Confirmação simples, dentro da página. O confirm() do navegador congela a
  // aba inteira enquanto está aberto: ninguém mais mexe em nada, nem o próprio
  // sistema. Restaurando um backup que vem em doze arquivos, isso travava a
  // tela doze vezes. Este aqui é só um modal como os outros.
  // z-index 9000 nas quatro caixas de pergunta daqui para baixo. Elas são a
  // última palavra e precisam ficar acima de QUALQUER janela que as abriu. Em
  // 2000, a confirmação da unificação (janela em 2600) ficava atrás: dava para
  // ler o texto e ver o botão Confirmar através da camada translúcida, mas o
  // clique era interceptado pela janela de cima. A tela parecia travada, e não
  // havia nada a fazer além de recarregar.
  window.LW.confirmar = function(titulo, descricao){
    return new Promise((resolve)=>{
      const fundo = document.createElement('div');
      fundo.id = 'lw-confirmar';
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
      fundo.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:430px;width:100%;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);">
          <div id="lw-cf-titulo" style="font-family:'Fraunces',serif;font-size:17px;color:#16204F;margin-bottom:6px;"></div>
          <div id="lw-cf-desc" style="font-size:13.5px;line-height:1.5;color:#1B1B1F;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button id="lw-cf-nao" style="font-family:inherit;font-size:13px;padding:9px 14px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">Cancelar</button>
            <button id="lw-cf-sim" style="font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;">Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(fundo);
      fundo.querySelector('#lw-cf-titulo').textContent = titulo;
      fundo.querySelector('#lw-cf-desc').textContent = descricao || '';
      const fechar = (v)=>{ fundo.remove(); document.removeEventListener('keydown', tecla); resolve(v); };
      const tecla = (e)=>{ if(e.key === 'Escape') fechar(false); if(e.key === 'Enter') fechar(true); };
      document.addEventListener('keydown', tecla);
      fundo.querySelector('#lw-cf-nao').addEventListener('click', ()=> fechar(false));
      fundo.querySelector('#lw-cf-sim').addEventListener('click', ()=> fechar(true));
      setTimeout(()=> fundo.querySelector('#lw-cf-sim').focus(), 50);
    });
  };
  // Pedir um texto, dentro da página. Mesmo motivo do confirmar acima: o
  // prompt() do navegador congela a aba, e em alguns navegadores já nem
  // aparece. Devolve o texto já sem espaços nas pontas, ou null se cancelar.
  // Escolher um motivo de uma lista, com "Outro" abrindo um campo livre.
  // Lista pura engessa; campo livre puro vira trinta jeitos de escrever a mesma
  // coisa e nenhum relatório que preste. Devolve o texto escolhido, ou null se
  // ela desistir.
  // Dois telefones são da mesma pessoa? Comparar o TEXTO não serve:
  // "+1 407 555 0110", "(407) 555-0110" e "4075550110" são o mesmo número, e
  // já custaram comissão de SDR não paga e ficha de cliente não encontrada.
  // Oito dígitos no fim: o bastante para identificar, e tolerante ao código do
  // país estar ou não escrito.
  // Dinheiro em centavos inteiros, para somar e comparar.
  //
  // 4,56 + 1,23 dá 5.789999999999999 em ponto flutuante — e uma parcela de
  // 5,79 paga em duas vezes ficava "Pago parcialmente" PARA SEMPRE, devendo um
  // milionésimo de centavo e aparecendo na inadimplência. Some e compare
  // sempre em centavos; só volte a reais na hora de mostrar.
  window.LW.centavos = (v)=> Math.round((Number(v) || 0) * 100);
  window.LW.reais = (c)=> Math.round(Number(c) || 0) / 100;
  // Soma de valores em reais que devolve reais, sem arrastar o erro.
  window.LW.somarDinheiro = (...vs)=> LW.reais(vs.reduce((s, v)=> s + LW.centavos(v), 0));

  // Quanto o CLIENTE pagou, e quanto ele ainda deve.
  //
  // Uma parcela de US$ 225 paga no cartão tem três números, todos guardados no
  // registro: o cliente pagou 225 (bruto), a operadora ficou com 8,03 (taxa) e
  // caíram 216,97 na conta (liquido). Perguntar "quanto ele pagou" e responder
  // com o que sobrou depois da taxa deixou nove contratos QUITADOS aparecendo
  // abaixo de 100% — o Thiago Cordeiro pagou os US$ 900 dele e o card dizia 98%.
  // A taxa é custo do escritório, não dívida do cliente.
  //
  // E valorRecebido não responde isso sozinho: a importação do Bling grava o
  // LÍQUIDO nele, o webhook do Stripe grava o BRUTO. Então valorRecebido aqui
  // só diz SE entrou algo; o quanto vem de bruto e liquido.
  //
  // O espelho vive em server/src/pagamento.js, e
  // server/testes/pago-pelo-cliente.test.js prova que os dois respondem igual.
  window.LW.pagoPeloCliente = function(c){
    const recebido = LW.centavos(c && c.valorRecebido);
    if(recebido <= 0) return 0;
    const liquido = LW.centavos(c && c.liquido);
    // bruto pode nao estar escrito: nesse caso ele E liquido + taxa, por
    // definicao, e so em ultimo caso o valor combinado da parcela.
    const bruto = LW.centavos(c && c.bruto)
      || (liquido > 0 && LW.centavos(c && c.taxa) > 0 ? liquido + LW.centavos(c && c.taxa) : 0)
      || LW.centavos(c && c.valor);
    // `bruto` MAIOR que o combinado não responde "quanto o cliente pagou".
    // Em produção, 70 parcelas de 7 contratos têm bruto diferente de valor; num
    // deles cada parcela tem bruto 500 e valor 360,55, e o cliente pagou
    // 360,55. Bruto MENOR continua valendo (operadora cobrou menos); só
    // o maior é recusado, e aí vale o que entrou. Espelho de pagamento.js.
    const combinado = LW.centavos(c && c.valor);
    if(combinado > 0 && bruto > combinado + 1) return LW.reais(recebido);
    // Só troca pelo bruto se a parcela foi paga INTEIRA, na convenção do Bling
    // (recebido == liquido) ou na do Stripe (recebido == bruto). Em pagamento
    // parcial o bruto é o total combinado, e aqui não se inventa rateio.
    const inteira = bruto > 0
      && (Math.abs(recebido - liquido) <= 1 || Math.abs(recebido - bruto) <= 1);
    return LW.reais(inteira ? bruto : recebido);
  };

  // Nunca negativo: quem pagou de mais não fica com saldo ao contrário, isso é
  // assunto de reembolso.
  window.LW.saldoDoCliente = function(c){
    return LW.reais(Math.max(0, LW.centavos(c && c.valor) - LW.centavos(LW.pagoPeloCliente(c))));
  };

  // A outra pergunta, a de caixa: quanto ENTROU na conta do escritório. Aqui o
  // líquido é que vale e a taxa fica fora.
  window.LW.entrouNaConta = function(c){
    const recebido = LW.centavos(c && c.valorRecebido);
    if(recebido <= 0) return 0;
    const bruto = LW.centavos(c && c.bruto);
    const liquido = LW.centavos(c && c.liquido);
    const pagaPeloBruto = bruto > 0 && liquido > 0 && Math.abs(recebido - bruto) <= 1;
    return LW.reais(pagaPeloBruto ? liquido : recebido);
  };

  // Os números de recibo do USCIS de um processo — no PLURAL.
  //
  // Um caso não tem um número só: o Visto T tem o I-914 (a petição) e o I-765
  // (a autorização de trabalho), cada um com andamento próprio no USCIS. O
  // sistema guardava UM campo e o escritório empilhava o resto dentro de
  // "Observações", onde nada é consultado e nada avisa quando muda.
  //
  // O campo antigo `protocolo.recibo` continua sendo lido e entra na lista:
  // nenhuma ficha precisa ser migrada.
  //
  // Espelho de server/src/recibos.js — recibos-do-processo.test.js prova que
  // os dois respondem igual.
  window.LW.RE_RECIBO = /^[A-Z]{3}\d{10}$/;
  window.LW.normalizarRecibo = (x)=> String(x == null ? '' : x).toUpperCase().replace(/[^A-Z0-9]/g, '');
  window.LW.reciboValido = (x)=> LW.RE_RECIBO.test(LW.normalizarRecibo(x));
  window.LW.recibosDoProcesso = function(p){
    const pr = (p && p.protocolo) || {};
    const out = [], vistos = new Set();
    const add = (form, numero)=>{
      const n = LW.normalizarRecibo(numero);
      if(!n || vistos.has(n)) return;
      vistos.add(n);
      out.push({ form: String(form == null ? '' : form).trim().toUpperCase(), numero: n });
    };
    for(const r of (Array.isArray(pr.recibos) ? pr.recibos : [])) if(r) add(r.form, r.numero);
    add('', pr.recibo);
    return out;
  };
  window.LW.rotuloDoRecibo = (r)=> (r && r.form ? r.form + ' ' + r.numero : (r && r.numero) || '');
  // Os formulários que este escritório protocola. É sugestão, não trava: o
  // campo aceita qualquer coisa, porque amanhã aparece um que não está aqui.
  window.LW.FORMULARIOS_USCIS = ['I-765','I-914','I-918','I-130','I-485','I-539',
    'I-589','I-751','I-821','I-131','I-129F','I-192','I-90','N-400'];

  // O status operacional do contrato: ATIVO, PAUSADO ou CANCELADO.
  //
  // Vem da FONTE OFICIAL, que é o próprio contrato — não da situação da ficha,
  // que é outra coisa (dá para ter ficha cancelada em contrato vivo). A pausa é
  // um estado declarado por quem pausou, com motivo e autor; não se deduz de
  // inadimplência.
  //
  // Espelho de server/src/status-contrato.js.
  window.LW.STATUS_CONTRATO = {
    ativo:     { chave:'ativo',     rotulo:'Ativo',     icone:'●' },
    pausado:   { chave:'pausado',   rotulo:'Pausado',   icone:'⏸' },
    cancelado: { chave:'cancelado', rotulo:'Cancelado', icone:'✖' },
  };
  window.LW.statusDoContrato = function(c){
    if(!c || typeof c !== 'object') return 'ativo';
    // Vem ANTES de cancelado: quem virou adicional não é contrato nenhum, nem
    // vivo nem cancelado. Espelho de server/src/status-contrato.js — e há teste
    // provando que os dois respondem igual.
    if(c.virouAdicionalDe) return 'adicional';
    if(String(c.etapa || '') === 'Cancelado') return 'cancelado';
    // Cancelado ganha da pausa: mostrar "pausado" num contrato cancelado
    // esconderia o fato mais importante.
    if(c.pausa && typeof c.pausa === 'object') return 'pausado';
    return 'ativo';
  };
  // Conta como contrato — em total, faturamento, assinados, cancelados?
  // Quem virou adicional responde NÃO a todas: o dinheiro dele já está contado
  // na parcela que passou para o contrato de verdade.
  window.LW.contaComoContrato = function(c){ return LW.statusDoContrato(c) !== 'adicional'; };
  window.LW.motivoDoStatus = function(c){
    const st = LW.statusDoContrato(c);
    if(st === 'pausado') return String((c.pausa && c.pausa.motivo) || '').trim();
    // O campo que a tela de Contratos GRAVA chama-se `canceladoMotivo`; aqui se
    // lia `motivoCancelamento`. Nomes trocados, e por isso o motivo do
    // cancelamento — que o sistema passou a exigir de quem cancela — nunca
    // aparecia em lugar nenhum. Lê os dois: os registros antigos podem ter
    // qualquer um dos dois nomes, e nenhum deles vai ser reescrito só por isso.
    if(st === 'cancelado') return String((c && (c.canceladoMotivo || c.motivoCancelamento)) || '').trim();
    if(st === 'adicional') return String((c && c.virouAdicionalMotivo) || '').trim();
    return '';
  };
  window.LW.noFunilDeDocumentos = (c)=> LW.statusDoContrato(c) !== 'cancelado';
  window.LW.noContasAReceber = (c)=> LW.statusDoContrato(c) === 'ativo';

  // O número que a gente fala em voz alta: CL-0001, PR-0001, CT-0001, PC-0001.
  //
  // `cbrsdlduk74ur` serve ao banco e não serve a ninguém — não dá para ditar no
  // telefone nem anotar num papel. O código entra ao lado do id, nunca no
  // lugar dele: os vínculos entre blocos são todos por id.
  //
  // O campo se chama `codigo` e não `numero` porque `numero` já é o da parcela,
  // o do protocolo e o do telefone do setor.
  //
  // Espelho de server/src/numeracao.js. Quem DÁ os números é a automação do
  // servidor; aqui só se lê e se procura.
  window.LW.PREFIXO_CODIGO = { cliente:'CL', proposta:'PR', contrato:'CT', processo:'PC' };
  window.LW.formatarCodigo = function(tipo, n){
    const p = LW.PREFIXO_CODIGO[tipo];
    if(!p || !Number.isFinite(Number(n)) || Number(n) < 1) return '';
    return p + '-' + String(Math.floor(Number(n))).padStart(4, '0');
  };
  window.LW.numeroDoCodigo = function(codigo){
    const m = /^([A-Z]{2})-(\d+)$/.exec(String(codigo || '').trim().toUpperCase());
    return m ? Number(m[2]) : 0;
  };
  window.LW.codigoDe = (r)=> (r && typeof r.codigo === 'string' && LW.numeroDoCodigo(r.codigo)) ? r.codigo : '';
  // Procurar por "CT-42", "ct42" ou "42" tem que achar o CT-0042: ninguém
  // digita os zeros, e metade das pessoas não digita o traço.
  window.LW.casaCodigo = function(registro, busca){
    const c = LW.codigoDe(registro);
    if(!c) return false;
    const q = String(busca || '').trim().toUpperCase().replace(/[\s-]/g, '');
    if(!q) return false;
    const n = LW.numeroDoCodigo(c);
    const pre = c.slice(0, 2);
    // Com prefixo: tem que ser o MESMO prefixo. Procurar "CL-42" não pode
    // trazer o contrato CT-0042 — são coisas diferentes com o mesmo número.
    const comPrefixo = /^([A-Z]{2})(\d+)$/.exec(q);
    if(comPrefixo) return comPrefixo[1] === pre && Number(comPrefixo[2]) === n;
    // Só dígitos: "42", "0042" e "00042" são o mesmo número.
    if(/^\d+$/.test(q)) return Number(q) === n;
    return false;
  };

  window.LW.fimDoTelefone = (t)=>{ const d = String(t ?? '').replace(/\D/g,''); return d.length >= 8 ? d.slice(-8) : ''; };
  window.LW.mesmoTelefone = (a, b)=>{ const x = LW.fimDoTelefone(a); return !!x && x === LW.fimDoTelefone(b); };

  window.LW.escolherComTexto = function(titulo, descricao, opcoes){
    return new Promise((resolve)=>{
      const fundo = document.createElement('div');
      fundo.id = 'lw-escolher';
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
      const esc = (v)=> String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      fundo.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:460px;width:100%;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);">
          <div style="font-family:'Fraunces',serif;font-size:17px;color:#16204F;margin-bottom:6px;">${esc(titulo)}</div>
          <div style="font-size:13px;color:#6B6B75;line-height:1.5;margin-bottom:12px;">${esc(descricao||'')}</div>
          <div id="lw-ec-lista">
            ${(opcoes||[]).map((o,i)=>`<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;padding:6px 0;cursor:pointer;">
              <input type="radio" name="lw-ec" value="${esc(o)}" ${i===0?'checked':''} style="width:auto;margin:0;">${esc(o)}</label>`).join('')}
          </div>
          <input id="lw-ec-outro" placeholder="Qual?" style="display:none;width:100%;margin-top:8px;font-family:inherit;font-size:13.5px;padding:9px 11px;border:1px solid #E4E1DA;border-radius:9px;">
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
            <button id="lw-ec-nao" style="font-family:inherit;font-size:13px;padding:8px 16px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">Cancelar</button>
            <button id="lw-ec-sim" style="font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;">Continuar</button>
          </div>
        </div>`;
      document.body.appendChild(fundo);
      const campo = fundo.querySelector('#lw-ec-outro');
      const marcado = ()=> (fundo.querySelector('input[name=lw-ec]:checked') || {}).value || '';
      const ehOutro = ()=> /^outro/i.test(marcado());
      const atualizar = ()=>{ campo.style.display = ehOutro() ? 'block' : 'none'; if(ehOutro()) campo.focus(); };
      fundo.querySelectorAll('input[name=lw-ec]').forEach(r=> r.addEventListener('change', atualizar));
      const fechar = (v)=>{ fundo.remove(); document.removeEventListener('keydown', tecla); resolve(v); };
      const tecla = (e)=>{ if(e.key === 'Escape') fechar(null); };
      document.addEventListener('keydown', tecla);
      fundo.querySelector('#lw-ec-nao').addEventListener('click', ()=> fechar(null));
      fundo.querySelector('#lw-ec-sim').addEventListener('click', ()=>{
        // "Outro" sem explicar não é motivo — é o mesmo vazio de antes.
        if(ehOutro()){
          const t = (campo.value||'').trim();
          if(!t){ campo.style.borderColor = '#B4454B'; campo.focus(); return; }
          return fechar(t);
        }
        fechar(marcado());
      });
      atualizar();
    });
  };

  window.LW.pedirTexto = function(titulo, descricao, valorInicial){
    return new Promise((resolve)=>{
      const fundo = document.createElement('div');
      fundo.id = 'lw-pedir-texto';
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
      fundo.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:470px;width:100%;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);">
          <div id="lw-pt-titulo" style="font-family:'Fraunces',serif;font-size:17px;color:#16204F;margin-bottom:6px;"></div>
          <div id="lw-pt-desc" style="font-size:13.5px;line-height:1.5;color:#1B1B1F;margin-bottom:12px;"></div>
          <input id="lw-pt-campo" type="text" style="font-family:inherit;font-size:14px;padding:10px 12px;width:100%;box-sizing:border-box;border:1px solid #E4E1DA;border-radius:9px;">
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button id="lw-pt-nao" style="font-family:inherit;font-size:13px;padding:9px 14px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">Cancelar</button>
            <button id="lw-pt-sim" style="font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;">Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(fundo);
      fundo.querySelector('#lw-pt-titulo').textContent = titulo;
      const desc = fundo.querySelector('#lw-pt-desc');
      desc.textContent = descricao || '';
      if(!descricao) desc.style.display = 'none';
      const campo = fundo.querySelector('#lw-pt-campo');
      campo.value = valorInicial || '';
      const fechar = (v)=>{ fundo.remove(); document.removeEventListener('keydown', tecla); resolve(v); };
      const confirmar = ()=>{ const v = campo.value.trim(); fechar(v || null); };
      const tecla = (e)=>{ if(e.key === 'Escape') fechar(null); };
      document.addEventListener('keydown', tecla);
      campo.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); confirmar(); } });
      fundo.querySelector('#lw-pt-nao').addEventListener('click', ()=> fechar(null));
      fundo.querySelector('#lw-pt-sim').addEventListener('click', confirmar);
      setTimeout(()=>{ campo.focus(); campo.select(); }, 50);
    });
  };
  // Igual ao pedirTexto, mas com área de texto: é para registrar uma conversa,
  // que não cabe numa linha. Usado quando o vendedor marca um follow-up como
  // feito — o que ele escreve aqui fica nas anotações do lead.
  // Devolve o texto, '' quando a pessoa confirmou sem escrever nada, e null
  // quando cancelou: são três respostas diferentes e quem chama precisa
  // distinguir "não quis anotar" de "desistiu de marcar".
  window.LW.pedirAnotacao = function(titulo, descricao, valorInicial, rotuloOk){
    return new Promise((resolve)=>{
      const fundo = document.createElement('div');
      fundo.id = 'lw-pedir-anotacao';
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
      fundo.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:500px;width:100%;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);">
          <div id="lw-pa-titulo" style="font-family:'Fraunces',serif;font-size:17px;color:#16204F;margin-bottom:6px;"></div>
          <div id="lw-pa-desc" style="font-size:13.5px;line-height:1.5;color:#6B6B75;margin-bottom:12px;"></div>
          <textarea id="lw-pa-campo" rows="5" style="font-family:inherit;font-size:14px;line-height:1.5;padding:10px 12px;width:100%;box-sizing:border-box;border:1px solid #E4E1DA;border-radius:9px;resize:vertical;"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button id="lw-pa-nao" style="font-family:inherit;font-size:13px;padding:9px 14px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">Cancelar</button>
            <button id="lw-pa-sim" style="font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;"></button>
          </div>
        </div>`;
      document.body.appendChild(fundo);
      fundo.querySelector('#lw-pa-titulo').textContent = titulo;
      const desc = fundo.querySelector('#lw-pa-desc');
      desc.textContent = descricao || '';
      if(!descricao) desc.style.display = 'none';
      fundo.querySelector('#lw-pa-sim').textContent = rotuloOk || 'Salvar';
      const campo = fundo.querySelector('#lw-pa-campo');
      campo.value = valorInicial || '';
      const fechar = (v)=>{ fundo.remove(); document.removeEventListener('keydown', tecla); resolve(v); };
      // Enter quebra linha aqui, de propósito: é texto de conversa. Quem quer
      // confirmar pelo teclado usa Ctrl/Cmd+Enter.
      const tecla = (e)=>{ if(e.key === 'Escape') fechar(null); };
      document.addEventListener('keydown', tecla);
      campo.addEventListener('keydown', e=>{
        if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); fechar(campo.value.trim()); }
      });
      fundo.querySelector('#lw-pa-nao').addEventListener('click', ()=> fechar(null));
      fundo.querySelector('#lw-pa-sim').addEventListener('click', ()=> fechar(campo.value.trim()));
      setTimeout(()=> campo.focus(), 50);
    });
  };

  // "Tem dependentes?" no momento em que o vendedor marca o lead como Ganho.
  // Pergunta em dois tempos: sim/não primeiro, e só então quantos — porque a
  // maioria não tem, e abrir um campo de número para todo mundo é atrito à toa.
  // Devolve 0 quando não tem, N quando tem, e null quando a pessoa cancelou.
  window.LW.perguntarDependentes = function(nomeCliente){
    return new Promise((resolve)=>{
      const fundo = document.createElement('div');
      fundo.id = 'lw-dependentes';
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
      fundo.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:440px;width:100%;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);">
          <div style="font-family:'Fraunces',serif;font-size:17px;color:#16204F;margin-bottom:6px;">Esse processo tem dependentes?</div>
          <div style="font-size:13.5px;line-height:1.5;color:#1B1B1F;" id="lw-dep-desc"></div>
          <div style="font-size:12px;line-height:1.5;color:#6B6B75;margin-top:8px;">Cada dependente recebe a própria lista de documentos no checklist. Dá para mudar depois, no card do processo.</div>
          <div id="lw-dep-quantos" style="display:none;margin-top:14px;">
            <label style="font-size:12.5px;color:#1B1B1F;display:block;margin-bottom:5px;">Quantos dependentes?</label>
            <input type="number" id="lw-dep-n" min="1" max="20" step="1" value="1"
              style="font-family:inherit;font-size:15px;padding:9px 12px;border:1px solid #E4E1DA;border-radius:9px;width:110px;">
            <div id="lw-dep-erro" style="font-size:12px;color:#A5402E;margin-top:6px;display:none;"></div>
          </div>
          <div style="font-size:12px;line-height:1.5;color:#6B6B75;margin-top:10px;padding-top:10px;border-top:1px solid #EFECE6;">
            Responder aqui marca <b>${nomeCliente ? '' : 'o lead '}</b>como <b>Ganho</b> e gera o contrato.
            Arrastou sem querer? <b>Cancelar</b> devolve o lead para onde estava.
          </div>
          <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:16px;">
            <button id="lw-dep-cancelar" style="font-family:inherit;font-size:13px;padding:9px 12px;border:none;background:none;color:#6B6B75;cursor:pointer;text-decoration:underline;">Cancelar</button>
            <div style="display:flex;gap:8px;">
            <button id="lw-dep-nao" style="font-family:inherit;font-size:13px;padding:9px 14px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">Não tem</button>
            <button id="lw-dep-sim" style="font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border:none;border-radius:9px;background:#16204F;color:#fff;cursor:pointer;">Tem dependentes</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(fundo);
      fundo.querySelector('#lw-dep-desc').textContent = nomeCliente
        ? nomeCliente + ' — cônjuge, filhos ou outro familiar que entra no mesmo pedido.'
        : 'Cônjuge, filhos ou outro familiar que entra no mesmo pedido.';
      const campo = fundo.querySelector('#lw-dep-n');
      const erro  = fundo.querySelector('#lw-dep-erro');
      let pedindoNumero = false;
      const fechar = (v)=>{ fundo.remove(); document.removeEventListener('keydown', tecla); resolve(v); };
      const confirmar = ()=>{
        if(!pedindoNumero){                       // primeiro clique: revela o campo
          pedindoNumero = true;
          fundo.querySelector('#lw-dep-quantos').style.display = 'block';
          fundo.querySelector('#lw-dep-sim').textContent = 'Confirmar';
          campo.focus(); campo.select();
          return;
        }
        const n = Math.floor(Number(campo.value));
        if(!Number.isFinite(n) || n < 1 || n > 20){
          erro.textContent = 'Informe um número de 1 a 20.';
          erro.style.display = 'block'; campo.focus(); return;
        }
        fechar(n);
      };
      const tecla = (e)=>{ if(e.key === 'Escape') fechar(null); if(e.key === 'Enter') confirmar(); };
      document.addEventListener('keydown', tecla);
      // Antes as duas saídas visíveis levavam o lead para Ganho: quem arrastasse por
      // engano não tinha porta de volta, a não ser adivinhar a tecla Escape.
      fundo.querySelector('#lw-dep-cancelar').addEventListener('click', ()=> fechar(null));
      fundo.addEventListener('mousedown', (e)=>{ if(e.target === fundo) fechar(null); });
      fundo.querySelector('#lw-dep-nao').addEventListener('click', ()=> fechar(0));
      fundo.querySelector('#lw-dep-sim').addEventListener('click', confirmar);
      setTimeout(()=> fundo.querySelector('#lw-dep-nao').focus(), 50);
    });
  };

  window.LW.confirmarComSenha = function(descricao){
    return new Promise((resolve)=>{
      const fundo = document.createElement('div');
      fundo.id = 'lw-confirmar-senha';
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
      fundo.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:420px;width:100%;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35);">
          <div style="font-family:'Fraunces',serif;font-size:17px;color:#16204F;margin-bottom:6px;">⚠️ Confirmar ação sem volta</div>
          <div id="lw-conf-desc" style="font-size:13.5px;line-height:1.5;color:#1B1B1F;margin-bottom:14px;"></div>
          <div style="font-size:12px;color:#6B6B75;margin-bottom:6px;">Digite <b>sua senha</b> pra confirmar. Fica registrado no histórico quem fez isso.</div>
          <input id="lw-conf-senha" type="password" autocomplete="current-password" placeholder="Sua senha" style="width:100%;padding:11px 12px;border:1px solid #E4E1DA;border-radius:9px;font-size:14px;font-family:inherit;">
          <div id="lw-conf-erro" style="font-size:12px;color:#A5402E;min-height:16px;margin-top:6px;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
            <button id="lw-conf-cancelar" style="font-family:inherit;font-size:13px;padding:9px 14px;border:1px solid #E4E1DA;border-radius:9px;background:#fff;cursor:pointer;">Voltar</button>
            <button id="lw-conf-ok" style="font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border:none;border-radius:9px;background:#A5402E;color:#fff;cursor:pointer;">Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(fundo);
      fundo.querySelector('#lw-conf-desc').textContent = descricao;
      const inp = fundo.querySelector('#lw-conf-senha'); const erro = fundo.querySelector('#lw-conf-erro'); const ok = fundo.querySelector('#lw-conf-ok');
      const fechar = (v)=>{ fundo.remove(); resolve(v); };
      fundo.querySelector('#lw-conf-cancelar').addEventListener('click', ()=> fechar(false));
      inp.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') ok.click(); if(e.key === 'Escape') fechar(false); });
      ok.addEventListener('click', async ()=>{
        if(!inp.value){ erro.textContent = 'Digite sua senha.'; return; }
        ok.disabled = true; erro.textContent = '';
        try{
          const r = await fetch('/api/confirmar-senha', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({senha: inp.value, acao: descricao})});
          const d = await r.json().catch(()=>({}));
          if(!r.ok){ erro.textContent = d.erro || 'Não foi possível confirmar.'; ok.disabled = false; inp.select(); return; }
          fechar(true);
        }catch(e){ erro.textContent = 'Sem conexão com o servidor.'; ok.disabled = false; }
      });
      setTimeout(()=> inp.focus(), 50);
    });
  };
})();

// ============================================================================
// Funções que existiam copiadas em 13–16 telas (unificadas em 2026-09-17).
// Ficam globais de propósito: as telas chamam pelo nome, como antes.
// ============================================================================
const ICONS = {
  alvo:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  alta:'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  dinheiro:'<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  assinado:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>',
  media:'<line x1="6" y1="20" x2="6" y2="16"/><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/>',
  projecao:'<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  telefone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  relogio:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alerta:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  ok:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  recebido:'<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  leads:'<circle cx="9" cy="7" r="4"/><path d="M2 21c0-4.5 3.5-7 7-7s7 2.5 7 7"/><path d="M16 3.5c1.8.5 3 2 3 3.9s-1.2 3.4-3 3.9"/><path d="M23 21c0-3.5-1.8-5.7-4-6.6"/>',
  funil:'<path d="M4 4h16l-6 8v6l-4 2v-8L4 4z"/>',
  sdr:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  agenda:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  contratos:'<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 13h6M9 17h6M9 9h2"/>',
  clientes:'<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4.5 3.5-7 7-7s7 2.5 7 7"/><circle cx="17" cy="7" r="3"/><path d="M22 21c0-3.5-2-5.7-4.5-6.5"/>',
  financeiro:'<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M6 6V5a2 2 0 012-2h8a2 2 0 012 2v1"/>',
  documentos:'<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h4"/>',
  processos:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  tarefas:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>',
  marketing:'<path d="M3 11l18-7-7 18-3-8-8-3z"/>',
  relatorios:'<path d="M4 20V10M12 20V4M20 20v-7"/>',
  automacoes:'<path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 14.7 7.1 17.2l.9-5.5-4-3.9L9.5 7z"/>',
  usuarios:'<circle cx="9" cy="7" r="4"/><path d="M2 21c0-4.5 3.5-7 7-7s7 2.5 7 7"/><path d="M16 11l2 2 4-4"/>',
  config:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9c.4.4 1 .7 1.6.7H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'
};

// Exposto para as telas usarem o MESMO conjunto do menu — antes os cartões
// usavam emoji, o que destoava e dava cara de improviso.
window.LW = window.LW || {};
window.LW.icone = (nome, tam=15) => svgIcon(nome, tam);
function svgIcon(name, tam=16){ return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`; }

// Menu lateral (item ativo = página atual; some o que a pessoa não tem permissão de ver)
//
// `contadores` é opcional: um mapa de href -> número, para o selo ao lado do
// item (a Entrada de Leads mostra quantos leads estão sem responsável). Ele
// existe aqui porque a Entrada de Leads mantinha uma CÓPIA inteira deste menu
// só por causa desse selo — e a cópia envelheceu: ficou sem "Caixa de
// entrada", que entrou no menu depois.
function renderSidebar(contadores){
  const sessao = LW.sessaoAtual();
  const pagina = location.pathname.split('/').pop() || 'index.html';
  const items = [
    {label:'Dashboard', href:'index.html', icon:'dashboard', permKey:null},
    {label:'Entrada de Leads', href:'entrada-leads.html', icon:'leads', permKey:'leads'},
    {label:'Caixa de entrada', href:'caixa-entrada.html', icon:'leads', permKey:'leads'},
    {label:'Funil Comercial', href:'funil-comercial.html', icon:'funil', permKey:'funil'},
    {label:'SDR', href:'sdr.html', icon:'sdr', permKey:'sdr'},
    {label:'Agenda', href:'agenda.html', icon:'agenda', permKey:'agenda'},
    {label:'Contratos', href:'contratos.html', icon:'contratos', permKey:'contratos'},
    {label:'Clientes', href:'clientes.html', icon:'clientes', permKey:'clientes'},
    {label:'Financeiro', href:'financeiro.html', icon:'financeiro', permKey:'financeiro'},
    {label:'Documentação', href:'documentos.html', icon:'documentos', permKey:'documentos'},
    {label:'Processos', href:'processos.html', icon:'processos', permKey:'processos'},
    {label:'Tarefas', href:'tarefas.html', icon:'tarefas', permKey:'tarefas'},
    {label:'Marketing (Meta Ads)', href:'marketing.html', icon:'marketing', permKey:'marketing'},
    {label:'Relatórios', href:'relatorios.html', icon:'relatorios', permKey:'relatorios'},
    {label:'Automações', href:'automacoes.html', icon:'automacoes'},
    {label:'Usuários', href:'usuarios.html', icon:'usuarios', permKey:'usuarios'},
    {label:'Configurações', href:'configuracoes.html', icon:'config'},
  ];
  // Pedido dela: o BLING e a CONCILIAÇÃO DE FLUXO saíram desta lista. São telas
  // de conferência, de usar de vez em quando — não de trabalho do dia. No menu
  // competiam com as telas que a equipe usa o tempo todo.
  // As duas continuam no ar e abrem direto pelo endereço; só não aparecem na
  // lateral. O comentário fica FORA da lista de propósito: dentro dela, o nome
  // dos arquivos aqui faria o teste achar que elas voltaram ao menu.
  let vis = items;
  if(sessao && sessao.permissoes){ vis = items.filter(it => !it.permKey || sessao.permissoes[it.permKey] !== 'nenhum'); }
  const nav = document.getElementById('side-nav'); if(!nav) return;
  nav.innerHTML = vis.map(it=>{
    if(!it.href) return `<div class="side-link disabled">${svgIcon(it.icon)}<span>${it.label}</span><span class="side-soon">em breve</span></div>`;
    const n = contadores && contadores[it.href];
    return `<a class="side-link ${it.href===pagina?'active':''}" href="${it.href}">${svgIcon(it.icon)}<span>${it.label}</span>${n ? `<span class="badge">${n}</span>` : ''}</a>`;
  }).join('');
}

// Exposto com nome próprio para quem quiser chamar o menu sem depender de uma
// função global que a própria tela pode declarar por cima — foi o que
// aconteceu no Chat, que tinha um `renderSidebar` seu, com cinco links.
window.LW.menuLateral = renderSidebar;

function renderTopbarUser(){
  const sessao = LW.sessaoAtual();
  const nome = sessao ? sessao.nome : 'Visitante';
  const cargo = sessao ? sessao.cargo : 'Sem sessão — faça login';
  document.getElementById('user-name').textContent = nome;
  document.getElementById('user-role').textContent = cargo;
  document.getElementById('user-avatar').textContent = nome.slice(0,2).toUpperCase();
  // escolha de idioma (português, espanhol, inglês) dentro do menu do usuário
  const menu = document.getElementById('user-dropdown');
  if (menu && !document.getElementById('sel-idioma') && window.LW && LW.idiomas) {
    const linha = document.createElement('div');
    linha.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--line);margin-top:4px;';
    linha.innerHTML = '<span style="font-size:12.5px;color:var(--ink-soft);">Idioma</span>' +
      '<select id="sel-idioma" style="flex:1;font-size:12.5px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;font-family:inherit;">' +
      Object.entries(LW.idiomas).map(([k, nome]) => `<option value="${k}" ${LW.idioma() === k ? 'selected' : ''}>${nome}</option>`).join('') + '</select>';
    menu.appendChild(linha);
    linha.querySelector('select').addEventListener('change', (e) => LW.trocarIdioma(e.target.value));
  }
}

function aplicarSomenteLeitura(permKey){
  const sessao = LW.sessaoAtual();
  if(sessao && sessao.permissoes && sessao.permissoes[permKey] === 'visualizar'){
    document.body.classList.add('readonly-mode');
    if(!document.getElementById('faixa-readonly')){
      const faixa = document.createElement('div');
      faixa.id = 'faixa-readonly';
      faixa.className = 'faixa-somente-leitura';
      faixa.textContent = '👁 Modo visualização — sua permissão aqui é só de ver. Peça a alguém com acesso de edição pra fazer mudanças.';
      document.body.insertBefore(faixa, document.body.firstChild);
    }
  }
}

async function contarNaoLidasChat(){
  if(!LW.sessaoAtual()) return 0;
  try{ const r = await LW.api('/chat/nao-lidas', {semRedirecionar:true}); return r.total || 0; }catch(e){ return 0; }
}

async function atualizarBadgeChat(){
  // Aba escondida não precisa de contador. Esta chamada roda de 6 em 6
  // segundos em 15 telas e leva de 650 a 900ms cada — com duas ou três abas
  // abertas vira tráfego de fundo constante, e é parte do que faz o sistema
  // parecer lento. Ao voltar para a aba, atualiza na hora.
  if(document.hidden) return;
  const n = await contarNaoLidasChat();
  const el = document.getElementById('chat-badge');
  if(!el) return;
  if(n > 0){ el.textContent = n > 9 ? '9+' : n; el.style.display = 'flex'; }
  else { el.style.display = 'none'; }
}

// A rede: se o WebSocket cair, o número ainda se corrige sozinho, devagar.
// 90 segundos, e nunca com a aba escondida.
if(typeof window !== 'undefined'){
  setInterval(()=> { if(!document.hidden) atualizarBadgeChat(); }, 90000);
}

document.addEventListener('visibilitychange', ()=>{
  if(!document.hidden) atualizarBadgeChat();
});

// O CONTADOR DO CHAT SOBE PELO WEBSOCKET, não por pergunta ao servidor.
//
// Medido na produção em 30/10/2026: a consulta de "não lidas" faz varredura
// COMPLETA de chat_mensagens — 134.680 linhas, 12.193 blocos de disco, 33ms —
// e rodava a cada 6 segundos por aba visível, em 15 telas. Eram umas 200
// varreduras completas por minuto só para desenhar um número no canto. No log
// de segurança: 190.894 batidas de "excesso de pedidos" em /chat/nao-lidas,
// 94% de todos os eventos registrados.
//
// O WebSocket já carrega a mensagem. Quando chega, o número sobe sozinho.
if(window.LW && LW.tempoReal){
  LW.tempoReal((ev)=>{
    if(!ev || ev.tipo !== 'mensagem' || !ev.mensagem) return;
    const eu = (LW.sessaoLocal && LW.sessaoLocal()) || {};
    const de = ev.mensagem.deId || ev.mensagem.de_id;
    if(de && de === eu.usuarioId) return;                  // a própria não conta
    if(location.pathname.endsWith('chat.html')) return;    // lá já aparece na tela
    const el = document.getElementById('chat-badge');
    if(!el) return;
    const n = (parseInt(String(el.textContent).replace(/\D/g, ''), 10) || 0) + 1;
    el.textContent = n > 9 ? '9+' : String(n);
    el.style.display = 'flex';
  });
}

// ===== Lembretes que sobem no canto da tela =====
//
// "um popup que sempre vai subir uma notificacao para todo mundo quando tiver
// uma atividade, por exemplo; follow up agora, ligacao em 15 minutos, como se
// fosse lembretes, cliente assinou o contrato, (como se fosse antigamente do
// MSN que subia o popup no canto da tela)"
//
// Quem decide o que merece aviso é o servidor (`/api/lembretes`), que calcula
// uma vez e serve a todos. Aqui só mostra.
const LEMBRETES_VISTOS = 'legalway-lembretes-vistos';
const LEMBRETE_SEGUNDOS = 22;

// Os ids já mostrados ficam no navegador: recarregar a página não pode fazer o
// mesmo lembrete subir de novo. Guarda só os 60 últimos, senão a chave cresce
// para sempre.
function lembretesVistos(){
  try{ const v = localStorage.getItem(LEMBRETES_VISTOS); return new Set(v ? JSON.parse(v) : []); }
  catch(e){ return new Set(); }
}
function marcarLembreteVisto(id){
  try{
    const lista = [...lembretesVistos(), id].slice(-60);
    localStorage.setItem(LEMBRETES_VISTOS, JSON.stringify(lista));
  }catch(e){ /* aba privada ou armazenamento bloqueado: o aviso ainda aparece */ }
}

function pilhaDeLembretes(){
  let pilha = document.getElementById('lw-lembretes');
  if(!pilha){
    pilha = document.createElement('div');
    pilha.id = 'lw-lembretes';
    // 8000: acima do quadro, dos modais e do toast; abaixo das caixas de
    // pergunta (9000), que são a última palavra e não podem ser cobertas.
    pilha.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:8000;display:flex;'
      + 'flex-direction:column;gap:9px;align-items:flex-end;pointer-events:none;';
    document.body.appendChild(pilha);
  }
  return pilha;
}

function mostrarLembrete(l){
  const caixa = document.createElement('div');
  const cor = l.urgente ? '#8C2F39' : '#16204F';
  caixa.style.cssText = 'pointer-events:auto;background:#fff;border:1px solid #E4E1DA;border-left:4px solid '
    + cor + ';border-radius:11px;box-shadow:0 12px 34px rgba(0,0,0,.2);padding:12px 14px;width:290px;'
    + "font-family:'IBM Plex Sans',sans-serif;transform:translateY(12px);opacity:0;transition:transform .25s ease,opacity .25s ease;";
  const esc = (v)=> String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  caixa.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
    + '<div style="font-size:13px;font-weight:600;color:' + cor + ';">' + esc(l.titulo) + '</div>'
    + '<button class="lw-lembrete-x" aria-label="Fechar" style="border:none;background:none;cursor:pointer;'
    + 'color:#6B6B75;font-size:15px;line-height:1;padding:0 2px;">&times;</button></div>'
    + '<div style="font-size:12.5px;color:#1B1B1F;margin-top:3px;line-height:1.45;">' + esc(l.texto) + '</div>'
    + (l.link ? '<a href="' + esc(l.link) + '" style="display:inline-block;margin-top:8px;font-size:11.5px;'
        + 'color:#2C5AA8;text-decoration:none;font-weight:600;">abrir →</a>' : '');
  pilhaDeLembretes().appendChild(caixa);
  requestAnimationFrame(()=>{ caixa.style.transform = 'translateY(0)'; caixa.style.opacity = '1'; });

  let saindo = null;
  const sair = ()=>{
    if(saindo) return;
    saindo = true;
    caixa.style.transform = 'translateY(12px)';
    caixa.style.opacity = '0';
    setTimeout(()=> caixa.remove(), 260);
  };
  caixa.querySelector('.lw-lembrete-x').addEventListener('click', sair);
  // Compromisso que já está na hora não se apaga sozinho: é justamente o que
  // não pode passar batido.
  if(!l.urgente) setTimeout(sair, LEMBRETE_SEGUNDOS * 1000);
}

// `comPopup` separa as duas coisas que esta função alimenta. O SINO pode
// aparecer na hora: é um número no topo, não atrapalha. O POPUP não — abrir a
// tela já com uma caixa na frente atrapalha mais do que ajuda, e foi por isso
// que a primeira busca sempre esperou. Agora a primeira busca é cedo e SEM
// popup; a de 4 segundos é que começa a mostrar caixa.
async function buscarLembretes(comPopup = true){
  // Sem sessão não há o que lembrar, e a chamada daria 401 em ciclo.
  if(!LW.sessaoAtual()) return;
  try{
    const r = await LW.api('/lembretes');
    // O sino mostra a lista inteira, inclusive o que já subiu de popup: popup
    // é passageiro, sino é onde a pessoa volta para olhar.
    _sinoItens = (r.lembretes || []).filter(l => l && l.id);
    _sinoLigar(); _sinoRender();
    const vistos = lembretesVistos();
    for(const l of (r.lembretes || [])){
      if(!l || !l.id || vistos.has(l.id)) continue;
      // Sem popup ainda: NÃO marcar como visto, senão o aviso morre sem nunca
      // ter aparecido — some do popup e some da pilha de "não vistos".
      if(!comPopup) continue;
      marcarLembreteVisto(l.id);
      mostrarLembrete(l);
    }
  }catch(e){ /* servidor fora do ar ou sem permissão: o resto da tela segue */ }
}

/* ===================== O SININHO DO TOPO =========================
   Pedido dela (30/10/2026): "quando tem o @ tem que aparecer no sininho lá
   em cima, que alguém marcou".

   Antes o sino existia em DUAS telas e só a Dashboard tinha conta — leads sem
   contato, contratos sem assinatura e pedidos de ajuda. Menção não entrava,
   e clicar nele não abria nada.

   Agora o sino é daqui: come da mesma fonte dos lembretes (`/api/lembretes`,
   que o servidor já filtra por pessoa), soma o que a tela quiser acrescentar
   e abre a lista ao clicar. Uma tela só precisa ter o `#bell-badge` no HTML.
=================================================================== */
let _sinoItens = [], _sinoExtras = 0, _sinoAberto = false;

function _sinoEsc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

function _sinoPainel(){
  let el = document.getElementById('lw-sino-painel');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'lw-sino-painel';
  el.style.cssText = 'position:absolute;right:0;top:34px;width:min(330px,calc(100vw - 28px));'
    + 'background:#fff;border:1px solid #E4E1DA;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.18);'
    + "z-index:7000;display:none;overflow:hidden;font-family:'IBM Plex Sans',sans-serif;text-align:left;";
  return el;
}

function _sinoRender(){
  const badge = document.getElementById('bell-badge');
  if(!badge) return;
  const total = _sinoItens.length + _sinoExtras;
  badge.textContent = total;
  badge.style.display = total > 0 ? 'block' : 'none';

  const wrap = badge.closest('.bell-wrap') || badge.parentElement;
  if(!wrap) return;
  if(getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  const painel = _sinoPainel();
  if(painel.parentElement !== wrap) wrap.appendChild(painel);

  const mencoes = _sinoItens.filter(i => i.tipo === 'mencao');
  const resto = _sinoItens.filter(i => i.tipo !== 'mencao');
  const linha = (i) => '<a href="' + _sinoEsc(i.link || '#') + '" style="display:block;padding:10px 13px;'
    + 'border-bottom:1px solid #F0EEE9;text-decoration:none;color:#1B1B1F;">'
    + '<div style="font-size:12.5px;font-weight:600;color:' + (i.urgente ? '#8C2F39' : '#16204F') + ';">'
    + (i.tipo === 'mencao' ? '@ ' : '') + _sinoEsc(i.titulo) + '</div>'
    + '<div style="font-size:12px;color:#55555E;margin-top:2px;line-height:1.4;">' + _sinoEsc(i.texto) + '</div></a>';

  painel.innerHTML =
    '<div style="padding:11px 13px;border-bottom:1px solid #E4E1DA;font-size:12.5px;font-weight:700;color:#16204F;">'
    + 'Avisos' + (total ? ' (' + total + ')' : '') + '</div>'
    + (mencoes.length ? mencoes.map(linha).join('') : '')
    + (resto.length ? resto.map(linha).join('') : '')
    + (!_sinoItens.length
        ? '<div style="padding:14px 13px;font-size:12.5px;color:#6B6B75;">'
          + (_sinoExtras ? 'Nada marcado para você. O número vem de pendências desta tela.' : 'Nada por aqui agora.')
          + '</div>'
        : '');
}

// O sino só existia em duas telas (Dashboard e Entrada de Leads). Em vez de
// repetir o mesmo HTML em mais 26 arquivos — e ter de lembrar do 27º — ele
// nasce aqui, ao lado do ícone do chat, quando a tela não tem.
function _sinoGarantirHtml(){
  if(document.getElementById('bell-badge')) return;
  const chat = document.querySelector('a[href="chat.html"]');
  const topo = document.querySelector('.topbar-right, .topbar2 .topbar-right');
  if(!chat && !topo) return;

  // DOIS SINOS NO TOPO.
  //
  // A guarda acima procura o BADGE, não o sino. Cinco telas — Documentação,
  // Financeiro, Clientes, Contratos e SDR — já tinham no HTML um
  // `<div class="bell-wrap">` com o desenho do sino e sem badge nenhum: ele
  // não abria nada, era enfeite antigo. A guarda não via badge, criava o sino
  // de verdade ao lado, e ficavam dois.
  //
  // No computador passa por detalhe. Num telefone de 390px são 34px a menos
  // para o que importa, e a pessoa toca no errado.
  //
  // Em vez de criar outro, ADOTA o que já está lá: ganha o badge, o título e
  // o comportamento. Assim o HTML antigo das cinco telas vira o sino bom, sem
  // precisar mexer em cinco arquivos.
  const velho = document.querySelector('.bell-wrap:not(#bell-wrap)');
  if(velho && !velho.querySelector('#bell-badge')){
    velho.id = 'bell-wrap';
    velho.title = 'Avisos';
    velho.style.cssText = 'position:relative;cursor:pointer;display:flex;align-items:center;'
      + 'justify-content:center;width:34px;height:34px;';
    const b = document.createElement('span');
    b.className = 'bell-badge'; b.id = 'bell-badge'; b.textContent = '0';
    b.style.cssText = 'display:none;position:absolute;top:-3px;right:-4px;background:#8C2F39;'
      + 'color:#fff;font-size:10px;font-weight:700;border-radius:10px;padding:1px 5px;'
      + 'min-width:16px;text-align:center;line-height:1.5;';
    velho.appendChild(b);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'bell-wrap';
  wrap.id = 'bell-wrap';
  wrap.style.cssText = 'position:relative;cursor:pointer;display:flex;align-items:center;'
    + 'justify-content:center;width:34px;height:34px;margin-right:6px;';
  wrap.title = 'Avisos';
  wrap.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="1.7"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>'
    + '<path d="M13.7 21a2 2 0 01-3.4 0"/></svg>'
    + '<span class="bell-badge" id="bell-badge" style="display:none;position:absolute;top:-3px;right:-4px;'
    + 'background:#8C2F39;color:#fff;font-size:10px;font-weight:700;border-radius:10px;padding:1px 5px;'
    + 'min-width:16px;text-align:center;line-height:1.5;">0</span>';
  if(chat && chat.parentElement) chat.parentElement.insertBefore(wrap, chat);
  else topo.insertBefore(wrap, topo.firstChild);
}

function _sinoLigar(){
  _sinoGarantirHtml();
  const badge = document.getElementById('bell-badge');
  if(!badge || badge.dataset.lwLigado) return;
  badge.dataset.lwLigado = '1';
  const wrap = badge.closest('.bell-wrap') || badge.parentElement;
  if(!wrap) return;
  wrap.style.cursor = 'pointer';
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    _sinoAberto = !_sinoAberto;
    _sinoPainel().style.display = _sinoAberto ? 'block' : 'none';
  });
  // clicar fora fecha, como qualquer menu
  document.addEventListener('click', () => {
    if(!_sinoAberto) return;
    _sinoAberto = false;
    const p = document.getElementById('lw-sino-painel');
    if(p) p.style.display = 'none';
  });
}

/** A tela acrescenta o que só ela sabe contar (a Dashboard usa isto). */
window.LW.sinoExtras = function(n){ _sinoExtras = Number(n) || 0; _sinoRender(); };

// Chamado por todas as telas do sistema (está no comum.js justamente para não
// depender de cada tela lembrar). A primeira busca espera 4 segundos: abrir a
// tela já com um popup na frente atrapalha mais do que ajuda.
window.LW.ligarLembretes = function(){
  if(window.LW._lembretesLigados) return;
  window.LW._lembretesLigados = true;
  setTimeout(()=> buscarLembretes(false), 300);   // só o sino, sem caixa na frente
  setTimeout(()=> buscarLembretes(true), 4000);  // daqui em diante, com popup
  // Com a aba escondida não busca: ninguém vê popup de aba que não está à
  // vista, e do outro lado cada busca pode custar a releitura dos blocos de
  // agenda, contratos e processos (o servidor guarda 30 s). O `focus` logo
  // abaixo já traz tudo no instante em que a pessoa volta — que é quando ela
  // vai agir. Mesma regra do contador do chat.
  setInterval(()=> { if(!document.hidden) buscarLembretes(true); }, 60000);
  // e assim que a pessoa volta para a aba, porque é aí que ela vai agir
  window.addEventListener('focus', ()=> buscarLembretes(true));
};

function fmtTime(d){ return new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
// Data SEM hora: "2026-06-24" -> "24/06/2026".
//
// Não passa por new Date() de propósito. `new Date("2026-06-24")` é lido como
// meia-noite UTC e, exibido em Nova York (-4h), vira 23/06 às 20:00 — um dia
// ANTES. Era isso que fazia o extrato do cliente mostrar todos os vencimentos
// errados, com um "20:00" que não existe em campo de data.
//
// Vencimento, recebimento, protocolo e prazo são datas, não instantes. Use
// fmtTime só onde há hora de verdade (criadoEm, histórico).
function fmtDia(d){
  const s = String(d || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : (d ? String(d) : '');
}
// O dia do ESCRITÓRIO, não o do relógio UTC do navegador. Orlando está 4h
// atrás: a partir das 20h o UTC já virou o dia, e parcela que vence hoje
// aparecia como atrasada. Quem tem até o fim do dia para pagar não está
// devendo às 20h.
function hoje(){
  try{
    return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York',
      year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  }catch(e){ return new Date().toISOString().slice(0,10); }
}

// Gravar sem mentir.
//
// O storage.set tem um guardião certo: se a LEITURA de um bloco falhou nesta aba, ele
// se recusa a gravar, porque salvar com dados pela metade apagaria o que está no
// servidor. Ele lança um erro explicando isso.
//
// O problema era quem recebia o erro. Em 27 lugares o catch estava vazio: a gravação
// falhava, a tela dizia "cadastrado", o registro aparecia na lista — e ao recarregar
// tinha sumido. Foi assim que um lead cadastrado na Entrada desapareceu.
//
// Esta função é o único jeito certo de gravar: devolve null quando deu certo e a
// mensagem do erro quando não deu, e nesse caso põe uma faixa na tela que não sai.
// Quem chama decide o texto, mas não consegue mais fingir que gravou.
window.LW = window.LW || {};
window.LW.gravar = async function(chave, valor, compartilhado){
  try{
    await window.storage.set(chave, valor, compartilhado === undefined ? true : compartilhado);
    return null;
  }catch(e){
    const msg = (e && e.message) ? e.message : 'não consegui gravar';
    window.LW.avisarFalhaGravacao(chave, msg);
    return msg;
  }
};

window.LW.avisarFalhaGravacao = function(chave, msg){
  console.error('[gravação] falhou em "' + chave + '": ' + msg);
  let faixa = document.getElementById('faixa-falha-gravacao');
  if(!faixa){
    faixa = document.createElement('div');
    faixa.id = 'faixa-falha-gravacao';
    faixa.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:10000;background:#A5402E;'
      + 'color:#fff;padding:11px 16px;font:13px/1.45 system-ui,sans-serif;text-align:center;';
    (document.body || document.documentElement).appendChild(faixa);
  }
  faixa.textContent = '⚠ NÃO foi salvo. ' + msg + ' Recarregue a página e refaça — o que está na tela não está no servidor.';
};

// Aviso rápido no canto: fica 6 s (antes eram 3,6 s) e some ao clicar.
// `ms` permite segurar por mais tempo — usado no "Enviando…", que precisa ficar na tela até
// a gravação terminar de verdade.
function toast(msg, ms){
  let el = document.getElementById('toast');
  if(!el){ el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  el.style.cursor = 'pointer';
  el.onclick = ()=> el.classList.remove('show');
  clearTimeout(window._t);
  window._t = setTimeout(()=> el.classList.remove('show'), ms || 6000);
}

// ---- Busca global (⌘K / Ctrl+K, ou clique no campo do topo) ----
// Procura em clientes, leads, funil, contratos, processos, tarefas e agenda. Só vê o que a
// permissão da pessoa deixa: uma chave sem acesso simplesmente não entra no índice.
(function(){
  const FONTES = [
    { chave:'legalway-clientes-v1',                 tipo:'Cliente',   pagina:'clientes.html',        titulo:c=>c.nome,        sub:c=>c.telefone || c.email || '' },
    { chave:'legalway-funil-v1',                    tipo:'Lead',      pagina:'funil-comercial.html', titulo:l=>l.nome,        sub:l=>[l.servico, l.etapa, l.vendedor].filter(Boolean).join(' · ') },
    { chave:'legalway-leads-v1',                    tipo:'Lead novo', pagina:'entrada-leads.html',   titulo:l=>l.nome,        sub:l=>[l.servico, l.telefone].filter(Boolean).join(' · ') },
    { chave:'legalway-sdr-v1',                      tipo:'SDR',       pagina:'sdr.html',             titulo:l=>l.nome,        sub:l=>[l.servico, l.status].filter(Boolean).join(' · ') },
    { chave:'legalway-contratos-v1',                tipo:'Contrato',  pagina:'contratos.html',       titulo:c=>c.cliente,     sub:c=>[c.servico, c.etapa, c.valor ? 'US$ '+Number(c.valor).toLocaleString('en-US') : ''].filter(Boolean).join(' · ') },
    { chave:'legalway-processos-documentacao-v1',   tipo:'Processo',  pagina:'documentos.html',      titulo:p=>p.clienteNome, sub:p=>[p.servico, p.status, p.protocolo && p.protocolo.recibo].filter(Boolean).join(' · ') },
    { chave:'legalway-tarefas-v1',                  tipo:'Tarefa',    pagina:'tarefas.html',         titulo:t=>t.titulo,      sub:t=>[t.responsavel, t.prazo && ('prazo ' + t.prazo.split('-').reverse().join('/')), t.status].filter(Boolean).join(' · ') },
    { chave:'legalway-agenda-v1',                   tipo:'Compromisso', pagina:'agenda.html',        titulo:a=>a.cliente,     sub:a=>[a.tipo, a.data && a.data.split('-').reverse().join('/'), a.hora, a.vendedor].filter(Boolean).join(' · ') },
  ];
  let indice = null, carregando = null, sel = 0, resultados = [];

  const semAcento = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

  async function montarIndice(){
    if (indice) return indice;
    if (carregando) return carregando;
    carregando = (async ()=>{
      const itens = [];
      await Promise.all(FONTES.map(async f => {
        try{
          const r = await window.storage.get(f.chave, true);
          const lista = r && r.value ? JSON.parse(r.value) : [];
          if (!Array.isArray(lista)) return;
          lista.forEach(x => {
            const titulo = (f.titulo(x) || '').trim();
            if (!titulo) return;
            itens.push({ id:x.id, tipo:f.tipo, pagina:f.pagina, titulo, sub:(f.sub(x)||'').trim(),
              busca: semAcento([titulo, f.sub(x), x.telefone, x.email, x.servico, x.vinculo].filter(Boolean).join(' ')) });
          });
        }catch(e){ /* sem permissão nessa chave: não entra no índice */ }
      }));
      indice = itens; carregando = null; return itens;
    })();
    return carregando;
  }

  function caixa(){
    let box = document.getElementById('lw-busca');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'lw-busca';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(15,22,56,.45);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;';
    box.innerHTML = `
      <div style="background:#fff;width:min(620px,100%);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.28);overflow:hidden;font-family:inherit;">
        <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#E1DCD0);">
          <span style="opacity:.5;">🔎</span>
          <input id="lw-busca-input" placeholder="Buscar cliente, lead, contrato, processo, tarefa…" style="flex:1;border:none;outline:none;font-size:15px;font-family:inherit;background:transparent;color:var(--ink,#1B1B1F);">
          <span style="font-size:11px;color:var(--ink-soft,#6B6558);border:1px solid var(--line,#E1DCD0);border-radius:6px;padding:2px 6px;">esc</span>
        </div>
        <div id="lw-busca-res" style="max-height:52vh;overflow:auto;"></div>
        <div style="padding:8px 16px;border-top:1px solid var(--line,#E1DCD0);font-size:11.5px;color:var(--ink-soft,#6B6558);">↑ ↓ para navegar · Enter para abrir</div>
      </div>`;
    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box) fechar(); });
    const input = box.querySelector('#lw-busca-input');
    input.addEventListener('input', () => { sel = 0; render(input.value); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') return fechar();
      if (e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(sel+1, resultados.length-1); pintar(); }
      if (e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(sel-1, 0); pintar(); }
      if (e.key === 'Enter' && resultados[sel]) abrir(resultados[sel]);
    });
    return box;
  }

  function pintar(){
    const el = document.getElementById('lw-busca-res');
    [...el.querySelectorAll('[data-i]')].forEach((n,i) => n.style.background = i === sel ? 'var(--paper-dim,#ECEEF1)' : 'transparent');
    const ativo = el.querySelector(`[data-i="${sel}"]`);
    if (ativo) ativo.scrollIntoView({ block:'nearest' });
  }

  function render(termo){
    const el = document.getElementById('lw-busca-res');
    const t = semAcento(termo).trim();
    if (!t){ resultados = []; el.innerHTML = `<div style="padding:22px 18px;color:var(--ink-soft,#6B6558);font-size:13.5px;">Digite o nome de um cliente, o serviço, o número do recibo…</div>`; return; }
    resultados = (indice||[]).filter(x => x.busca.includes(t)).slice(0, 40);
    if (!resultados.length){ el.innerHTML = `<div style="padding:22px 18px;color:var(--ink-soft,#6B6558);font-size:13.5px;">Nada encontrado para “${termo}”.</div>`; return; }
    el.innerHTML = resultados.map((r,i) => `
      <div data-i="${i}" style="display:flex;align-items:center;gap:12px;padding:11px 16px;cursor:pointer;border-bottom:1px solid var(--line,#E1DCD0);">
        <span style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold,#86285F);min-width:74px;">${r.tipo}</span>
        <span style="flex:1;min-width:0;">
          <span style="display:block;font-size:14px;font-weight:600;color:var(--navy,#16204F);">${LW.escaparHtml(r.titulo)}</span>
          ${r.sub ? `<span style="display:block;font-size:12px;color:var(--ink-soft,#6B6558);">${LW.escaparHtml(r.sub)}</span>` : ''}
        </span>
      </div>`).join('');
    [...el.querySelectorAll('[data-i]')].forEach(n => n.addEventListener('click', () => abrir(resultados[Number(n.getAttribute('data-i'))])));
    pintar();
  }

  function abrir(r){
    if (!r) return;
    const atual = (location.pathname.split('/').pop() || 'index.html');
    fechar();
    if (atual === r.pagina && typeof window.openDrawer === 'function'){ try{ window.openDrawer(r.id); return; }catch(e){} }
    location.href = `${r.pagina}?abrir=${encodeURIComponent(r.id)}`;
  }

  function fechar(){ const b = document.getElementById('lw-busca'); if (b) b.style.display = 'none'; }
  async function abrirBusca(){
    const box = caixa();
    box.style.display = 'flex';
    const input = box.querySelector('#lw-busca-input');
    input.value = ''; sel = 0; render('');
    input.focus();
    await montarIndice();
    render(input.value);
  }
  window.LW = window.LW || {};
  window.LW.busca = abrirBusca;

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); abrirBusca(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.search-wrap input, .search-wrap').forEach(el => {
      el.addEventListener('focus', abrirBusca);
      el.addEventListener('click', abrirBusca);
      if (el.tagName === 'INPUT') el.readOnly = true; // o campo é só o gatilho; quem digita é o modal
    });
    // ?abrir=<id>&aba=<nome> — vindo da busca global, de um link do chat ou da
    // notificação de menção, que precisa cair na aba Anotações.
    //
    // Era um setTimeout de 900ms e pronto. Isso falha EM SILÊNCIO quando a tela
    // demora mais que isso para carregar os registros: a função existe, o id
    // ainda não está na lista, e a pessoa é largada no quadro sem entender por
    // quê. Agora insiste por alguns segundos e para assim que der certo — a
    // tela devolve `false` enquanto não achar o registro.
    const q = new URLSearchParams(location.search);
    const alvo = q.get('abrir');
    if (alvo) {
      const aba = q.get('aba');
      let tentativas = 0;
      const tentar = () => {
        for (const fn of ['openDrawer','abrirDetalhe','abrirModal','abrirFicha']){
          if (typeof window[fn] !== 'function') continue;
          try {
            if (window[fn](alvo, aba) !== false) {
              // Endereço limpo: recarregar não pode reabrir a mesma ficha para
              // sempre, e o id não precisa ficar na barra.
              try{ history.replaceState(null, '', location.pathname); }catch(e){}
              return;
            }
          } catch(e){ /* a tela ainda não está pronta; tenta de novo */ }
        }
        if (++tentativas < 20) setTimeout(tentar, 300);
      };
      setTimeout(tentar, 300);
    }


  // ---- Um jeito só de fechar -----------------------------------------------
  // Antes disto, fechar dependia da tela em que a pessoa estava: umas tinham
  // "Fechar" embaixo, outras "Cancelar", o Financeiro tinha um ✕ no topo, e
  // NENHUMA das 96 sobreposições fechava com Esc. Quem aprendia numa tela
  // desaprendia na outra — foi exatamente a queixa dela.
  //
  // A regra passa a ser uma só, nas 24 telas internas:
  //   · ✕ sempre no mesmo lugar, canto superior direito
  //   · Esc fecha a que está por cima
  //
  // Clique no fundo escuro NÃO fecha, de propósito: metade destas janelas é
  // formulário, e um clique torto apagaria o que a pessoa acabou de digitar.
  //
  // O ✕ e o Esc não fecham por conta própria: eles CLICAM no botão de fechar
  // que a tela já tem. Cada tela faz a sua limpeza ao fechar (zera seleção,
  // solta o registro que estava editando), e passar por cima disso deixaria
  // lixo para trás.
  // Um ✕ sozinho também é botão de fechar — o Financeiro já tem dois assim.
  // Sem reconhecê-los, o padrão injetaria um SEGUNDO ✕ ao lado do que já
  // existe, que é justamente o "às vezes nos dois lugares" da queixa.
  const RE_SO_FECHA = /^\s*(?:(?:✕|×|✖|←)\s*)?(?:fechar|cancelar|voltar)\s*$|^\s*[✕×✖]\s*$/i;
  const RE_SO_SIMBOLO = /^\s*[✕×✖]\s*$/;

  function botaoDeFechar(ov){
    const todos = ov.querySelectorAll('button, [role="button"]');
    for (const b of todos){
      if (b.hasAttribute('data-lw-x')) continue;
      if (RE_SO_FECHA.test(b.textContent || '')) return b;
    }
    return null;
  }

  function fecharSobreposicao(ov){
    const b = botaoDeFechar(ov);
    if (b) { b.click(); return true; }
    ov.classList.remove('show');
    return false;
  }

  function porOXis(ov){
    if (ov.querySelector(':scope [data-lw-x]')) return;
    // Já tem um ✕ próprio? Então não nasce outro: só vai para o lugar padrão,
    // para ficar no mesmo canto das outras telas.
    const proprio = botaoDeFechar(ov);
    if (proprio && RE_SO_SIMBOLO.test(proprio.textContent || '')) {
      proprio.style.position = 'absolute';
      proprio.style.top = '10px';
      proprio.style.right = '12px';
      if (!proprio.getAttribute('aria-label')) proprio.setAttribute('aria-label', 'Fechar');
      proprio.title = 'Fechar (Esc)';
      const dono = proprio.offsetParent || proprio.parentElement;
      if (dono && getComputedStyle(dono).position === 'static') dono.style.position = 'relative';
      return;
    }
    // No modal o ✕ vai na caixa branca; na gaveta, na própria gaveta.
    const caixa = ov.classList.contains('drawer') ? ov : (ov.querySelector('.modal-box') || ov);
    if (getComputedStyle(caixa).position === 'static') caixa.style.position = 'relative';
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-lw-x', '');
    b.setAttribute('aria-label', 'Fechar');
    b.title = 'Fechar (Esc)';
    b.textContent = '✕';
    b.style.cssText = 'position:absolute; top:10px; right:12px; z-index:6; border:none; background:none;'
      + 'font-size:16px; line-height:1; color:var(--ink-soft); cursor:pointer; padding:5px 7px; border-radius:7px;';
    b.addEventListener('mouseenter', ()=>{ b.style.background = 'var(--paper-dim)'; b.style.color = 'var(--ink)'; });
    b.addEventListener('mouseleave', ()=>{ b.style.background = 'none'; b.style.color = 'var(--ink-soft)'; });
    b.addEventListener('click', (e)=>{ e.stopPropagation(); fecharSobreposicao(ov); });
    caixa.appendChild(b);
  }

  function padronizarSobreposicoes(raiz){
    (raiz || document).querySelectorAll('.modal, .drawer').forEach(porOXis);
  }

  function ligarFechamentoPadrao(){
    padronizarSobreposicoes();
    // As telas criam janela depois, ao abrir um registro. Sem observar, essas
    // nasceriam sem o ✕ e o padrão valeria só para as que existem no HTML.
    if (window.MutationObserver){
      new MutationObserver((mudancas)=>{
        for (const m of mudancas){
          for (const no of m.addedNodes){
            if (no.nodeType !== 1) continue;
            if (no.matches && no.matches('.modal, .drawer')) porOXis(no);
            else padronizarSobreposicoes(no);
          }
        }
      }).observe(document.body, { childList:true, subtree:true });
    }
    // Esc em bolha, não em captura: componentes que já tratam Esc por conta
    // própria chamam stopPropagation na captura e continuam ganhando.
    document.addEventListener('keydown', (e)=>{
      if (e.key !== 'Escape') return;
      const abertas = document.querySelectorAll('.modal.show, .drawer.show');
      if (!abertas.length) return;
      fecharSobreposicao(abertas[abertas.length - 1]);
    });
  }


  // ---- O que as siglas querem dizer ---------------------------------------
  // Medido nas oito telas: USCIS aparece 77 vezes, I-797 e RFE 27 cada,
  // EB-2/NIW 39 — e NENHUMA com uma linha de explicação em lugar nenhum.
  //
  // Quem já trabalha com imigração não sente falta. Quem entra na equipe
  // semana que vem trava na primeira tela, e não tem a quem perguntar sem
  // interromper alguém.
  //
  // As explicações são curtas de propósito: cabem num balão ao passar o
  // mouse, e dizem o que a pessoa precisa para seguir trabalhando — não o que
  // está na lei.
  const GLOSSARIO = {
    'USCIS': 'O órgão de imigração dos Estados Unidos. É para ele que os processos são enviados.',
    'I-797': 'A carta que o USCIS manda confirmando que recebeu o caso. Traz o número do recibo.',
    'I-797C': 'A carta de aviso do USCIS — confirma recebimento, agenda biometria ou pede documento.',
    'RFE': 'Request for Evidence: o USCIS pediu documento ou explicação a mais antes de decidir.',
    'EB-2': 'Categoria de visto de trabalho para quem tem formação avançada ou habilidade excepcional.',
    'NIW': 'National Interest Waiver: dispensa a oferta de emprego quando o trabalho é de interesse nacional.',
    'I-765': 'Pedido de autorização de trabalho. É por este número que a autorização é consultada.',
    'I-914': 'Formulário do Visto T, preenchido pelo escritório — o cliente não tem o que mandar aqui.',
    'I-94': 'O registro de entrada e saída do país. Diz até quando a pessoa pode ficar.',
    'SEVIS': 'Taxa do sistema que registra estudantes estrangeiros. Paga ao governo, não ao escritório.',
    'DS-160': 'Formulário de solicitação de visto preenchido no site do consulado.',
    'AR-11': 'Aviso de mudança de endereço. Tem de ser enviado ao USCIS em até 10 dias da mudança.',
    'EOIR': 'A corte de imigração. Processos em corte seguem por ela, não pelo USCIS.',
    'Biometria': 'A coleta de digitais e foto marcada pelo USCIS. O cliente precisa comparecer na data.',
    'MOTION': 'Pedido formal para o USCIS reconsiderar ou reabrir uma decisão.',
  };

  // Marca as siglas no texto já desenhado. Roda depois de cada pintura de
  // tela, e é idempotente: sigla já marcada não é marcada de novo.
  const RE_SIGLAS = new RegExp(
    '(?<![\\\\w-])(' + Object.keys(GLOSSARIO)
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&'))
      .join('|') + ')(?![\\\\w-])', 'g');

  function explicarSiglas(raiz){
    const alvo = raiz || document.body;
    if(!alvo) return 0;
    // Só nós de texto, e nunca dentro de campo, botão ou do que já foi
    // marcado: mexer no texto de um <input> apagaria o que a pessoa digitou.
    const PROIBIDO = new Set(['SCRIPT','STYLE','INPUT','TEXTAREA','SELECT','OPTION','BUTTON','ABBR']);
    const andarilho = document.createTreeWalker(alvo, NodeFilter.SHOW_TEXT, {
      acceptNode(no){
        if(!no.nodeValue || no.nodeValue.length > 400) return NodeFilter.FILTER_REJECT;
        for(let p = no.parentElement; p && p !== alvo.parentElement; p = p.parentElement){
          if(PROIBIDO.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        }
        return RE_SIGLAS.test(no.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const achados = [];
    for(let no = andarilho.nextNode(); no; no = andarilho.nextNode()) achados.push(no);
    // Só a PRIMEIRA vez de cada sigla na tela. Sem isto, "MOTION" saía
    // sublinhado quinze vezes num quadro só — e quinze sublinhados não
    // ensinam mais que um, só sujam a tela e escondem o que importa.
    const jaExplicada = new Set();
    for(const no of achados){
      const pedacos = document.createDocumentFragment();
      let fim = 0;
      no.nodeValue.replace(RE_SIGLAS, (sigla, _g, pos)=>{
        if(jaExplicada.has(sigla)) return sigla;
        jaExplicada.add(sigla);
        if(pos > fim) pedacos.appendChild(document.createTextNode(no.nodeValue.slice(fim, pos)));
        const abbr = document.createElement('abbr');
        abbr.textContent = sigla;
        abbr.title = GLOSSARIO[sigla];
        abbr.style.cssText = 'text-decoration:underline dotted var(--ink-soft); text-underline-offset:3px; cursor:help;';
        pedacos.appendChild(abbr);
        fim = pos + sigla.length;
        return sigla;
      });
      if(fim < no.nodeValue.length) pedacos.appendChild(document.createTextNode(no.nodeValue.slice(fim)));
      no.parentNode.replaceChild(pedacos, no);
    }
    return achados.length;
  }

  window.LW.glossario = GLOSSARIO;
  window.LW.explicarSiglas = explicarSiglas;

  window.LW.padronizarSobreposicoes = padronizarSobreposicoes;
  window.LW.fecharSobreposicao = fecharSobreposicao;

    // Os lembretes do canto da tela ligam sozinhos, em toda tela interna.
    // Deixar isso para cada tela chamar significaria lembrar em dezoito
    // arquivos — e esquecer em alguns.
    //
    // `#side-nav` é o que distingue uma tela do sistema do login, do portal do
    // cliente e do portal do prestador: lá não há menu lateral, não há sessão
    // de usuário e a busca daria 401 em ciclo.
    // O menu lateral só aparecia DEPOIS que a tela terminava de buscar os
    // dados — e na Entrada de Leads isso são seis idas ao servidor, uma delas
    // uma gravação. Até lá a coluna da esquerda ficava vazia; se qualquer
    // dessas chamadas falhasse, o menu não vinha nunca e a pessoa ficava sem
    // como sair da tela. Agora ele desenha assim que a página abre. A tela
    // redesenha depois, só para acrescentar o contador do seu item.
    //
    // "Vazio" aqui NÃO é `children.length === 0`: o link "Como usar" é
    // acrescentado logo acima, antes deste trecho, e sozinho faria o menu
    // parecer montado — a tela abria com um único item e nada mais. Vazio é
    // não ter nenhum item de verdade.
    {
      const nav = document.getElementById('side-nav');
      const temMenu = nav && nav.querySelector('a.side-link:not([href="ajuda.html"]), .side-link.disabled');
      if (nav && !temMenu && LW.menuLateral) LW.menuLateral();
    }
    if (document.getElementById('side-nav') && LW.sessaoAtual() && LW.ligarLembretes) LW.ligarLembretes();
    ligarFechamentoPadrao();
    // Os botões que criam dado falso ("+ Contrato de teste", "+ Lead assumido
    // de teste") estavam à mostra para qualquer pessoa, em seis telas. Foi
    // assim que nasceram os quatro contratos e as 27 parcelas de teste que
    // precisaram ser apagados da produção em 27/10.
    //
    // `ehAdministrador` já existia para isto e não estava ligado em tela
    // nenhuma. Some para a equipe, continua para quem tem acesso total.
    if(!LW.ehAdministrador()){
      document.querySelectorAll('.test-panel').forEach(el=>{ el.style.display = 'none'; });
    }
    // As siglas ganham explicação depois que a tela desenhou. Um segundo de
    // espera porque quase toda tela pinta o conteúdo depois de buscar os
    // dados; marcar antes disso não acharia nada.
    if(document.getElementById('side-nav')) setTimeout(()=> explicarSiglas(), 1200);
  });
})();
