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
  sdr.html                — Fase 3: fila de recuperação de leads sem retorno, tentativas, follow-up futuro, devolução ao vendedor original
  agenda.html            — Fase 4: agenda compartilhada (visão Dia e Lista 14 dias, filtro por vendedor, agendar reunião, conflito de horário, status e resultado pós-reunião)
  assets/logo.png         — logo original enviado
  assets/logo-small.png   — versão 160x160 usada nas telas
  assets/favicon.png      — versão 64x64 usada como favicon
```

## Identidade visual

Cores extraídas do logo oficial (Legal Way Group):
- Navy: `#16204F`
- Magenta/roxo (acento): `#86285F`
- Papel/fundo: `#FAFAF8`
Tipografia: Fraunces (títulos) + IBM Plex Sans (interface).

## Status por módulo

| Módulo | Status |
|---|---|
| Entrada de Leads (Caixa de Entrada, Novos Leads, Assumir Lead, deduplicação, cadastro manual — Google Ads/Indicação/Outro) | 🟡 Em teste interno, dados simulados |
| Funil Comercial (kanban por etapa, ficha do lead, follow-up, saídas com motivo, alertas) | 🟡 Em teste interno, dados simulados |
| SDR (fila de recuperação, tentativas, follow-up, devolução ao vendedor, agendamento de reunião com fuso horário) | 🟡 Em teste interno, dados simulados |
| Agenda (visão Dia/Lista, filtro por vendedor, conflito de horário, status, resultado pós-reunião) | 🟡 Em teste interno, dados simulados |
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
