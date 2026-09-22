// Idiomas: português (original), espanhol e inglês.
// Como funciona: a tela é escrita em português e este arquivo troca o texto depois que ela carrega,
// inclusive o que é montado pelo JavaScript (fica de olho nas mudanças da tela).
// Para traduzir mais telas, basta acrescentar as frases no dicionário abaixo — o que não está aqui
// continua aparecendo em português, sem quebrar nada.
(function () {
  const CHAVE = 'legalway-idioma';
  const IDIOMAS = { pt: 'Português', es: 'Español', en: 'English' };

  // frase em português → [espanhol, inglês]
  const D = {
    // ---- portal do cliente ----
    'Portal do Cliente': ['Portal del Cliente', 'Client Portal'],
    'PORTAL DO CLIENTE': ['PORTAL DEL CLIENTE', 'CLIENT PORTAL'],
    'Acompanhe seu processo': ['Siga su caso', 'Follow your case'],
    'Entre com o e-mail e a senha que o escritório enviou para você.': ['Ingrese con el correo y la contraseña que la oficina le envió.', 'Sign in with the e-mail and password the office sent you.'],
    'E-mail': ['Correo electrónico', 'E-mail'],
    'Senha': ['Contraseña', 'Password'],
    'senha': ['contraseña', 'password'],
    'seu@email.com': ['su@correo.com', 'you@email.com'],
    'Entrar': ['Ingresar', 'Sign in'],
    'Sair': ['Salir', 'Sign out'],
    'Não tem acesso ou esqueceu a senha? Fale com o escritório — a gente gera uma senha nova para você.': ['¿No tiene acceso u olvidó la contraseña? Hable con la oficina y le generamos una nueva.', 'No access or forgot your password? Contact the office and we will issue a new one.'],
    'Crie sua senha': ['Cree su contraseña', 'Create your password'],
    'A senha que você recebeu é temporária. Escolha uma senha sua para continuar.': ['La contraseña que recibió es temporal. Elija una contraseña propia para continuar.', 'The password you received is temporary. Choose your own password to continue.'],
    'Senha temporária': ['Contraseña temporal', 'Temporary password'],
    'Senha nova (mínimo 8 caracteres)': ['Contraseña nueva (mínimo 8 caracteres)', 'New password (at least 8 characters)'],
    'Repita a senha nova': ['Repita la contraseña nueva', 'Repeat the new password'],
    'Salvar e continuar': ['Guardar y continuar', 'Save and continue'],
    'Seu processo de': ['Su caso de', 'Your case for'],
    'Olá': ['Hola', 'Hello'],
    'Etapa': ['Etapa', 'Step'],
    'ETAPA': ['ETAPA', 'STEP'],
    'Parcela em aberto': ['Cuota pendiente', 'Payment past due'],
    'Parcela chegando': ['Cuota por vencer', 'Payment coming up'],
    'Seu caso teve atualização no USCIS': ['Su caso tuvo una actualización en USCIS', 'Your case was updated at USCIS'],

    'responsável no escritório:': ['responsable en la oficina:', 'case manager:'],
    'documentos aprovados': ['documentos aprobados', 'approved documents'],
    'faltando enviar': ['por enviar', 'still to send'],
    'para refazer': ['para rehacer', 'to redo'],
    'Seus documentos': ['Sus documentos', 'Your documents'],
    'Toque em “Enviar arquivo” no documento correspondente. Aceita foto ou PDF, até 40 MB por arquivo.': ['Toque en “Enviar archivo” en el documento correspondiente. Acepta foto o PDF, hasta 40 MB por archivo.', 'Tap “Upload file” on the matching document. Photo or PDF, up to 40 MB each.'],
    'Envie os documentos direto para o escritório.': ['Envíe los documentos directamente a la oficina.', 'Send the documents directly to the office.'],
    'Enviar arquivo': ['Enviar archivo', 'Upload file'],
    'Enviar outro arquivo': ['Enviar otro archivo', 'Upload another file'],
    'Enviando…': ['Enviando…', 'Uploading…'],
    'Arquivo enviado:': ['Archivo enviado:', 'File sent:'],
    'Arquivo maior que 40 MB.': ['El archivo supera 40 MB.', 'File is larger than 40 MB.'],
    '✓ enviado': ['✓ enviado', '✓ sent'],
    '✓ Aprovado': ['✓ Aprobado', '✓ Approved'],
    'Em análise': ['En revisión', 'Under review'],
    'Refazer': ['Rehacer', 'Redo'],
    'Enviar': ['Enviar', 'Send'],
    'Ainda não pedido': ['Aún no solicitado', 'Not requested yet'],
    'Precisamos que você envie esse documento de novo.': ['Necesitamos que envíe este documento nuevamente.', 'We need you to send this document again.'],
    'Avisos do escritório': ['Avisos de la oficina', 'Notices from the office'],
    '🇺🇸 Situação no USCIS': ['🇺🇸 Situación en USCIS', '🇺🇸 USCIS case status'],
    '🇺🇸 Protocolado': ['🇺🇸 Presentado', '🇺🇸 Filed'],
    'Atualizamos automaticamente todos os dias.': ['Lo actualizamos automáticamente todos los días.', 'We update this automatically every day.'],
    'Número do recibo': ['Número de recibo', 'Receipt number'],
    'Número do processo': ['Número del caso', 'Case number'],
    'Recibo do USCIS': ['Recibo de USCIS', 'USCIS receipt'],
    'Protocolado em': ['Presentado el', 'Filed on'],
    'Última atualização do USCIS': ['Última actualización de USCIS', 'Last USCIS update'],
    'Texto oficial do USCIS:': ['Texto oficial de USCIS:', 'Official USCIS text:'],
    'Pagamentos': ['Pagos', 'Payments'],
    'Pago até agora:': ['Pagado hasta ahora:', 'Paid so far:'],
    'Nenhuma parcela registrada.': ['No hay cuotas registradas.', 'No installments on record.'],
    'pago': ['pagado', 'paid'],
    'em aberto': ['pendiente', 'past due'],
    'a vencer': ['por vencer', 'upcoming'],
    'vence': ['vence', 'due'],
    'Ops': ['Ups', 'Oops'],
    // etapas do processo (portal)
    'Reunindo documentos': ['Reuniendo documentos', 'Gathering documents'],
    'Em revisão pelo escritório': ['En revisión por la oficina', 'Under review by the office'],
    'Protocolado no USCIS': ['Presentado ante USCIS', 'Filed with USCIS'],
    'Acompanhamento': ['Seguimiento', 'Follow-up'],
    // status do USCIS em linguagem simples
    'Recebido pelo USCIS': ['Recibido por USCIS', 'Received by USCIS'],
    'Aceito pelo USCIS': ['Aceptado por USCIS', 'Accepted by USCIS'],
    'Biometria (digitais e foto) agendada': ['Biometría (huellas y foto) agendada', 'Biometrics appointment scheduled'],
    'O USCIS pediu documentos adicionais (RFE)': ['USCIS solicitó documentos adicionales (RFE)', 'USCIS requested more evidence (RFE)'],
    'Resposta ao pedido de documentos recebida': ['Respuesta a la solicitud de documentos recibida', 'Response to the request received'],
    'Aviso de intenção de negar — vamos responder': ['Aviso de intención de negar — vamos a responder', 'Notice of intent to deny — we will respond'],
    'Entrevista agendada': ['Entrevista agendada', 'Interview scheduled'],
    'Pronto para agendar a entrevista': ['Listo para agendar la entrevista', 'Ready to schedule the interview'],
    'Cadastro atualizado no USCIS': ['Registro actualizado en USCIS', 'Record updated at USCIS'],
    'Processo transferido para outro escritório do USCIS': ['Caso transferido a otra oficina de USCIS', 'Case transferred to another USCIS office'],
    'Aprovado 🎉': ['Aprobado 🎉', 'Approved 🎉'],
    'Documento emitido e enviado pelo correio': ['Documento emitido y enviado por correo', 'Document produced and mailed'],
    'Decisão negativa — vamos avaliar os próximos passos': ['Decisión negativa — evaluaremos los próximos pasos', 'Denied — we will review the next steps'],
    'Processo encerrado': ['Caso cerrado', 'Case closed'],
    'Em análise pelo USCIS': ['En análisis por USCIS', 'Being reviewed by USCIS'],
    // ---- login e primeiro acesso ----
    'Bem-vindo(a)!': ['¡Bienvenido(a)!', 'Welcome!'],
    'Acesse sua conta para continuar.': ['Acceda a su cuenta para continuar.', 'Sign in to your account to continue.'],
    'Usuário ou e-mail': ['Usuario o correo', 'Username or e-mail'],
    'Lembrar de mim': ['Recordarme', 'Remember me'],
    'Esqueceu sua senha?': ['¿Olvidó su contraseña?', 'Forgot your password?'],
    'Usuário ou senha incorretos.': ['Usuario o contraseña incorrectos.', 'Wrong username or password.'],
    'Senha atual (temporária)': ['Contraseña actual (temporal)', 'Current password (temporary)'],
    'Senha nova': ['Contraseña nueva', 'New password'],
    'Salvar senha e entrar': ['Guardar contraseña e ingresar', 'Save password and sign in'],
    'Defina uma senha nova pra continuar. Use pelo menos 8 caracteres.': ['Defina una contraseña nueva para continuar. Use al menos 8 caracteres.', 'Set a new password to continue. Use at least 8 characters.'],
    'Acesso seguro e protegido': ['Acceso seguro y protegido', 'Secure, protected access'],
    // ---- menu do sistema ----
    'Dashboard': ['Panel', 'Dashboard'],
    'Entrada de Leads': ['Entrada de Leads', 'Incoming Leads'],
    'Funil Comercial': ['Embudo Comercial', 'Sales Pipeline'],
    'Agenda': ['Agenda', 'Calendar'],
    'Contratos': ['Contratos', 'Contracts'],
    'Clientes': ['Clientes', 'Clients'],
    'Financeiro': ['Finanzas', 'Finance'],
    'Documentação': ['Documentación', 'Documents'],
    'Processos': ['Casos', 'Cases'],
    'Tarefas': ['Tareas', 'Tasks'],
    'Relatórios': ['Informes', 'Reports'],
    'Automações': ['Automatizaciones', 'Automations'],
    'Usuários': ['Usuarios', 'Users'],
    'Configurações': ['Configuración', 'Settings'],
    'Como usar': ['Cómo usar', 'How to use'],
    'Chat': ['Chat', 'Chat'],
    'Chat Interno': ['Chat Interno', 'Team Chat'],
    'Trocar senha': ['Cambiar contraseña', 'Change password'],
    'Idioma': ['Idioma', 'Language'],
    // ---- botões e palavras que aparecem em toda parte ----
    'Salvar': ['Guardar', 'Save'],
    'Cancelar': ['Cancelar', 'Cancel'],
    'Fechar': ['Cerrar', 'Close'],
    'Remover': ['Eliminar', 'Remove'],
    'Excluir': ['Eliminar', 'Delete'],
    'Editar': ['Editar', 'Edit'],
    'Adicionar': ['Agregar', 'Add'],
    'Confirmar': ['Confirmar', 'Confirm'],
    'Voltar': ['Volver', 'Back'],
    'Buscar': ['Buscar', 'Search'],
    'Resumo': ['Resumen', 'Summary'],
    'Histórico': ['Historial', 'History'],
    'Telefone': ['Teléfono', 'Phone'],
    'Nome': ['Nombre', 'Name'],
    'Data': ['Fecha', 'Date'],
    'Valor': ['Valor', 'Amount'],
    'Status': ['Estado', 'Status'],
    'Observações': ['Observaciones', 'Notes'],
    'Checklist': ['Lista de documentos', 'Checklist'],
    'Protocolo': ['Presentación', 'Filing'],
    'Credenciais': ['Credenciales', 'Credentials'],
    'Boas-vindas': ['Bienvenida', 'Welcome'],
    'Prazos': ['Plazos', 'Deadlines'],
    '⏰ Prazos': ['⏰ Plazos', '⏰ Deadlines'],
    '👤 Portal do cliente': ['👤 Portal del cliente', '👤 Client portal'],
  };

  const idiomaSalvo = () => { try { return localStorage.getItem(CHAVE) || ''; } catch (e) { return ''; } };
  const doNavegador = () => (navigator.language || 'pt').slice(0, 2).toLowerCase();
  function idiomaAtual() {
    const url = new URLSearchParams(location.search).get('lang');
    if (url && IDIOMAS[url]) { try { localStorage.setItem(CHAVE, url); } catch (e) {} return url; }
    const salvo = idiomaSalvo();
    if (salvo && IDIOMAS[salvo]) return salvo;
    const nav = doNavegador();
    return IDIOMAS[nav] ? nav : 'pt';
  }

  let idioma = idiomaAtual();
  const col = () => (idioma === 'es' ? 0 : 1);
  function traduzir(txt) {
    if (idioma === 'pt' || !txt) return null;
    const limpo = txt.trim();
    if (!limpo) return null;
    const achou = D[limpo];
    if (achou) return txt.replace(limpo, achou[col()]);
    return null;
  }

  function percorrer(raiz) {
    if (idioma === 'pt' || !raiz) return;
    const it = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const trocar = [];
    let n; while ((n = it.nextNode())) { const t = traduzir(n.nodeValue); if (t !== null) trocar.push([n, t]); }
    trocar.forEach(([no, t]) => { no.nodeValue = t; });
    const alvo = raiz.querySelectorAll ? raiz : document;
    alvo.querySelectorAll && alvo.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
      ['placeholder', 'title', 'aria-label'].forEach(attr => {
        const v = el.getAttribute(attr); if (!v) return;
        const t = traduzir(v); if (t !== null) el.setAttribute(attr, t);
      });
    });
  }

  function aplicar() {
    document.documentElement.lang = idioma === 'pt' ? 'pt-BR' : idioma;
    percorrer(document.body);
  }

  // conteúdo montado pelo JavaScript depois: traduz o que for aparecendo.
  // Os nós vão para uma fila (não se perde nada quando várias telas renderizam juntas).
  let pendente = null; const fila = [];
  function esvaziarFila() {
    pendente = null;
    while (fila.length) {
      const n = fila.shift();
      if (!n.isConnected) continue;
      if (n.nodeType === 3) { const t = traduzir(n.nodeValue); if (t !== null) n.nodeValue = t; }
      else percorrer(n);
    }
  }
  function observar() {
    if (idioma === 'pt') return;
    new MutationObserver((muts) => {
      muts.forEach(m => m.addedNodes && m.addedNodes.forEach(n => { if (n.nodeType === 1 || n.nodeType === 3) fila.push(n); }));
      if (!fila.length || pendente) return;
      pendente = setTimeout(esvaziarFila, 60);
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.LW = window.LW || {};
  window.LW.idioma = () => idioma;
  window.LW.idiomas = IDIOMAS;
  window.LW.trocarIdioma = (novo) => {
    if (!IDIOMAS[novo]) return;
    try { localStorage.setItem(CHAVE, novo); } catch (e) {}
    location.reload();
  };
  window.LW.traduzir = (txt) => traduzir(txt) ?? txt;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { aplicar(); observar(); });
  else { aplicar(); observar(); }
})();
