// window.storage no servidor (fase 2). As telas continuam chamando storage.get/set/delete/list como sempre;
// a diferença é que chaves compartilhadas (shared=true) agora vivem no Postgres e aparecem pra todo mundo.
// Chaves privadas (shared=false: sessão, "lidas", preferências) continuam no localStorage deste navegador.
// Páginas públicas (contrato pra assinar, portal do prestador) usam o token `t` do link em vez de login.
(function(){
  const params = new URLSearchParams(location.search);
  const tokenPublico = params.get('t');
  const versaoLida = {};      // chave -> versão que esta tela leu por último (base pra mesclar)
  const cacheGet = {};        // chave -> {quando, resposta} (evita 10 chamadas iguais no carregamento)
  const CACHE_MS = 1500;
  let ultimaMudanca = {};     // chave -> versão avisada pelo servidor (tempo real)
  const ORIGEM = Math.random().toString(36).slice(2, 12); // identifica esta aba: eventos dela mesma são ignorados
  let emVoo = 0;              // requisições ao servidor em andamento nesta aba
  let ultimoSet = 0;

  function local(){
    return {
      async get(key){ try{ const v = localStorage.getItem(key); return v!==null ? {key, value:v, shared:false} : null; }catch(e){ return null; } },
      async set(key, value){ try{ localStorage.setItem(key, value); return {key, value, shared:false}; }catch(e){ return null; } },
      async delete(key){ try{ localStorage.removeItem(key); return {key, deleted:true, shared:false}; }catch(e){ return null; } },
      async list(prefix){ try{ return {keys:Object.keys(localStorage).filter(k=>!prefix||k.startsWith(prefix)), prefix, shared:false}; }catch(e){ return null; } }
    };
  }
  const priv = local();

  async function chamar(metodo, caminho, body){
    const url = tokenPublico ? `/api/publico${caminho}${caminho.includes('?')?'&':'?'}t=${encodeURIComponent(tokenPublico)}` : `/api${caminho}`;
    const init = { method:metodo, credentials:'same-origin', headers:{} };
    if(body !== undefined){ init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    emVoo++;
    let resp;
    try{ resp = await fetch(url, init); }finally{ emVoo--; }
    let dados = null; try{ dados = await resp.json(); }catch(e){}
    if(resp.status === 404) return null;
    if(!resp.ok){
      if(resp.status === 401 && !tokenPublico){ try{ localStorage.removeItem('legalway-sessao-v1'); }catch(e){} location.href = 'login.html'; }
      if(resp.status === 403 && dados && dados.trocarSenha) location.href = 'login.html?trocar=1';
      throw Object.assign(new Error((dados && dados.erro) || ('Erro ' + resp.status)), {status:resp.status});
    }
    return dados;
  }

  async function get(key, shared){
    if(shared === false) return priv.get(key);
    const c = cacheGet[key];
    if(c && Date.now() - c.quando < CACHE_MS && !(ultimaMudanca[key] > (c.resposta ? c.resposta.versao : 0))) return c.resposta;
    const r = await chamar('GET', '/storage/' + encodeURIComponent(key));
    const resposta = r ? {key, value:r.valor, shared:true, versao:r.versao} : null;
    versaoLida[key] = r ? r.versao : 0;
    cacheGet[key] = {quando:Date.now(), resposta};
    return resposta;
  }
  async function set(key, value, shared){
    if(shared === false) return priv.set(key, value);
    ultimoSet = Date.now();
    const r = await chamar('PUT', '/storage/' + encodeURIComponent(key), { valor:String(value), versaoBase: versaoLida[key] ?? null, origem: ORIGEM });
    if(r && r.mesclado){
      // outra pessoa tinha salvo antes: o servidor juntou as duas versões. O que está na tela pode estar desatualizado.
      console.info('[storage] "' + key + '" foi mesclado com alterações de outra pessoa.');
      window.dispatchEvent(new CustomEvent('lw:mesclado', {detail:{chave:key}}));
    }
    // Salvou limpo: o que está na tela é exatamente a versão nova, então ela vira a base do próximo save.
    // Foi mesclado: a tela ainda tem a versão antiga na memória, então a base continua a que ela leu.
    if(r && !r.mesclado) versaoLida[key] = r.versao;
    cacheGet[key] = {quando:Date.now(), resposta: r ? {key, value:r.valor, shared:true, versao:r.versao} : null};
    return {key, value, shared:true};
  }
  async function del(key, shared){
    if(shared === false) return priv.delete(key);
    await chamar('DELETE', '/storage/' + encodeURIComponent(key));
    delete cacheGet[key]; delete versaoLida[key];
    return {key, deleted:true, shared:true};
  }
  async function list(prefix, shared){
    if(shared === false) return priv.list(prefix);
    const r = await chamar('GET', '/storage?prefixo=' + encodeURIComponent(prefix || ''));
    return {keys:(r && r.chaves || []).map(c=>c.chave), prefix, shared:true};
  }

  // Lê um arquivo salvo no servidor como base64 (pra montar ZIPs). Aceita link /api/arquivos/... ou data:.
  async function arquivoBase64(url){
    if(!url) return null;
    if(url.startsWith('data:')) return url.split(',')[1];
    const resp = await fetch(url, {credentials:'same-origin'});
    if(!resp.ok) throw new Error('Não consegui baixar o arquivo.');
    const buf = new Uint8Array(await resp.arrayBuffer());
    let bin = ''; for(let i=0;i<buf.length;i+=0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i+0x8000));
    return btoa(bin);
  }
  const temArquivo = (s)=> typeof s === 'string' && (s.startsWith('data:') || s.startsWith('/api/arquivos/'));

  // Página pública do contrato: manda o pacote de prova da assinatura pro servidor (só funciona com o token do link)
  async function registrarAssinatura(dados){
    if(!tokenPublico) throw new Error('Este link não tem o código de segurança. Peça um novo link.');
    const resp = await fetch('/api/publico/assinatura?t=' + encodeURIComponent(tokenPublico), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(dados) });
    let d = null; try{ d = await resp.json(); }catch(e){}
    if(!resp.ok) throw new Error((d && d.erro) || ('Erro ' + resp.status));
    return d;
  }

  window.storage = { get, set, delete: del, list, arquivoBase64, temArquivo, registrarAssinatura, modoPublico: !!tokenPublico };

  // Tempo real: quando outra pessoa salva um bloco que esta tela já leu, recarrega os dados
  // (só se a tela tiver loadAll/render globais e não estiver no meio de um modal aberto).
  let timer = null;
  if(!tokenPublico && window.LW && LW.tempoReal){
    LW.tempoReal((ev)=>{
      if(ev.tipo !== 'storage') return;
      ultimaMudanca[ev.chave] = ev.versao;
      if(ev.origem === ORIGEM) return;                  // foi esta aba que salvou
      if(!(ev.chave in versaoLida)) return;            // esta tela nunca leu essa chave
      clearTimeout(timer);
      timer = setTimeout(recarregarSePossivel, 1200);
    });
  }
  let recarregando = false;
  async function recarregarSePossivel(){
    const modalAberto = document.querySelector('.modal.show, .modal-overlay.show, [class*="modal"].show');
    if(modalAberto) return;                              // não atrapalha quem está editando
    if(recarregando || emVoo > 0 || Date.now() - ultimoSet < 2500){ // a tela está no meio de algo: tenta de novo daqui a pouco
      clearTimeout(timer); timer = setTimeout(recarregarSePossivel, 2000); return;
    }
    recarregando = true;
    try{ await recarregar(); }finally{ recarregando = false; }
  }
  async function recarregar(){
    if(typeof window.loadAll === 'function'){
      try{ await window.loadAll(); if(typeof window.render === 'function') window.render(); }catch(e){}
    }
  }
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && !tokenPublico) recarregarSePossivel(); });
})();
