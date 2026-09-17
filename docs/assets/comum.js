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
