# Legal Way Group — Sistema Integrado

Sistema operacional próprio da Legal Way Group, construído módulo a módulo seguindo o fluxo:

MARKETING → WHATSAPP OFICIAL → LEAD → COMERCIAL → SDR → AGENDA → REUNIÃO → PROPOSTA → CONTRATO → CLIENTE → FINANCEIRO + DOCUMENTAÇÃO/PROCESSOS → PROTOCOLO → ACOMPANHAMENTO

## Padrão do projeto

Segue o mesmo padrão dos outros sistemas (Vitrine Orlando / Repasse, legalway-contratos):
- Cada tela é um arquivo HTML autocontido dentro de `docs/` (HTML + CSS + JS no mesmo arquivo, sem build step)
- `docs/` é publicado via **GitHub Pages**
- Persistência de dados: durante a fase de testes, usando storage do próprio ambiente de protótipo; na fase 2 (produção), conecta em backend real (a decidir: Firebase, seguindo o padrão do Central, ou outro)
- Sem necessidade de terminal/código no dia a dia — cada tela tem os controles necessários na própria interface

## Estrutura

```
docs/
  index.html            — página inicial, lista os módulos
  entrada-leads.html     — Fase 1: Caixa de Entrada + Novos Leads (entrada/distribuição/deduplicação)
```

## Status por módulo

| Módulo | Status |
|---|---|
| Entrada de Leads (Caixa de Entrada, Novos Leads, Assumir Lead, deduplicação) | 🟡 Em teste interno, dados simulados |
| Funil Comercial | ⚪ Não iniciado |
| SDR | ⚪ Não iniciado |
| Agenda | ⚪ Não iniciado |
| Clientes | ⚪ Não iniciado |
| Contratos | ⚪ Não iniciado |
| Financeiro | ⚪ Não iniciado |
| Documentação / Processos | ⚪ Não iniciado |
| Marketing (dashboard de tráfego) | ⚪ Não iniciado |

## Fase de conexões reais (depois da validação interna)

Quando o fluxo de entrada estiver validado:
- Lead Ads (formulário nativo do Meta) → webhook de leadgen
- WhatsApp oficial → WhatsApp Cloud API (Meta) — já conectado, só falta ligar ao sistema
- Precisa de um backend rodando 24h para receber os webhooks (não dá com GitHub Pages sozinho) — decidir onde hospedar antes de subir
- Importante: a conexão nova roda **em paralelo** ao Kommo, sem desligar o que já está funcionando, até validação completa
