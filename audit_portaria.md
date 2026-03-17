# Relatório de Auditoria Técnica e Hardening: PDV Portaria

**Data:** 15 de Março de 2026
**Sistema:** Balneário Rio Preto - Módulo Portaria

---

## 1. Escopo e Motivação

A auditoria teve como objetivo identificar gargalos financeiros, falhas de segurança operacionais e ausência de trilhas de auditoria (audit logs) no processo de recebimento da Portaria do Balneário Rio Preto, propondo e implementando um plano de _Hardening_ (endurecimento de segurança).

As operações da Portaria lidam diretamente com o fluxo primário de dinheiro (Pix, Cartões e Dinheiro em espécie) e um lançamento indevido, sem comprovante, gera problemas diretos no fechamento de caixa e na contabilidade.

## 2. Vulnerabilidades Identificadas (Estado Anterior)

1. **[CRÍTICO] Ausência de Comprovação de Pagamento:** Lançamentos podiam ser feitos informando qualquer valor digital, sem obrigação de vincular NSU (Número Sequencial Único), código de autorização ou comprovante físico/foto.
2. **[CRÍTICO] Sem Trilha de Auditoria (Logs):** A tabela `gate_entries` era mutável. Não existia registro de quem criou, cancelou ou estornou um lançamento, impossibilitando identificar fraudes internas.
3. **[ALTO] Risco de Duplo Faturamento (Race Condition):** Cliques duplos no botão de registro da portaria, ou instabilidade de rede, criavam cobranças/registros duplicados sem verificação de **Idempotência**.
4. **[MÉDIO] Fechamento Cego:** O "Fechamento do Dia" somava cegamente todas as entradas na tabela, incluindo aquelas indevidas que precisariam ser canceladas. Faltava um ciclo de vida financeiro (`payment_status`).
5. **[MÉDIO] Autenticação no Front-end:** O sistema atual confia em LocalStorage para manter a sessão (baseado num hash PIN). 

## 3. Resumo das Mitigações Implementadas (Fase 1)

O novo sistema autônomo e embutido (`portaria.html` e `portaria.js`) resolveu a maioria dos gargalos imediatos.

### Módulo de Banco de Dados (Supabase)
- **Tabelas de Hardening:** Criada a tabela `gate_payments` (registro financeiro dependente) e `gate_entry_events` (tabela insert-only de log imutável).
- **Idempotency Key:** Nova constraint `UNIQUE` em `idempotency_key` (UUID v4) na tabela `gate_entries`, evitando clones de requests na mesma sessão.
- **Ciclo de Vida de Pagamento:** Novo campo `payment_status` (`pending`, `verified`, `cancelled`, `refunded`), com rastreabilidade explícita (`cancel_reason`, `refund_reason`, `refunded_by`).
- **Bucket Privado:** Comprovantes digitais (fotos de tela da maquininha ou prints PIX) agora possuem um bucket restrito `gate-payment-proofs`.

### Interface PDV (`portaria.js`)
- **Regras Rígidas:** Se o tipo não for `Dinheiro`, The upload do comprovante digital + o NSU da transação são **obrigatórios**.
- **Ações Ativas (Imutáveis na Interface):** Cancelações/Estornos exigem obrigatoriamente um justificativa preenchida pelo operador da sessão. O front-end bloqueia o envio caso vazio.
- Fechamento: O Caixa e o Fechamento administrativo agora separam visualmente (e não somam no caixa local) os valores estornados e cancelados.

## 4. Matriz de Risco (Riscos Residuais)

Apesar da forte barreira de integridade inserida, algumas camadas técnicas herdam legados arquiteturais.

| Risco Descrito | Severidade Atual | Probabilidade | Mitigação Aplicada | Próximo Passo (Recomendado) |
| :--- | :---: | :---: | :--- | :--- |
| **Bypass de Client-Side Auth** (Operador manipular LocalStorage para clonar acesso admin) | Alto | Baixo | RLS básico implementado no Supabase. | **Migração de Auth.** Passar do modelo PIN manual nativo para JWT Tokens e Supabase Auth oficial do lado do servidor (Edge Functions). |
| **Manipulação de Preço Payload** (Um atacante técnico enviar payload via API com Preço=R$0) | Alto | Baixo | Registro detalhado na tabela de auditoria (`pricing_snapshot`) indicará anomalia visível aos donos. | **Recálculo Base Backend.** O valor total (`amount_paid`) deve ser calculado/validado OBRIGATORIAMENTE dentro de uma RPC/Function no Supabase antes da inserção. |
| **Cancelamento Fraudulento Pós-turno** (Cancelar transações sem supervisão após o caixa bater) | Médio | Baixo | RLS + Auditoria mostra hora exata e quem fez o evento `cancelled`. | Inserir webhook de notificação via Discord/Telegram que alerte a diretoria para todo `cancelled` ou `refunded` superior a R$50. |

## 5. Próximos Passos e Melhorias Planejadas a Longo Prazo

Para tornar o balneário e sua parte financeira "à prova de balas", sugerimos a **Fase 2 de Hardening:**

1. **Assinatura JWT:** Eliminar o `sistema_auth.js` usando LocalStorage em prol de Sessões Assinadas (`@supabase/ssr`).
2. **Webhooks Financeiros:** Um canal no celular dos gerentes indicando ao vivo toda vez que um cancelamento for feito na Portaria.
3. **Checkout Transparente Físico:** Integração das maquininhas locais de cartão (ex: PagSeguro PlugPag ou Stone) via API para não precisar de upload da foto, validando eletronicamente a transação.
