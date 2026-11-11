// PRÉ-RESERVA GRÁTIS (24 horas) — página de reservas
//
// Por quê: no Clarity (10 e 11/nov) as pessoas simulavam datas, pessoas e chalé, iam para a galeria
// e saíam. Ninguém tocou em "Reservar": é um passo de compromisso para quem ainda está pesquisando.
// A pré-reserva é um passo menor (sem pagamento, sem conversa no WhatsApp) que segura o chalé por 24h.
//
// Quando aparece: só para quem já mostrou interesse de verdade — escolheu um chalé, mexeu na quantidade
// de pessoas e viu o valor total da simulação — e então dá um sinal de que vai sair:
//   - volta para a página depois de ter saído (trocou de app/aba),
//   - fecha a galeria de fotos/vídeos,
//   - fica 25 segundos parado,
//   - no computador, leva o mouse para fora da página (para fechar a aba).
// Uma vez por aparelho a cada 24h. A OFERTA vale 20 minutos (temporizador na tela, para incentivar a decisão);
// depois some. A pré-reserva em si vale 24h e isso aparece só escrito (sem contagem regressiva).
//
// O banco (função criar_pre_reserva, ver add_pre_reserva.sql) confere tudo: chalé livre,
// datas válidas e 1 pré-reserva ativa por celular e por aparelho.

const CHAVE_ATIVA = 'pr_ativa_v1';        // pré-reserva deste aparelho (para mostrar o temporizador)
const CHAVE_OFERTA = 'pr_oferta_v1';      // { em, ate }: quando a oferta foi mostrada (1x a cada 24h) e até quando vale
const CHAVE_APARELHO = 'pr_aparelho_v1';  // id aleatório do aparelho (limite de 1 por aparelho)
const OCIOSO_MS = 25000;
const DIA_MS = 24 * 60 * 60 * 1000;
const OFERTA_MS = 20 * 60 * 1000;          // tempo para decidir se pega a pré-reserva

let cfg = null;          // { supabase, openWhatsApp, estado, atualizarDisponibilidade, marcar }
let armado = false;      // já escolheu datas + chalé
let saiuEm = 0;
let timerOcioso = null;
let timerRelogio = null;
let enviando = false;
let timerOferta = null;
let mexeuPessoas = false;  // tocou em + / − de adultos, crianças ou bebês
let viuValor = false;      // o "Total Estimado" ficou na tela por pelo menos 1 segundo
let modoTeste = false;   // ?pre_reserva=1 na URL: mostra a oferta assim que escolher o chalé

// --- armazenamento local (pode falhar em aba anônima / navegador interno) ---
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const apagar = (k) => { try { localStorage.removeItem(k); } catch (e) { } };

function aparelhoId() {
    let id = ler(CHAVE_APARELHO);
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
        gravar(CHAVE_APARELHO, id);
    }
    return id;
}

export function minhaPreReserva() {
    const pr = ler(CHAVE_ATIVA);
    if (!pr) return null;
    if (new Date(pr.expires_at).getTime() <= Date.now()) { apagar(CHAVE_ATIVA); return null; }
    return pr;
}

function marcar(evento) {
    try { cfg?.marcar ? cfg.marcar(evento, false) : window.clarity?.("event", evento); } catch (e) { }
}

// --- formatação ---
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function dataCurta(iso) { // '2026-11-14' -> 'sex, 14/11'
    const [y, m, d] = iso.split('-').map(Number);
    return `${DIAS[new Date(y, m - 1, d).getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
function quando(isoTs) { // validade: 'qui, 12/11 às 15:42'
    const t = new Date(isoTs);
    const dia = DIAS[t.getDay()];
    const dd = String(t.getDate()).padStart(2, '0'), mm = String(t.getMonth() + 1).padStart(2, '0');
    const hh = String(t.getHours()).padStart(2, '0'), mi = String(t.getMinutes()).padStart(2, '0');
    return `${dia}, ${dd}/${mm} às ${hh}:${mi}`;
}
function restante(isoTs) {
    const ms = Math.max(0, new Date(isoTs).getTime() - Date.now());
    const s = Math.floor(ms / 1000);
    const p = (n) => String(n).padStart(2, '0');
    return { ms, txt: `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` };
}
function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
// Oferta mostrada: { em, ate }. (Versão antiga guardava só o número de quando foi mostrada.)
function ofertaGravada() {
    const v = ler(CHAVE_OFERTA);
    if (!v) return null;
    return typeof v === 'number' ? { em: v, ate: v + OFERTA_MS } : v;
}
function ofertaRestaMs() {
    const o = ofertaGravada();
    return o ? o.ate - Date.now() : 0;
}

function formatarCel(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- estilos próprios (não dependem do Tailwind) ---
const CSS = `
.pr-fundo{position:fixed;inset:0;z-index:10000;background:rgba(17,24,39,.55);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}
.pr-fundo.pr-on{opacity:1}
@media(min-width:768px){.pr-fundo{align-items:center}}
.pr-caixa{position:relative;width:100%;max-width:440px;max-height:92vh;overflow-y:auto;background:#fff;border-radius:22px 22px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -10px 40px rgba(0,0,0,.25);transform:translateY(30px);transition:transform .25s ease;font-family:Inter,system-ui,sans-serif;color:#111827}
.pr-on .pr-caixa{transform:none}
@media(min-width:768px){.pr-caixa{border-radius:22px}}
.pr-fechar{position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;border-radius:999px;background:#f3f4f6;color:#6b7280;font-size:20px;line-height:36px;cursor:pointer}
.pr-selo{display:inline-flex;align-items:center;gap:6px;background:#FEF3C7;color:#92400E;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.pr-oferta-tempo{display:flex;align-items:center;gap:6px;margin:10px 0 0;font-size:13px;font-weight:700;color:#B45309}
.pr-oferta-tempo b{font-variant-numeric:tabular-nums;font-weight:900;font-size:15px;color:#92400E}
.pr-titulo{font-size:21px;line-height:1.2;font-weight:900;margin:10px 0 12px}
.pr-sub{font-size:14px;color:#4b5563;margin:0 0 14px;line-height:1.4}
.pr-resumo{border:2px solid #FCD34D;background:#FFFBEB;border-radius:16px;padding:12px 14px;margin-bottom:12px}
.pr-resumo-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.pr-chale{font-weight:900;font-size:17px}
.pr-total{font-weight:900;font-size:17px;color:#2E7D32;white-space:nowrap}
.pr-linha{font-size:13px;color:#4b5563;margin-top:3px}
.pr-escassez{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#B45309;margin:0 0 12px}
.pr-lista{list-style:none;padding:0;margin:0 0 12px;display:grid;gap:6px}
.pr-lista li{display:flex;gap:8px;font-size:14px;line-height:1.35;color:#1f2937}
.pr-lista i{color:#2E7D32;margin-top:2px}
.pr-campo{margin-bottom:10px}
.pr-campo label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:#6b7280;margin:0 0 4px 2px}
.pr-campo input{width:100%;box-sizing:border-box;border:1.5px solid #e5e7eb;border-radius:12px;padding:12px 14px;font-size:16px;font-weight:600;color:#111827;background:#f9fafb;outline:none}
.pr-campo input:focus{border-color:#2E7D32;background:#fff}
.pr-campo.pr-erro input{border-color:#dc2626}
.pr-msg-erro{display:none;color:#dc2626;font-size:12px;font-weight:700;margin:4px 2px 0}
.pr-campo.pr-erro .pr-msg-erro{display:block}
.pr-botao{width:100%;border:0;border-radius:14px;background:#2E7D32;color:#fff;font-weight:800;font-size:17px;padding:15px 16px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;box-shadow:0 8px 20px rgba(46,125,50,.28)}
.pr-botao:active{transform:scale(.99)}
.pr-botao[disabled]{opacity:.7}
.pr-botao-zap{background:#25D366;box-shadow:0 8px 20px rgba(37,211,102,.3)}
.pr-segundo{display:block;width:100%;margin-top:8px;border:0;background:none;color:#6b7280;font-size:14px;font-weight:600;padding:10px;cursor:pointer}
.pr-letra{font-size:11px;color:#9ca3af;text-align:center;margin:8px 0 0;line-height:1.4}
.pr-aviso{display:none;background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:10px}
.pr-prazo{display:flex;gap:8px;align-items:flex-start;background:#FFFBEB;border-radius:12px;padding:10px 12px;margin:0 0 12px;font-size:14px;line-height:1.4;color:#78350F}
.pr-prazo i{margin-top:3px;color:#B45309}
.pr-chip{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:45;display:flex;align-items:center;gap:10px;background:#FEF3C7;border:1.5px solid #FCD34D;color:#78350F;border-radius:14px;padding:9px 12px;box-shadow:0 6px 20px rgba(0,0,0,.12);font-family:Inter,system-ui,sans-serif;cursor:pointer;max-width:440px;margin:0 auto}
@media(min-width:768px){.pr-chip{left:auto;right:20px;bottom:20px;width:360px}}
.pr-chip b{font-weight:900}
.pr-chip .pr-chip-txt{flex:1;min-width:0;font-size:13px;line-height:1.25}
.pr-chip .pr-chip-tempo{font-variant-numeric:tabular-nums;font-weight:900;font-size:15px}
.pr-chip .pr-chip-x{border:0;background:none;color:#92400E;font-size:18px;padding:0 2px;cursor:pointer}
`;

function injetarCss() {
    if (document.getElementById('pr-css')) return;
    const st = document.createElement('style');
    st.id = 'pr-css';
    st.textContent = CSS;
    document.head.appendChild(st);
}

// --- janela (oferta e sucesso usam a mesma) ---
function abrirJanela(html, aoFechar) {
    fecharJanela();
    const fundo = document.createElement('div');
    fundo.className = 'pr-fundo';
    fundo.id = 'pr-janela';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.innerHTML = `<div class="pr-caixa"><button type="button" class="pr-fechar" aria-label="Fechar">&times;</button>${html}</div>`;
    document.body.appendChild(fundo);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => fundo.classList.add('pr-on'));
    const fechar = () => { fecharJanela(); aoFechar && aoFechar(); };
    fundo.querySelector('.pr-fechar').onclick = fechar;
    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
    return fundo;
}
function fecharJanela() {
    const j = document.getElementById('pr-janela');
    if (j) j.remove();
    document.body.style.overflow = '';
    clearInterval(timerRelogio);
    clearInterval(timerOferta);
}

function resumoHtml(e) {
    const pessoas = e.adultos + e.criancas;
    return `
      <div class="pr-resumo">
        <div class="pr-resumo-top"><span class="pr-chale">${esc(e.chaleNome)}</span><span class="pr-total">${esc(e.totalTexto)}</span></div>
        <div class="pr-linha">${dataCurta(e.checkin)} → ${dataCurta(e.checkout)} • ${e.noites} ${e.noites === 1 ? 'noite' : 'noites'} • ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}</div>
        ${e.area ? `<div class="pr-linha">${esc(e.area)}</div>` : ''}
      </div>`;
}

// --- OFERTA ---
function mostrarOferta(gatilho, reabrindo = false) {
    const e = cfg.estado();
    if (!e || !e.chaletId || !(e.noites > 0)) return;
    if (minhaPreReserva() || document.getElementById('pr-janela')) return;
    if (document.getElementById('marketing-lightbox') && !document.getElementById('marketing-lightbox').classList.contains('hidden')) return;

    // Primeira vez: começam os 20 minutos. Reabrindo pela faixa: continua o mesmo tempo.
    if (!reabrindo) gravar(CHAVE_OFERTA, { em: Date.now(), ate: Date.now() + OFERTA_MS });
    if (ofertaRestaMs() <= 0) return;
    desarmar();
    marcar('oferta_pre_reserva');
    try { window.clarity?.('set', 'gatilho_pre_reserva', gatilho); } catch (err) { }

    const livres = e.livresNasDatas;
    const escassez = (typeof livres === 'number' && livres > 0 && livres <= 3)
        ? `<p class="pr-escassez"><i class="fa-solid fa-fire"></i> ${livres === 1 ? 'Este é o último chalé livre' : `Só restam ${livres} chalés livres`} nessas datas</p>` : '';

    const j = abrirJanela(`
      <span class="pr-selo"><i class="fa-solid fa-gift"></i> Presente para você</span>
      <p class="pr-oferta-tempo"><i class="fa-regular fa-clock"></i> Oferta válida por <b id="pr-oferta-relogio">${mmss(ofertaRestaMs())}</b></p>
      <h2 class="pr-titulo">Ainda decidindo? Segure o ${esc(e.chaleNome)} grátis por 24 horas</h2>
      ${resumoHtml(e)}
      ${escassez}
      <ul class="pr-lista">
        <li><i class="fa-solid fa-lock"></i><span>Ninguém mais consegue reservar este chalé nessas datas por 24h</span></li>
        <li><i class="fa-solid fa-credit-card"></i><span>Sem pagamento e sem cartão</span></li>
        <li><i class="fa-solid fa-rotate-left"></i><span>Desistiu? Não precisa fazer nada: a pré-reserva expira sozinha</span></li>
      </ul>
      <div class="pr-aviso" id="pr-aviso"></div>
      <div class="pr-campo" id="pr-campo-nome">
        <label for="pr-nome">Seu nome</label>
        <input id="pr-nome" type="text" autocomplete="name" placeholder="Como podemos te chamar?" value="${esc(e.nome)}">
        <p class="pr-msg-erro">Digite seu nome.</p>
      </div>
      <div class="pr-campo" id="pr-campo-cel">
        <label for="pr-cel">Seu celular (WhatsApp)</label>
        <input id="pr-cel" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="15" placeholder="(69) 99999-9999" value="${esc(formatarCel(e.celular))}">
        <p class="pr-msg-erro">Digite seu celular com DDD.</p>
      </div>
      <button type="button" class="pr-botao" id="pr-garantir"><i class="fa-solid fa-gift"></i> Garantir meu chalé grátis</button>
      <button type="button" class="pr-segundo" id="pr-agora-nao">Agora não</button>
      <p class="pr-letra">Usamos seu nome e celular só para identificar sua pré-reserva. Uma por pessoa.</p>
    `, () => recusou('fechar'));

    const cel = j.querySelector('#pr-cel');
    cel.addEventListener('input', () => { cel.value = formatarCel(cel.value); j.querySelector('#pr-campo-cel').classList.remove('pr-erro'); });
    j.querySelector('#pr-nome').addEventListener('input', () => j.querySelector('#pr-campo-nome').classList.remove('pr-erro'));
    j.querySelector('#pr-agora-nao').onclick = () => { fecharJanela(); recusou('agora_nao'); };
    j.querySelector('#pr-garantir').onclick = () => garantir(j, e);

    // Temporizador da oferta: quando acaba, o botão trava e a oferta não volta mais hoje
    const rel = j.querySelector('#pr-oferta-relogio');
    timerOferta = setInterval(() => {
        const resta = ofertaRestaMs();
        rel.textContent = mmss(resta);
        if (resta <= 0) { clearInterval(timerOferta); encerrarOferta(j); }
    }, 1000);
}

function encerrarOferta(j) {
    if (enviando) return; // está garantindo neste momento: deixa terminar
    marcar('oferta_pre_reserva_expirou');
    const btn = j.querySelector('#pr-garantir');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-regular fa-clock"></i> Oferta encerrada';
    const aviso = j.querySelector('#pr-aviso');
    aviso.textContent = 'O tempo desta oferta acabou. Você ainda pode enviar seu pedido pelo WhatsApp no formulário.';
    aviso.style.display = 'block';
    j.querySelector('#pr-agora-nao').textContent = 'Fechar';
}

function recusou(como) {
    marcar('pre_reserva_recusada');
    try { window.clarity?.('set', 'pre_reserva_recusa', como); } catch (e) { }
    mostrarChipOferta();
}

async function garantir(j, e) {
    if (enviando) return;
    const nome = j.querySelector('#pr-nome').value.trim();
    const celular = j.querySelector('#pr-cel').value.trim();
    const dig = celular.replace(/\D/g, '');
    let falta = false;
    if (nome.length < 2) { j.querySelector('#pr-campo-nome').classList.add('pr-erro'); falta = true; }
    if (dig.length < 10 || dig.length > 11) { j.querySelector('#pr-campo-cel').classList.add('pr-erro'); falta = true; }
    if (falta) { marcar('pre_reserva_erro_dados'); (nome.length < 2 ? j.querySelector('#pr-nome') : j.querySelector('#pr-cel')).focus(); return; }
    if (ofertaRestaMs() <= 0) { encerrarOferta(j); return; }

    // Leva os dados para o formulário da página também (se depois a pessoa usar o botão do WhatsApp)
    const n = document.getElementById('nome-reserva'), c = document.getElementById('celular-reserva');
    if (n && !n.value) n.value = nome;
    if (c && !c.value) c.value = formatarCel(celular);

    const btn = j.querySelector('#pr-garantir');
    const aviso = j.querySelector('#pr-aviso');
    aviso.style.display = 'none';
    enviando = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Garantindo seu chalé...';

    try {
        const { data, error } = await cfg.supabase.rpc('criar_pre_reserva', {
            p_nome: nome, p_celular: dig, p_aparelho: aparelhoId(), p_chalet_id: e.chaletId,
            p_checkin: e.checkin, p_checkout: e.checkout, p_adultos: e.adultos, p_criancas: e.criancas,
            p_total: e.total, p_horario: e.horario || null
        });
        if (error) throw error;

        if (data && data.ok) {
            const pr = { id: data.id, chaletId: data.chalet_id, chaleNome: e.chaleNome, checkin: data.checkin, checkout: data.checkout,
                expires_at: data.expires_at, nome, celular: dig, totalTexto: e.totalTexto, noites: e.noites, adultos: e.adultos, criancas: e.criancas, area: e.area };
            gravar(CHAVE_ATIVA, pr);
            marcar('pre_reserva_criada');
            try { window.trackWhatsappLead && window.trackWhatsappLead(); } catch (err) { } // conversão (Google Ads / OpenAI): é um lead com nome e celular
            try { cfg.captureLead && cfg.captureLead({ name: nome, email: '', celular: formatarCel(dig), intention: 'pre_reserva_site', details: { chalet: e.chaleNome, checkin: e.checkin, checkout: e.checkout, total: e.total, expires_at: data.expires_at } }).catch(() => { }); } catch (err) { }
            mostrarSucesso(pr, true);
            cfg.atualizarDisponibilidade && cfg.atualizarDisponibilidade();
            return;
        }

        const erro = data && data.erro;
        if (erro === 'ja_tem') {
            const pr = { id: data.id, chaletId: data.chalet_id, chaleNome: `Chalé ${data.chalet_id}`, checkin: data.checkin, checkout: data.checkout,
                expires_at: data.expires_at, nome, celular: dig };
            gravar(CHAVE_ATIVA, pr);
            marcar('pre_reserva_erro_ja_tem');
            mostrarSucesso(pr, false);
            return;
        }
        marcar(`pre_reserva_erro_${erro || 'desconhecido'}`);
        const textos = {
            ocupado: 'Puxa, alguém acabou de garantir este chalé. Escolha outro chalé livre e tente de novo.',
            datas: 'Confira as datas de entrada e saída e tente de novo.',
            nome: 'Digite seu nome.', celular: 'Digite seu celular com DDD.', chale: 'Escolha um chalé e tente de novo.'
        };
        aviso.textContent = textos[erro] || 'Não deu certo agora. Tente de novo em instantes.';
        aviso.style.display = 'block';
        if (erro === 'ocupado') cfg.atualizarDisponibilidade && cfg.atualizarDisponibilidade();
    } catch (err) {
        console.error('Pré-reserva:', err);
        marcar('pre_reserva_erro_rede');
        aviso.textContent = 'Não conseguimos garantir agora (conexão). Tente de novo ou chame a gente no WhatsApp.';
        aviso.style.display = 'block';
    } finally {
        enviando = false;
        if (document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-gift"></i> Garantir meu chalé grátis'; }
    }
}

// --- SUCESSO / TEMPORIZADOR ---
function mensagemWhatsapp(pr) {
    const cod = String(pr.id || '').slice(0, 6).toUpperCase();
    return `Olá! Me chamo *${pr.nome}*.\nFiz uma *pré-reserva grátis* no site e quero confirmar:\n\n` +
        `🏠 *${pr.chaleNome}*\n📅 ${dataCurta(pr.checkin)} até ${dataCurta(pr.checkout)}\n` +
        (pr.totalTexto ? `💰 Total estimado: ${pr.totalTexto}\n` : '') +
        `⏳ Válida até ${quando(pr.expires_at)}\n🔖 Código: ${cod}\n\nComo faço para confirmar?`;
}

function mostrarSucesso(pr, nova) {
    removerChip();
    const primeiroNome = esc(String(pr.nome || '').split(' ')[0]);
    const j = abrirJanela(`
      <span class="pr-selo"><i class="fa-solid fa-circle-check"></i> ${nova ? 'Pré-reserva garantida' : 'Você já tem uma pré-reserva'}</span>
      <h2 class="pr-titulo">${nova ? `Pronto${primeiroNome ? ', ' + primeiroNome : ''}! ` : ''}O ${esc(pr.chaleNome)} está pré-reservado para você</h2>
      <p class="pr-prazo"><i class="fa-solid fa-hourglass-half"></i><span>Você tem <b>24 horas</b> para decidir. Se não confirmar até <b>${quando(pr.expires_at)}</b>, a pré-reserva expira automaticamente.</span></p>
      ${pr.totalTexto ? resumoHtml({ ...pr, adultos: pr.adultos || 0, criancas: pr.criancas || 0 }) : `<div class="pr-resumo"><div class="pr-chale">${esc(pr.chaleNome)}</div><div class="pr-linha">${dataCurta(pr.checkin)} → ${dataCurta(pr.checkout)}</div></div>`}
      <ul class="pr-lista">
        <li><i class="fa-solid fa-lock"></i><span>O chalé já aparece como pré-reservado para os outros visitantes</span></li>
        <li><i class="fa-brands fa-whatsapp"></i><span>Para confirmar, é só mandar a mensagem pronta no WhatsApp</span></li>
      </ul>
      <button type="button" class="pr-botao pr-botao-zap" id="pr-zap"><i class="fa-brands fa-whatsapp" style="font-size:22px"></i> Confirmar pelo WhatsApp</button>
      <button type="button" class="pr-segundo" id="pr-depois">Decidir depois</button>
    `, () => mostrarChipAtiva());

    j.querySelector('#pr-zap').onclick = () => { marcar('pre_reserva_whatsapp'); cfg.openWhatsApp({ text: mensagemWhatsapp(pr) }); };
    j.querySelector('#pr-depois').onclick = () => { fecharJanela(); mostrarChipAtiva(); };
}

// --- faixa amarela (fica na tela) ---
function removerChip() { document.getElementById('pr-chip')?.remove(); clearInterval(removerChip.t); }

function mostrarChipAtiva() {
    const pr = minhaPreReserva();
    if (!pr) return;
    removerChip();
    const chip = document.createElement('div');
    chip.className = 'pr-chip';
    chip.id = 'pr-chip';
    chip.innerHTML = `<i class="fa-solid fa-gift" style="font-size:18px"></i>
      <span class="pr-chip-txt"><b>${esc(pr.chaleNome)}</b> pré-reservado para você até ${quando(pr.expires_at)}<br>Toque para confirmar</span>`;
    chip.onclick = () => { marcar('pre_reserva_reaberta'); mostrarSucesso(pr, false); };
    document.body.appendChild(chip);
    // Sem contagem regressiva: só confere de minuto em minuto se já venceu
    removerChip.t = setInterval(() => {
        if (restante(pr.expires_at).ms <= 0) { apagar(CHAVE_ATIVA); removerChip(); cfg.atualizarDisponibilidade && cfg.atualizarDisponibilidade(); }
    }, 60000);
}

// Quem disse "agora não" ainda pode voltar à oferta por uma faixa discreta (some se mudar o chalé)
function mostrarChipOferta() {
    const e = cfg.estado();
    if (!e || !e.chaletId || minhaPreReserva() || ofertaRestaMs() <= 0) return;
    removerChip();
    const chip = document.createElement('div');
    chip.className = 'pr-chip';
    chip.id = 'pr-chip';
    chip.innerHTML = `<i class="fa-solid fa-gift" style="font-size:18px"></i>
      <span class="pr-chip-txt"><b>Pré-reserva grátis por 24h</b><br>Segure o ${esc(e.chaleNome)} sem pagar nada</span>
      <span class="pr-chip-tempo" id="pr-chip-tempo">${mmss(ofertaRestaMs())}</span>
      <button type="button" class="pr-chip-x" aria-label="Fechar">&times;</button>`;
    chip.onclick = (ev) => {
        if (ev.target.closest('.pr-chip-x')) { removerChip(); return; }
        marcar('pre_reserva_reaberta');
        removerChip();
        mostrarOferta('faixa', true);
    };
    document.body.appendChild(chip);
    removerChip.t = setInterval(() => {
        const resta = ofertaRestaMs();
        const el = document.getElementById('pr-chip-tempo');
        if (el) el.textContent = mmss(resta);
        if (resta <= 0) removerChip();
    }, 1000);
}

// --- GATILHOS ---
function podeOferecer() {
    if (minhaPreReserva()) return false;
    const o = ofertaGravada();
    return !(o && Date.now() - o.em < DIA_MS);
}

function armar() {
    const e = cfg.estado();
    const escolheu = !!(e && e.chaletId && e.noites > 0);
    if (!escolheu) { desarmar(); return; }
    if (modoTeste) { modoTeste = false; apagar(CHAVE_OFERTA); armado = true; mostrarOferta('teste'); return; }
    if (!podeOferecer()) return;
    // Interesse suficiente: escolheu o chalé, mexeu na quantidade de pessoas e viu o valor total
    if (!mexeuPessoas || !viuValor) return;
    armado = true;
    reiniciarOcioso();
}
function desarmar() { armado = false; clearTimeout(timerOcioso); }

function reiniciarOcioso() {
    clearTimeout(timerOcioso);
    if (!armado) return;
    timerOcioso = setTimeout(() => { if (armado && !document.hidden) disparar('parado_25s'); }, OCIOSO_MS);
}

function disparar(gatilho) {
    if (!armado || !podeOferecer()) return;
    // Não interrompe quem está digitando nos dados
    const ativo = document.activeElement;
    if (ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName) && ['nome-reserva', 'celular-reserva', 'email-reserva', 'horarioChegada'].includes(ativo.id)) return;
    mostrarOferta(gatilho);
}

export function iniciarPreReserva(opcoes) {
    cfg = opcoes;
    injetarCss();

    // Já tem pré-reserva neste aparelho: mostra a faixa com o temporizador
    if (minhaPreReserva()) mostrarChipAtiva();

    const sim = document.getElementById('simulador');
    if (sim) {
        sim.addEventListener('change', (ev) => {
            if (['adultos', 'criancas5', 'criancas0'].includes(ev.target?.id)) mexeuPessoas = true;
            setTimeout(armar, 0);
        });
        sim.addEventListener('click', (ev) => {
            if (ev.target.closest('.stepper-btn')) mexeuPessoas = true;
            setTimeout(armar, 0);
        });
    }

    // Viu o valor: o "Total Estimado" ficou visível por 1 segundo
    const total = document.getElementById('resumoTotal');
    if (total && 'IntersectionObserver' in window) {
        let t = null;
        const obs = new IntersectionObserver((entradas) => {
            if (entradas[0].isIntersecting) {
                t = setTimeout(() => { viuValor = true; obs.disconnect(); armar(); }, 1000);
            } else clearTimeout(t);
        }, { threshold: 0.9 });
        obs.observe(total);
    } else viuValor = true;

    // Movimento reinicia a contagem de "parado"
    ['scroll', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
        window.addEventListener(ev, reiniciarOcioso, { passive: true }));

    // Saiu (trocou de app/aba) e voltou
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { saiuEm = Date.now(); clearTimeout(timerOcioso); return; }
        if (saiuEm && Date.now() - saiuEm > 3000) setTimeout(() => disparar('voltou_para_pagina'), 600);
        reiniciarOcioso();
    });

    // Fechou a galeria de fotos/vídeos
    const verGaleria = () => {
        const lb = document.getElementById('marketing-lightbox');
        if (!lb) return false;
        let aberta = !lb.classList.contains('hidden');
        new MutationObserver(() => {
            const agora = !lb.classList.contains('hidden');
            if (aberta && !agora) setTimeout(() => disparar('fechou_galeria'), 500);
            aberta = agora;
        }).observe(lb, { attributes: true, attributeFilter: ['class'] });
        return true;
    };
    if (!verGaleria()) {
        const obs = new MutationObserver(() => { if (verGaleria()) obs.disconnect(); });
        obs.observe(document.body, { childList: true });
    }

    // Computador: mouse saindo pelo topo (indo fechar a aba)
    document.addEventListener('mouseout', (ev) => {
        if (!ev.relatedTarget && ev.clientY <= 0) disparar('mouse_saindo');
    });

    // Para testes: balnearioriopreto.com.br/reservas.html?pre_reserva=1 mostra a oferta assim que escolher um chalé
    if (new URLSearchParams(location.search).get('pre_reserva') === '1') modoTeste = true;
}
