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
    .lw-carregando{ position:fixed; left:0; top:0; height:3px; width:0; background:linear-gradient(90deg,#86285F,#3B6FE0); z-index:1300; transition:width .3s, opacity .4s; opacity:0; pointer-events:none; }
    .lw-carregando.on{ opacity:1; }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  function prontoDom(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  prontoDom(()=>{
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
      body.lw-tela-cheia .pipeline-summary, body.lw-tela-cheia .sdr-kpi-strip, body.lw-tela-cheia .kpi-strip,
      body.lw-tela-cheia .funil-cols > div:last-child, body.lw-tela-cheia .sdr-cols > div:last-child,
      body.lw-tela-cheia .doc-cols > div:last-child { display:none !important; }
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
        body.lw-tela-cheia .filtros-funil{ margin-top:6px !important; padding-right:150px; }
        /* o seletor de visão se ancora no content2, não no quadro */
        body.lw-tela-cheia .funil-cols, body.lw-tela-cheia .board-wrap{ position:static !important; }
        body.lw-tela-cheia .lw-toggle-visao{
          position:absolute !important; top:38px; right:0; margin:0 !important; z-index:6; }
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
  // ---- Kanban ou lista: preferência de cada pessoa, por módulo, neste navegador ----
  window.LW.visao = (modulo, valor)=>{
    const k = 'legalway-visao-' + modulo;
    if(valor){ try{ localStorage.setItem(k, valor); }catch(e){} return valor; }
    try{ return localStorage.getItem(k) || 'kanban'; }catch(e){ return 'kanban'; }
  };
  // Botões ▦ Kanban / ☰ Lista. `alvo` = elemento onde inserir (antes do conteúdo); `aoMudar` re-renderiza.
  window.LW.toggleVisao = (alvo, modulo, aoMudar)=>{
    if(!alvo || alvo.querySelector('.lw-toggle-visao')) return;
    const atual = LW.visao(modulo);
    const box = document.createElement('div'); box.className = 'lw-toggle-visao';
    box.style.cssText = 'display:inline-flex;border:1px solid #E4E1DA;border-radius:8px;overflow:hidden;font-size:12px;margin:0 0 10px;';
    box.innerHTML = ['kanban','lista'].map(v=>`<button type="button" data-visao="${v}" style="border:none;padding:6px 12px;cursor:pointer;font-family:inherit;font-size:12px;background:${v===atual?'#16204F':'#fff'};color:${v===atual?'#fff':'#1B1B1F'};">${v==='kanban'?'▦ Kanban':'☰ Lista'}</button>`).join('');
    box.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=>{ LW.visao(modulo, b.getAttribute('data-visao')); box.remove(); LW.toggleVisao(alvo, modulo, aoMudar); aoMudar(); }));
    alvo.insertBefore(box, alvo.firstChild);
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
        .resumo{ font-size:11.5px; background:#F6F4EF; border-radius:6px; padding:8px 10px; margin-bottom:12px; line-height:1.5; }
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
      <div style="background:#F6F4EF;border-radius:9px;padding:10px 12px;">
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

  window.LW.listaDeContratos = (titulo, lista, aviso)=>{
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
              style="background:#F6F4EF;border-radius:7px;padding:8px 12px;min-width:132px;cursor:pointer;border:1px solid transparent;">
              <div style="font-size:12.5px;font-weight:600;">${esc(v)}</div>
              <div style="font-size:11.5px;color:#6B6B75;">${d.n} contrato${d.n===1?'':'s'} · ${dinheiro(d.valor)}</div>
            </div>`).join('')}
        </div>
        ${aviso ? `<div style="font-size:12px;color:#6B6B75;line-height:1.5;background:#F6F4EF;border-radius:8px;padding:8px 11px;margin-bottom:10px;">${esc(aviso)}</div>` : ''}
        <div style="font-size:11.5px;color:#6B6B75;margin-bottom:6px;">Clique num cliente para abrir a ficha completa dele.</div>
        <div id="lw-lc-aviso" style="font-size:11.5px;color:#6B6B75;margin-bottom:8px;"></div>
        <div style="max-height:44vh;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr style="text-align:left;color:#6B6B75;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">
              <th style="padding:6px 4px;">Cliente</th><th style="padding:6px 4px;">Serviço</th>
              <th style="padding:6px 4px;">Vendedor</th><th style="padding:6px 4px;">Status</th>
              <th style="padding:6px 4px;">Assinado</th>
              <th style="padding:6px 4px;text-align:right;">Valor</th></tr></thead>
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
        </tr>`).join('');
      // A linha leva para a ficha do cliente — a mesma que já existe em Clientes,
      // com Resumo, Financeiro, Processos, Documentos e Timeline. Quem abre
      // "contratos assinados" e vê um nome quer saber do cliente, não da linha.
      modal.querySelectorAll('[data-ficha]').forEach(tr=>{
        tr.addEventListener('mouseenter', ()=> tr.style.background = '#F6F4EF');
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
        el.style.background = ativo ? '#EEF2FB' : '#F6F4EF';
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
    t.innerHTML = `<thead><tr>${colunas.map((c,i)=>`<th data-col="${i}" style="text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6B6B75;padding:10px;border-bottom:1px solid #E4E1DA;background:#FBFAF7;cursor:pointer;white-space:nowrap;">${esc(c.titulo)}${estado.col===i?(estado.desc?' ▼':' ▲'):''}</th>`).join('')}</tr></thead>
      <tbody>${lista.length ? lista.map((it,i)=>`<tr data-i="${i}" style="cursor:pointer;">${colunas.map(c=>`<td style="padding:9px 10px;border-bottom:1px solid #E4E1DA;vertical-align:middle;">${c.html ? c.html(it) : esc(c.valor(it))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${colunas.length}" style="padding:24px;text-align:center;color:#6B6B75;">Nada por aqui.</td></tr>`}</tbody>`;
    t.querySelectorAll('th').forEach(th=> th.addEventListener('click', ()=>{ const i = Number(th.getAttribute('data-col')); if(estado.col===i) estado.desc = !estado.desc; else { estado.col = i; estado.desc = false; } t.dispatchEvent(new CustomEvent('lw:reordenar', {bubbles:true})); }));
    t.querySelectorAll('tbody tr[data-i]').forEach(tr=> tr.addEventListener('click', ()=> aoClicar(lista[Number(tr.getAttribute('data-i'))])));
    return t;
  };
  // sessão da pessoa (o que login.html gravou); as funções comuns abaixo usam isto em vez da variável de cada tela
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
function renderSidebar(){
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
  let vis = items;
  if(sessao && sessao.permissoes){ vis = items.filter(it => !it.permKey || sessao.permissoes[it.permKey] !== 'nenhum'); }
  const nav = document.getElementById('side-nav'); if(!nav) return;
  nav.innerHTML = vis.map(it=>{
    if(!it.href) return `<div class="side-link disabled">${svgIcon(it.icon)}<span>${it.label}</span><span class="side-soon">em breve</span></div>`;
    return `<a class="side-link ${it.href===pagina?'active':''}" href="${it.href}">${svgIcon(it.icon)}<span>${it.label}</span></a>`;
  }).join('');
}

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
  const n = await contarNaoLidasChat();
  const el = document.getElementById('chat-badge');
  if(!el) return;
  if(n > 0){ el.textContent = n > 9 ? '9+' : n; el.style.display = 'flex'; }
  else { el.style.display = 'none'; }
}

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
    [...el.querySelectorAll('[data-i]')].forEach((n,i) => n.style.background = i === sel ? 'var(--paper-dim,#F1EFEA)' : 'transparent');
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
    // ?abrir=<id> — vindo da busca global ou de um link do chat
    const id = new URLSearchParams(location.search).get('abrir');
    if (id) setTimeout(() => {
      for (const fn of ['openDrawer','abrirDetalhe','abrirModal','abrirFicha']){
        if (typeof window[fn] === 'function'){ try{ window[fn](id); break; }catch(e){} }
      }
    }, 900);
  });
})();
