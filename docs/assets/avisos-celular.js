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

  async function ligar() {
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
      endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho: nomeDoAparelho(),
    } });
    return ass;
  }

  async function desligar() {
    const ass = await assinaturaAtual();
    if (!ass) return;
    await LW.api('/push/sair', { method: 'POST', body: { endpoint: ass.endpoint } }).catch(() => {});
    await ass.unsubscribe().catch(() => {});
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
          await ligar(); ligado = true; mostra();
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
