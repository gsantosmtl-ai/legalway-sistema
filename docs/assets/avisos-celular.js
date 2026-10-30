// Botão "avisar neste celular". Liga o aviso de lead novo no aparelho de quem
// está logado — e some sozinho onde não dá para funcionar, em vez de prometer
// o que não vai acontecer.
//
// O detalhe que mais pega gente: no iPhone, aviso só funciona se o sistema
// estiver INSTALADO na tela de início. Aberto no Safari, o navegador nem
// oferece. Por isso, nesse caso, o botão vira a instrução de instalar.
(function () {
  const LW = window.LW = window.LW || {};

  const temSuporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const instalado = () => window.navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  function paraBytes(base64url) {
    const b64 = (base64url + '='.repeat((4 - base64url.length % 4) % 4))
      .replace(/-/g, '+').replace(/_/g, '/');
    const cru = atob(b64);
    return Uint8Array.from(cru, (c) => c.charCodeAt(0));
  }

  // Nome só para a pessoa se reconhecer na lista de aparelhos dela.
  function nomeDoAparelho() {
    const u = navigator.userAgent;
    const qual = ehIOS() ? 'iPhone' : /Android/.test(u) ? 'Android'
      : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'navegador';
    return qual + ' · ' + new Date().toLocaleDateString('pt-BR');
  }

  async function registrar() {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function assinaturaAtual() {
    if (!temSuporte()) return null;
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  }

  async function ligar(canais) {
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      throw new Error(permissao === 'denied'
        ? 'Você bloqueou os avisos para este site. Para voltar atrás, mude nas configurações do navegador.'
        : 'Os avisos não foram autorizados.');
    }
    const reg = await registrar();
    const { chave } = await LW.api('/push/chave');
    let ass = await reg.pushManager.getSubscription();
    if (!ass) {
      ass = await reg.pushManager.subscribe({
        userVisibleOnly: true,                 // exigido pelo Chrome: todo push mostra aviso
        applicationServerKey: paraBytes(chave),
      });
    }
    const j = ass.toJSON();
    await LW.api('/push/assinar', { method: 'POST', body: {
      endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      aparelho: nomeDoAparelho(), canais: canais || [],
    } });
    return ass;
  }

  async function desligar() {
    const ass = await assinaturaAtual();
    if (!ass) return;
    await LW.api('/push/sair', { method: 'POST', body: { endpoint: ass.endpoint } }).catch(() => {});
    await ass.unsubscribe().catch(() => {});
  }

  const DEPARTAMENTOS = [
    ['vendas', 'Vendas', 'lead novo, contrato assinado'],
    ['documentacao', 'Documentação', 'documento do cliente, prazo chegando'],
    ['financeiro', 'Financeiro', 'parcela paga, cobrança recusada'],
  ];

  // Qual departamento marcar por padrão. O papel sozinho não resolve — os
  // sócios são de áreas diferentes — então olho também o cargo, que é onde
  // está escrito "Vendas", "Financeiro/Contratos", "Documentação/Processos".
  function palpite() {
    const s = (LW.sessaoLocal && LW.sessaoLocal()) || {};
    const texto = ((s.cargo || '') + ' ' + (s.papel || '')).toLowerCase();
    const achou = DEPARTAMENTOS.filter(([k, nome]) =>
      texto.includes(k) || texto.includes(nome.toLowerCase())
      || (k === 'documentacao' && /processo|documenta/.test(texto))
      || (k === 'vendas' && /vend|comercial|sdr/.test(texto))
      || (k === 'financeiro' && /financ|contrato/.test(texto))).map(([k]) => k);
    // Ninguém reconhecido recebe tudo: é melhor avisar demais do que deixar
    // alguém sem o aviso achando que está ligado.
    return achou.length ? achou : DEPARTAMENTOS.map(([k]) => k);
  }

  function perguntarDepartamentos() {
    return new Promise((resolve) => {
      const marcados = palpite();
      const fundo = document.createElement('div');
      fundo.style.cssText = 'position:fixed;inset:0;background:rgba(10,16,40,.55);z-index:9999;'
        + 'display:flex;align-items:center;justify-content:center;padding:16px';
      const caixa = document.createElement('div');
      caixa.style.cssText = 'background:#fff;border-radius:14px;padding:20px;max-width:380px;width:100%;'
        + 'font:14px/1.5 system-ui,sans-serif;color:#14213D;box-shadow:0 20px 60px rgba(0,0,0,.3)';
      caixa.innerHTML = '<div style="font-weight:700;font-size:16px;margin-bottom:4px">Quais avisos você quer neste celular?</div>'
        + '<div style="color:#5B6680;font-size:13px;margin-bottom:14px">Dá para mudar depois, é só tocar de novo no botão.</div>'
        + DEPARTAMENTOS.map(([k, nome, ex]) =>
          '<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;cursor:pointer">'
          + '<input type="checkbox" value="' + k + '" style="margin-top:3px;width:18px;height:18px;flex:none"'
          + (marcados.includes(k) ? ' checked' : '') + '>'
          + '<span><b>' + nome + '</b><br><span style="color:#5B6680;font-size:12px">' + ex + '</span></span></label>').join('')
        + '<div style="display:flex;gap:8px;margin-top:16px">'
        + '<button data-x="nao" style="flex:1;padding:11px;border-radius:9px;border:1px solid #C9D2E8;background:#fff;cursor:pointer;font:inherit">Cancelar</button>'
        + '<button data-x="sim" style="flex:2;padding:11px;border-radius:9px;border:0;background:#14213D;color:#fff;cursor:pointer;font:inherit;font-weight:600">Ligar avisos</button>'
        + '</div>';
      fundo.appendChild(caixa);
      document.body.appendChild(fundo);
      caixa.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const escolhidos = [...caixa.querySelectorAll('input:checked')].map((i) => i.value);
        fundo.remove();
        resolve(b.dataset.x === 'sim' ? escolhidos : null);
      });
      fundo.addEventListener('click', (e) => { if (e.target === fundo) { fundo.remove(); resolve(null); } });
    });
  }

  /** Põe o botão para funcionar. `botao` é o elemento; o texto dele é trocado aqui. */
  async function montar(botao) {
    if (!botao) return;
    const pinta = (texto, titulo) => { botao.textContent = texto; botao.title = titulo || ''; };

    if (!temSuporte()) {
      // iPhone no Safari sem instalar é o caso comum — vale explicar, não sumir.
      if (ehIOS() && !instalado()) {
        pinta('🔔 Instalar para receber avisos',
          'No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início". '
          + 'Abra o sistema por esse ícone e o botão de avisos aparece.');
        botao.onclick = () => alert(
          'Para receber os avisos no iPhone:\n\n'
          + '1. Toque no botão Compartilhar (o quadradinho com a seta)\n'
          + '2. Toque em "Adicionar à Tela de Início"\n'
          + '3. Abra o sistema por esse novo ícone\n'
          + '4. Volte aqui e toque em "Avisar neste celular"\n\n'
          + 'É só uma vez. Depois o aviso chega mesmo com o sistema fechado.');
        return;
      }
      botao.style.display = 'none';
      return;
    }

    let ligado = !!(await assinaturaAtual().catch(() => null));
    const mostra = () => ligado
      ? pinta('🔔 Avisos ligados', 'Você recebe aviso neste aparelho quando entra lead. Clique para desligar.')
      : pinta('🔔 Avisar neste celular', 'Receber aviso neste aparelho quando entrar lead novo.');
    mostra();

    botao.onclick = async () => {
      const antes = botao.textContent;
      botao.disabled = true;
      pinta(ligado ? 'desligando…' : 'ligando…');
      try {
        if (ligado) { await desligar(); ligado = false; mostra(); }
        else {
          const canais = await perguntarDepartamentos();
          if (canais === null) { pinta(antes); return; }   // cancelou
          await ligar(canais); ligado = true; mostra();
          await LW.api('/push/teste', { method: 'POST' }).catch(() => {});
        }
      } catch (e) {
        pinta(antes);
        alert(e.message || 'Não consegui ligar os avisos.');
      } finally { botao.disabled = false; }
    };
  }

  LW.avisosCelular = { montar, ligar, desligar, temSuporte, assinaturaAtual };
})();
