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

    // ---- Barra fina de "carregando" enquanto há requisição ao servidor ----
    const barra = document.createElement('div'); barra.className = 'lw-carregando'; document.body.appendChild(barra);
    let ativos = 0, timer = null;
    const origFetch = window.fetch;
    window.fetch = function(url, init){
      const ehApi = typeof url === 'string' && url.startsWith('/api/');
      if(ehApi){ ativos++; clearTimeout(timer); barra.classList.add('on'); barra.style.width = '70%'; }
      const p = origFetch.apply(this, arguments);
      if(ehApi) p.finally(()=>{ ativos--; if(ativos <= 0){ ativos = 0; barra.style.width = '100%'; timer = setTimeout(()=>{ barra.classList.remove('on'); barra.style.width = '0'; }, 350); } });
      return p;
    };
  });

  // ---- Confirmação com senha pra ações que não têm volta. Fica registrado na auditoria quem confirmou. ----
  window.LW = window.LW || {};
  window.LW.confirmar = (msg)=> window.confirm(msg);

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
  prontoDom(async ()=>{
    if(!window.storage || window.storage.modoPublico) return;
    await carregarPrefs();
    aplicarBlocos();
    new MutationObserver(()=> aplicarBlocos()).observe(document.body, { childList:true, subtree:true });
    // botão ⚙ Personalizar no cabeçalho (ao lado do usuário), só nas telas com blocos
    const topo = document.querySelector('.topbar-right, .topbar2 .topbar-right, .topbar');
    if(topo && document.querySelector('[data-bloco]')){
      const b = document.createElement('button'); b.title = 'Personalizar esta tela'; b.textContent = '⚙';
      b.style.cssText = 'border:1px solid #E4E1DA;background:#fff;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:15px;margin-right:6px;';
      b.addEventListener('click', abrirPersonalizar);
      topo.insertBefore(b, topo.firstChild);
    }
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
  window.LW.confirmarComSenha = function(descricao){
    return new Promise((resolve)=>{
      const fundo = document.createElement('div');
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,14,40,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
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

function svgIcon(name){ return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`; }

// Menu lateral (item ativo = página atual; some o que a pessoa não tem permissão de ver)
function renderSidebar(){
  const sessao = LW.sessaoAtual();
  const pagina = location.pathname.split('/').pop() || 'index.html';
  const items = [
    {label:'Dashboard', href:'index.html', icon:'dashboard', permKey:null},
    {label:'Entrada de Leads', href:'entrada-leads.html', icon:'leads', permKey:'leads'},
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
function hoje(){ return new Date().toISOString().slice(0,10); }

// Aviso rápido no canto: fica 6 s (antes eram 3,6 s) e some ao clicar
function toast(msg){
  let el = document.getElementById('toast');
  if(!el){ el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  el.style.cursor = 'pointer';
  el.onclick = ()=> el.classList.remove('show');
  clearTimeout(window._t);
  window._t = setTimeout(()=> el.classList.remove('show'), 6000);
}
