# Legal Way Group — Sistema Integrado

Sistema operacional próprio da Legal Way Group, construído módulo a módulo seguindo o fluxo:

MARKETING → WHATSAPP OFICIAL → LEAD → COMERCIAL → SDR → AGENDA → REUNIÃO → PROPOSTA → CONTRATO → CLIENTE → FINANCEIRO + DOCUMENTAÇÃO/PROCESSOS → PROTOCOLO → ACOMPANHAMENTO

## Padrão do projeto

Segue o mesmo padrão dos outros sistemas (Vitrine Orlando / Repasse, legalway-contratos):
- Cada tela é um arquivo HTML autocontido dentro de `docs/` (HTML + CSS + JS no mesmo arquivo, sem build step)
- Persistência de dados: durante a fase de testes, usando storage do próprio ambiente de protótipo; na fase 2 (produção), conecta em backend real
- Sem necessidade de terminal/código no dia a dia — cada tela tem os controles necessários na própria interface

**Fase atual: desenvolvimento e teste local.** Nada foi publicado ainda.
Quando o fluxo completo estiver validado internamente, sobe para um **servidor rodando 24/7** (não dá pra ser só GitHub Pages/hospedagem estática, porque o sistema vai precisar receber webhooks do Meta em tempo real — Lead Ads e WhatsApp Cloud API). Decisão de qual servidor/hospedagem fica pra quando chegar essa fase.

## Estrutura

```
docs/
  index.html            — página inicial, lista os módulos
  entrada-leads.html     — Fase 1: Caixa de Entrada + Novos Leads (entrada/distribuição/deduplicação)
  funil-comercial.html   — Fase 2: kanban por etapa, ficha do lead (resumo/histórico/comunicação/agenda/follow-up/comercial/arquivos), saídas com motivo, alertas
```

## Status por módulo

| Módulo | Status |
|---|---|
| Entrada de Leads (Caixa de Entrada, Novos Leads, Assumir Lead, deduplicação) | 🟡 Em teste interno, dados simulados |
| Funil Comercial (kanban por etapa, ficha do lead, follow-up, saídas com motivo, alertas) | 🟡 Em teste interno, dados simulados |
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
