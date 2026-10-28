// window.storage no servidor (fase 2). As telas continuam chamando storage.get/set/delete/list como sempre;
// a diferença é que chaves compartilhadas (shared=true) agora vivem no Postgres e aparecem pra todo mundo.
// Chaves privadas (shared=false: sessão, "lidas", preferências) continuam no localStorage deste navegador.
// Páginas públicas (contrato pra assinar, portal do prestador) usam o token `t` do link em vez de login.
(function(){
  const params = new URLSearchParams(location.search);
  const tokenPublico = params.get('t');
  const versaoLida = {};      // chave -> versão que esta tela leu por último (base pra mesclar)
  const cacheGet = {};        // chave -> {quando, resposta} (evita 10 chamadas iguais no carregamento)
  // Quanto tempo uma leitura serve do cache SEM perguntar ao servidor.
  //
  // Eram 1,5s, e com isso toda tela que consulta de tempos em tempos baixava o
  // bloco inteiro de novo. No Financeiro isso dava 410 KB a cada 20 segundos,
  // para um bloco que quase nunca muda.
  //
  // Dá para durar mais porque quem invalida este cache NÃO é o relógio: é o
  // canal de tempo real logo abaixo, que avisa a versão nova assim que
  // qualquer pessoa grava. A linha do `if` compara a versão avisada com a que
  // está no cache — mudou, baixa; não mudou, serve o que já tem.
  // Dez segundos é o compromisso: corta o tráfego repetido e, se o canal de
  // tempo real cair, o dado fica no máximo dez segundos atrás.
  const CACHE_MS = 10000;
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

  async function chamar(metodo, caminho, body, tentativa){
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
      // Tropeço passageiro (limite de requisições, servidor reiniciando, rede
      // caindo): tenta de novo antes de desistir. Desistir de uma LEITURA é o
      // que mais machuca — a tela conclui que o bloco está vazio e algumas
      // reconstroem tudo do zero por cima.
      const passageiro = resp.status === 429 || resp.status >= 500;
      const t = tentativa || 0;
      if(passageiro && t < 3){
        await new Promise(r => setTimeout(r, [1500, 5000, 15000][t]));
        return chamar(metodo, caminho, body, t + 1);
      }
      throw Object.assign(new Error((dados && dados.erro) || ('Erro ' + resp.status)), {status:resp.status, leituraFalhou: metodo === 'GET'});
    }
    return dados;
  }

  // ---- Pré-carga: as chaves que cada tela lê ao abrir vêm numa chamada só (em vez de uma por chave) ----
  const PRE_CARGA = {
  "funil-comercial": [
    "legalway-agenda-v1",
    "legalway-contratos-v1",
    "legalway-funil-v1",
    "legalway-sdr-v1"
  ],
  "entrada-leads": [
    "legalway-funil-v1",
    "legalway-leads-v1"
  ],
  "index": [
    "legalway-agenda-v1",
    "legalway-contas-pagar-v1",
    "legalway-contratos-v1",
    "legalway-financeiro-v1",
    "legalway-funil-v1",
    "legalway-leads-v1",
    "legalway-meta-mensal-v1",
    "legalway-notificacoes-vendedor-v1",
    "legalway-processos-documentacao-v1",
    "legalway-sdr-v1"
  ],
  "automacoes": [
    "legalway-automacoes-config-v1",
    "legalway-contratos-v1",
    "legalway-tarefas-v1"
  ],
  "configuracoes": [
    "legalway-checklists-v1",
    "legalway-modelos-documentos-v1",
    "legalway-prestadores-externos-v1",
    "legalway-config-empresa-v1",
    "legalway-meta-mensal-v1",
    "legalway-servicos-v1",
    "legalway-templates-mensagem-v1"
  ],
  "documentos": [
    "legalway-checklists-v1",
    "legalway-contas-pagar-v1",
    "legalway-contratos-v1",
    "legalway-doc-marcos-v1",
    "legalway-doc-responsaveis-v1",
    "legalway-financeiro-v1",
    "legalway-notificacoes-vendedor-v1",
    "legalway-prestadores-externos-v1",
    "legalway-modelos-documentos-v1",
    "legalway-processos-documentacao-v1",
    "legalway-servicos-v1",
    "legalway-templates-mensagem-v1"
  ],
  "agenda": [
    "legalway-agenda-v1",
    "legalway-tarefas-v1"
  ],
  "tarefas": [
    "legalway-clientes-v1",
    "legalway-tarefas-v1"
  ],
  "processos": [
    "legalway-processos-documentacao-v1"
  ],
  "marketing": [
    "legalway-contratos-v1",
    "legalway-leads-v1",
    "legalway-marketing-ads-v2",
    "legalway-marketing-anuncios-v1",
    "legalway-marketing-campmeta-v1",
    "legalway-marketing-canais-v1"
  ],
  "relatorios": [
    "legalway-contas-pagar-v1",
    "legalway-contratos-v1",
    "legalway-financeiro-v1",
    "legalway-funil-v1",
    "legalway-leads-v1",
    "legalway-processos-documentacao-v1",
    "legalway-sdr-v1"
  ],
  "clientes": [
    "legalway-clientes-v1",
    "legalway-contratos-v1",
    "legalway-financeiro-v1",
    "legalway-processos-documentacao-v1",
    "legalway-tarefas-v1"
  ],
  "financeiro": [
    "legalway-automacoes-config-v1",
    "legalway-categorias-financeiro-v1",
    "legalway-contas-bancarias-v1",
    "legalway-contas-pagar-v1",
    "legalway-contratos-v1",
    "legalway-financeiro-v1",
    "legalway-orcamento-v1",
    "legalway-processos-documentacao-v1",
    "legalway-sdr-v1"
  ],
  "contratos": [
    "legalway-automacoes-config-v1",
    "legalway-clientes-v1",
    "legalway-contratos-v1",
    "legalway-financeiro-v1",
    "legalway-servicos-v1"
  ],
  "sdr": [
    "legalway-agenda-v1",
    "legalway-funil-v1",
    "legalway-meta-sdr-v1",
    "legalway-sdr-v1"
  ]
};
  let preCarga = null; // promessa; get() espera por ela antes de buscar sozinho
  (function iniciarPreCarga(){
    if(tokenPublico) return;
    const pagina = (location.pathname.split('/').pop() || 'index.html').replace('.html','');
    const chaves = PRE_CARGA[pagina];
    if(!chaves || !chaves.length) return;
    preCarga = chamar('GET', '/storage-lote?chaves=' + encodeURIComponent(chaves.join(','))).then((r)=>{
      const agora = Date.now();
      for(const [k, v] of Object.entries((r && r.itens) || {})){
        const resposta = v ? {key:k, value:v.valor, shared:true, versao:v.versao} : null;
        versaoLida[k] = v ? v.versao : 0;
        cacheGet[k] = {quando: agora + 8000, resposta, preCarga:true}; // vale por ~10 s
      }
    }).catch(()=>{}).finally(()=>{ preCarga = null; });
  })();

  // Bloco cuja leitura falhou nesta aba. Enquanto estiver aqui, gravar está
  // proibido — foi assim que a importação do Trello se perdeu: a leitura dos
  // processos bateu no limite de requisições, a tela entendeu "não existe
  // nenhum processo", recriou 188 do zero a partir dos contratos assinados e
  // salvou por cima. Uma leitura que falha não é um bloco vazio.
  const leituraQuebrada = new Set();

  async function get(key, shared){
    if(shared === false) return priv.get(key);
    if(preCarga && !(key in cacheGet)) await preCarga;
    const c = cacheGet[key];
    if(c && Date.now() - c.quando < CACHE_MS && !(ultimaMudanca[key] > (c.resposta ? c.resposta.versao : 0))) return c.resposta;
    let r;
    try{ r = await chamar('GET', '/storage/' + encodeURIComponent(key)); }
    catch(e){ leituraQuebrada.add(key); avisarLeituraQuebrada(key, e); throw e; }
    leituraQuebrada.delete(key);
    const resposta = r ? {key, value:r.valor, shared:true, versao:r.versao} : null;
    versaoLida[key] = r ? r.versao : 0;
    cacheGet[key] = {quando:Date.now(), resposta};
    return resposta;
  }

  let avisou = false;
  function avisarLeituraQuebrada(key, e){
    console.error('[storage] não consegui ler "' + key + '": ' + e.message + ' — gravar neste bloco fica bloqueado até ler de novo.');
    if(avisou) return;
    avisou = true;
    const faixa = document.createElement('div');
    faixa.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#A5402E;color:#fff;padding:10px 16px;font:13px/1.4 system-ui,sans-serif;text-align:center;';
    faixa.textContent = 'Não consegui carregar tudo do servidor. Nada será gravado até a página ler os dados de novo — recarregue daqui a pouco.';
    document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(faixa));
    if(document.body) document.body.appendChild(faixa);
  }

  // `opcoes.confirmarReducao` deixa passar uma gravação que apaga muita coisa de
  // uma vez. O servidor recusa isso por padrão — e com razão, é a defesa contra
  // uma tela com dado pela metade sobrescrever o módulo inteiro. Mas até aqui
  // NENHUMA tela sabia confirmar, então uma limpeza legítima em massa era
  // impossível pela interface: a trava existia sem porta.
  //
  // Quem passa isto tem de ter perguntado à pessoa, com o número na frente
  // dela. É o que a limpeza de fichas duplicadas faz.
  async function set(key, value, shared, opcoes){
    if(shared === false) return priv.set(key, value);
    if(leituraQuebrada.has(key)){
      throw new Error('Não gravei "' + key + '": a leitura deste bloco falhou nesta aba e salvar agora apagaria o que está no servidor. Recarregue a página.');
    }
    ultimoSet = Date.now();
    const corpo = { valor:String(value), versaoBase: versaoLida[key] ?? null, origem: ORIGEM };
    if(opcoes && opcoes.confirmarReducao) corpo.confirmarReducao = true;
    const r = await chamar('PUT', '/storage/' + encodeURIComponent(key), corpo);
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
  // Link de arquivo pronto pra usar: numa página pública (portal do prestador, contrato) leva o
  // token do link junto, porque o download agora exige uma porta — sessão ou token válido.
  function linkArquivo(url){
    if(!url || url.startsWith('data:')) return url;
    if(!tokenPublico) return url;
    return url + (url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(tokenPublico);
  }

  async function arquivoBase64(url){
    if(!url) return null;
    if(url.startsWith('data:')) return url.split(',')[1];
    const resp = await fetch(linkArquivo(url), {credentials:'same-origin'});
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

  window.storage = { get, set, delete: del, list, arquivoBase64, linkArquivo, temArquivo, registrarAssinatura,
                     leituraQuebrada: (k)=> k ? leituraQuebrada.has(k) : leituraQuebrada.size > 0,
                     modoPublico: !!tokenPublico };

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

  // Quando outra tela salva alguma coisa, esta se recarrega sozinha — e
  // redesenhar joga a rolagem para o topo. No quadro da Documentação, com 263
  // cartões, quem estava descendo a lista voltava ao começo sem ter feito nada.
  // Acontecia a cada minuto, porque as automações do servidor escrevem nos
  // blocos de tempos em tempos.
  //
  // Duas defesas: não redesenhar no meio de uma rolagem, e devolver a posição
  // depois de redesenhar.
  let ultimaRolagem = 0;
  window.addEventListener('scroll', ()=>{ ultimaRolagem = Date.now(); }, { passive: true, capture: true });

  // "Preciso que pare de ficar dando refresh o tempo inteiro."
  //
  // Rolagem não era a única coisa que o recarregamento atrapalhava. Quem está
  // clicando numa lista de caixinhas — o checklist de um serviço, por exemplo —
  // grava a cada clique, e cada gravação faz TODAS as telas abertas se
  // redesenharem. A tela pisca debaixo da mão de quem trabalha.
  //
  // Então: enquanto a pessoa está mexendo, o recarregamento espera. Ele não é
  // cancelado, só adiado — assim que ela para, a tela se atualiza.
  let ultimaInteracao = 0;
  for(const ev of ['pointerdown','keydown','input','change','focusin']){
    window.addEventListener(ev, ()=>{ ultimaInteracao = Date.now(); }, { passive: true, capture: true });
  }
  const QUIETA_POR = 6000;      // tempo parada antes de aceitar um redesenho
  const ENTRE_RECARGAS = 15000; // e nunca mais de um redesenho neste intervalo
  let ultimoRecarregue = 0;
  // Campo em foco é intocável: redesenhar enquanto alguém digita apaga o que
  // ela escreveu e tira o cursor do lugar.
  const digitandoAgora = ()=>{
    const el = document.activeElement;
    if(!el || el === document.body) return false;
    return el.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
  };

  // As caixas que rolam por dentro, em todas as telas. A posição é guardada
  // pela ORDEM, não pela referência: redesenhar troca os elementos.
  const CAIXAS_QUE_ROLAM = '.content2, .board-wrap, .cols, .col-body, #board, .drawer-body, .tabela-wrap';
  function guardarRolagem(){
    const caixas = [...document.querySelectorAll(CAIXAS_QUE_ROLAM)];
    return { x: window.scrollX, y: window.scrollY,
      partes: caixas.map((el, i)=> [i, el.scrollTop, el.scrollLeft]).filter(([, t, l])=> t || l) };
  }
  function devolverRolagem(r){
    if(!r) return;
    window.scrollTo(r.x, r.y);
    const caixas = [...document.querySelectorAll(CAIXAS_QUE_ROLAM)];
    r.partes.forEach(([i, t, l])=>{ const el = caixas[i]; if(el){ el.scrollTop = t; el.scrollLeft = l; } });
  }

  async function recarregarSePossivel(){
    const modalAberto = document.querySelector('.modal.show, .modal-overlay.show, [class*="modal"].show');
    if(modalAberto) return;                              // não atrapalha quem está editando
    // Rolando agora: redesenhar no meio disso é o que faz a tela "pular".
    // Mexendo agora, ou digitando: idem, e pior.
    if(recarregando || emVoo > 0 || digitandoAgora()
       || Date.now() - ultimoSet < 2500
       || Date.now() - ultimaRolagem < 1500
       || Date.now() - ultimaInteracao < QUIETA_POR
       || Date.now() - ultimoRecarregue < ENTRE_RECARGAS){
      clearTimeout(timer); timer = setTimeout(recarregarSePossivel, 2000); return;
    }
    recarregando = true;
    ultimoRecarregue = Date.now();
    try{ await recarregar(); }finally{ recarregando = false; }
  }
  async function recarregar(){
    if(typeof window.loadAll === 'function'){
      const onde = guardarRolagem();
      try{
        await window.loadAll();
        if(typeof window.render === 'function') window.render();
        // Depois do desenho: antes disso a página ainda não tem a altura toda
        // e o navegador ignora o scrollTo.
        requestAnimationFrame(()=> devolverRolagem(onde));
      }catch(e){}
    }
  }
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && !tokenPublico) recarregarSePossivel(); });
})();
