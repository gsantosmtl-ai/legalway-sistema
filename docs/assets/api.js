// Ponte entre as telas e o servidor (fase 2).
// Uso: <script src="assets/api.js"></script> e depois LW.api('/chat/estado'), LW.sessao(), LW.sair()...
// Módulos ainda não migrados continuam usando window.storage/localStorage normalmente.
(function(){
  const SESSAO_KEY = 'legalway-sessao-v1';
  const USUARIOS_KEY = 'legalway-usuarios-v1';

  // Chamada à API. Sempre manda o cookie de sessão. Erros viram exceção com a mensagem do servidor.
  async function api(caminho, opcoes){
    const o = Object.assign({ method:'GET' }, opcoes || {});
    const init = { method:o.method, credentials:'same-origin', headers:{} };
    if(o.body !== undefined){ init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(o.body); }
    let resp;
    try{ resp = await fetch('/api' + caminho, init); }
    catch(e){ throw Object.assign(new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.'), {status:0}); }
    let dados = null;
    try{ dados = await resp.json(); }catch(e){}
    if(!resp.ok){
      const erro = Object.assign(new Error((dados && dados.erro) || `Erro ${resp.status}`), {status:resp.status, dados});
      if(resp.status === 401 && !o.semRedirecionar){ limparSessaoLocal(); window.location.href = 'login.html'; }
      if(resp.status === 403 && dados && dados.trocarSenha){ window.location.href = 'login.html?trocar=1'; }
      throw erro;
    }
    return dados;
  }

  // Grava a sessão no localStorage no MESMO formato de antes — é assim que as telas ainda não migradas sabem quem está logado
  function gravarSessaoLocal(sessao){
    try{
      localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao));
      // As telas antigas leem a lista de usuários só pra atualizar as permissões de quem está logado.
      // Gravamos só o registro da própria pessoa (sem senha) e limpamos qualquer lista antiga que tinha senha em texto puro.
      localStorage.setItem(USUARIOS_KEY, JSON.stringify([{
        id:sessao.usuarioId, nome:sessao.nome, cargo:sessao.cargo, papel:sessao.papel,
        acessoTotal:sessao.acessoTotal, permissoes:sessao.permissoes, ativo:true
      }]));
    }catch(e){}
  }
  function limparSessaoLocal(){ try{ localStorage.removeItem(SESSAO_KEY); }catch(e){} }
  function sessaoLocal(){ try{ const v = localStorage.getItem(SESSAO_KEY); return v ? JSON.parse(v) : null; }catch(e){ return null; } }

  // Confirma com o servidor que a sessão ainda vale. Se não valer, manda pro login.
  async function sessao(){
    try{
      const r = await api('/sessao', { semRedirecionar:true });
      gravarSessaoLocal(Object.assign(sessaoLocal() || {}, r.sessao));
      return r.sessao;
    }catch(e){
      if(e.status === 401){ limparSessaoLocal(); window.location.href = 'login.html'; }
      if(e.status === 403 && e.dados && e.dados.trocarSenha){ window.location.href = 'login.html?trocar=1'; }
      throw e;
    }
  }

  async function sair(){
    try{ await api('/logout', { method:'POST', semRedirecionar:true }); }catch(e){}
    limparSessaoLocal();
    window.location.href = 'login.html';
  }

  // Conexão em tempo real (chat). Reconecta sozinha se cair.
  function tempoReal(aoReceber, aoMudarStatus){
    let ws = null, tentativas = 0, fechadoDeProposito = false, pingTimer = null;
    function conectar(){
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.onopen = ()=>{ tentativas = 0; if(aoMudarStatus) aoMudarStatus(true); pingTimer = setInterval(()=>{ if(ws.readyState===1) ws.send('ping'); }, 25000); };
      ws.onmessage = (ev)=>{ try{ const d = JSON.parse(ev.data); if(d.tipo !== 'pong') aoReceber(d); }catch(e){} };
      ws.onclose = ()=>{
        clearInterval(pingTimer);
        if(aoMudarStatus) aoMudarStatus(false);
        if(fechadoDeProposito) return;
        const espera = Math.min(30000, 1000 * Math.pow(2, tentativas++)); // 1s, 2s, 4s... até 30s
        setTimeout(conectar, espera);
      };
      ws.onerror = ()=>{ try{ ws.close(); }catch(e){} };
    }
    conectar();
    return { fechar(){ fechadoDeProposito = true; try{ ws.close(); }catch(e){} } };
  }

  function escaparHtml(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  window.LW = { api, sessao, sessaoLocal, gravarSessaoLocal, limparSessaoLocal, sair, tempoReal, escaparHtml };
})();
