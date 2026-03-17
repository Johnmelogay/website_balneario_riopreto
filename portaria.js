import { supabase } from './scripts.js';

// Utilitário para gerar UUID (Idempotency Key)
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const DEFAULT_OPTIONS = {
    mode: 'embedded', // 'standalone' | 'embedded'
    onBack: null,
    pricing: { dayuse: 20, camping: 40, churrasqueira: 45 },
    staffMode: true
};

let currentState = {
    idempotencyKey: uuidv4(),
    totalAmount: 20,
    proofFile: null,
    isSubmitting: false,
    staff: null,
    opts: {}
};

export async function mountPortaria(containerId, options = {}) {
    currentState.opts = { ...DEFAULT_OPTIONS, ...options };
    const container = document.getElementById(containerId);
    if (!container) return;

    if (currentState.opts.staffMode) {
        // Obter staff
        const { getCurrentStaff } = await import('./sistema_auth.js');
        currentState.staff = getCurrentStaff();
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
            
            ${currentState.opts.mode === 'standalone' ? `
            <!-- HEADER STANDALONE -->
            <div class="lg:col-span-3 flex items-center justify-between mb-2">
                <button id="portBtnVoltar" class="text-gray-500 font-bold hover:text-gray-800 transition">
                    <i class="fa-solid fa-arrow-left mr-2"></i> Voltar
                </button>
                <h2 class="text-gray-800 font-black text-2xl tracking-tighter">Portaria PDV</h2>
                <div class="w-8"></div>
            </div>
            ` : ''}

            <!-- Nova Entrada -->
            <div class="lg:col-span-1 bg-white p-6 rounded-3xl border border-gray-100 anim-fade shadow-xl">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="font-black text-gray-800"><i class="fa-solid fa-door-open mr-2 text-blue-500"></i>Nova Entrada</h3>
                    <button onclick="window.portResetForm()" class="text-xs font-bold text-gray-400 hover:text-blue-500 transition" title="Limpar formulário e gerar nova Idempotency Key"><i class="fa-solid fa-rotate-right"></i> Reset</button>
                </div>
                
                <form id="portForm" onsubmit="event.preventDefault(); window.portSubmit();" class="space-y-4">
                    <!-- IDENTIFICAÇÃO -->
                    <div>
                        <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Responsável *</label>
                        <input type="text" id="portNome" required class="w-full bg-transparent border-b-2 border-gray-200 text-gray-900 focus:border-blue-600 py-2 outline-none font-bold placeholder:text-gray-400 transition" placeholder="Nome completo">
                    </div>
                    
                    <div>
                        <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Telefone / WhatsApp</label>
                        <input type="tel" id="portTelefone" class="w-full bg-transparent border-b-2 border-gray-200 text-gray-900 focus:border-blue-600 py-2 outline-none font-bold placeholder:text-gray-400 transition" placeholder="(00) 00000-0000">
                    </div>
                    
                    <!-- QUANTIDADE -->
                    <div class="pt-2">
                        <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Qtd. Pagantes *</label>
                        <div class="flex items-center gap-4">
                            <button type="button" onclick="window.portAdjQty(-1)" class="w-10 h-10 rounded-full bg-gray-100 text-blue-600 font-bold hover:bg-gray-200 transition">-</button>
                            <input type="number" id="portAdultos" required min="1" value="1" oninput="window.portCalc()" class="w-16 text-center text-xl font-black bg-transparent outline-none text-gray-900">
                            <button type="button" onclick="window.portAdjQty(1)" class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 font-bold hover:bg-blue-100 transition">+</button>
                        </div>
                    </div>
                    
                    <!-- TIPO -->
                    <div class="pt-4 space-y-3">
                        <label class="flex items-center justify-between p-3 bg-blue-50 border-blue-100 hover:bg-blue-100 rounded-xl border cursor-pointer transition group">
                            <div class="flex items-center gap-3">
                                <input type="radio" name="portTipo" value="dayuse" class="w-5 h-5 text-blue-600" checked onchange="window.portCalc()">
                                <div>
                                    <span class="font-black text-blue-800">☀️ Day Use</span>
                                </div>
                            </div>
                            <span class="font-black text-blue-600 text-lg">R$ ${currentState.opts.pricing.dayuse}</span>
                        </label>
                        
                        <label class="flex items-center justify-between p-3 bg-green-50 border-green-100 hover:bg-green-100 rounded-xl border cursor-pointer transition group">
                            <div class="flex items-center gap-3">
                                <input type="radio" name="portTipo" value="camping" class="w-5 h-5 text-green-600" onchange="window.portCalc()">
                                <div>
                                    <span class="font-black text-green-800">🏕️ Camping</span>
                                </div>
                            </div>
                            <span class="font-black text-green-600 text-lg">R$ ${currentState.opts.pricing.camping}</span>
                        </label>
                    </div>
                    
                    <!-- CHURRASQUEIRA -->
                    <div class="pt-2">
                        <label class="flex items-center justify-between p-3 bg-amber-50 border-amber-100 hover:bg-amber-100 rounded-xl border cursor-pointer transition group">
                            <div class="flex items-center gap-3">
                                <input type="checkbox" id="portChurrasqueira" class="w-5 h-5 text-amber-600 rounded" onchange="window.portCalc()">
                                <div>
                                    <span class="font-black text-amber-800">🔥 Churrasqueira</span>
                                </div>
                            </div>
                            <span class="font-black text-amber-600 text-lg">R$ ${currentState.opts.pricing.churrasqueira}</span>
                        </label>
                    </div>
                    
                    <!-- PAGAMENTO -->
                    <div class="pt-6 border-t border-gray-200">
                        <div class="flex justify-between items-end mb-4">
                            <span class="text-[10px] font-black uppercase tracking-widest text-gray-400">Total a Pagar</span>
                            <span class="text-4xl font-black text-gray-900 tracking-tighter" id="portTotalPreview">R$ 20,00</span>
                        </div>
                        
                        <label class="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Forma de Pagamento</label>
                        <select id="portPagamento" required class="w-full text-lg p-3 rounded-xl border-2 font-black bg-gray-50 border-gray-200 text-gray-800 focus:border-blue-500 transition outline-none" onchange="window.portPaymentToggle()">
                            <option value="dinheiro">💵 Dinheiro (S/ Comprovante)</option>
                            <option value="pix">🔲 PIX</option>
                            <option value="cartao_deb">💳 Cartão Débito</option>
                            <option value="cartao_cred">💳 Cartão Crédito</option>
                        </select>
                    </div>

                    <!-- DADOS CARTAO/PIX (CONDICIONAL) -->
                    <div id="portDigitalPayment" class="hidden p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                        <div class="text-[10px] font-black uppercase text-blue-600 tracking-wider mb-2"><i class="fa-solid fa-shield-halved mr-1"></i> Auditoria de Pagamento</div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <input type="text" id="portNSU" placeholder="NSU da transação *" class="w-full p-2 rounded bg-white border border-blue-100 text-xs font-bold focus:border-blue-500 outline-none">
                            </div>
                            <div>
                                <input type="text" id="portAuth" placeholder="Cód. Autorização" class="w-full p-2 rounded bg-white border border-blue-100 text-xs font-bold focus:border-blue-500 outline-none">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-600 mb-1">Comprovante Digital (Foto/PDF) *</label>
                            <label class="flex items-center justify-center w-full min-h-[80px] border-2 border-dashed border-blue-300 rounded-xl bg-white cursor-pointer hover:bg-blue-50 transition border-blue-hover">
                                <div class="text-center p-3" id="portProofLabel">
                                    <i class="fa-solid fa-cloud-arrow-up text-blue-400 text-2xl mb-1 mt-1 block"></i>
                                    <span class="text-xs font-bold text-gray-500">Tocar para Anexar</span>
                                </div>
                                <input type="file" id="portProofFile" class="hidden" accept="image/*,.pdf" onchange="window.portFileChange(event)">
                            </label>
                        </div>
                    </div>
                    
                    <button type="submit" id="btnSavePort" class="w-full bg-blue-600 text-white p-4 rounded-xl font-black text-lg shadow-xl shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition mt-4">
                        FINALIZAR ENTRADA
                    </button>
                    
                    <div class="text-center mt-3">
                        <span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest"><i class="fa-solid fa-fingerprint mr-1"></i>Idempotency Key Gerada</span>
                    </div>
                </form>
            </div>
            
            <!-- Recentes -->
            <div class="lg:col-span-2 bg-white border-gray-100 rounded-3xl border overflow-hidden anim-fade shadow-xl flex flex-col" style="animation-delay: 0.1s">
                <div class="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h3 class="font-black text-gray-800">Entradas Validadas Hoje</h3>
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-bold text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full" id="portLiquidTotal">Líquido: R$ 0,00</span>
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto no-scrollbar p-0">
                    <table class="w-full text-left border-collapse">
                        <thead class="sticky top-0 bg-gray-50/90 backdrop-blur-md z-10">
                            <tr class="border-b border-gray-100">
                                <th class="py-3 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Hora</th>
                                <th class="py-3 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Responsável</th>
                                <th class="py-3 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Detalhes</th>
                                <th class="py-3 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Auditoria / Valor</th>
                            </tr>
                        </thead>
                        <tbody id="portHistoryTable" class="divide-y divide-gray-50">
                            <tr><td colspan="4" class="text-center py-12"><i class="fa-solid fa-spinner fa-spin text-gray-300 text-2xl"></i></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
        </div>
        
        <!-- Modal de Ação de Item -->
        <div id="portActionModal" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl p-6 w-full max-w-sm" id="portActionContent"></div>
        </div>
    `;

    // Initialize logic
    if (currentState.opts.onBack) {
        document.getElementById('portBtnVoltar')?.addEventListener('click', currentState.opts.onBack);
    }
    
    window.portResetForm();
    window.portLoadHistory();

    // Set real-time listener if not already set (TODO: maybe manage subscription cleanup)
    if (!window._portSubscriptionBound) {
        supabase.channel('public:gate_entries')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, payload => {
                window.portLoadHistory();
            }).subscribe();
        window._portSubscriptionBound = true;
    }
}

// Global functions for inline HTML handlers
window.portResetForm = () => {
    document.getElementById('portForm')?.reset();
    currentState.idempotencyKey = uuidv4();
    currentState.proofFile = null;
    document.getElementById('portProofLabel').innerHTML = `<i class="fa-solid fa-cloud-arrow-up text-blue-400 text-2xl mb-1 mt-1 block"></i><span class="text-xs font-bold text-gray-500">Tocar para Anexar</span>`;
    window.portPaymentToggle();
    window.portCalc();
};

window.portAdjQty = (delta) => {
    const el = document.getElementById('portAdultos');
    let val = parseInt(el.value || 0) + delta;
    if(val < 1) val = 1;
    el.value = val;
    window.portCalc();
};

window.portCalc = () => {
    const adultos = parseInt(document.getElementById('portAdultos')?.value || 1);
    const tipo = document.querySelector('input[name="portTipo"]:checked')?.value || 'dayuse';
    const churrasqueira = document.getElementById('portChurrasqueira')?.checked || false;
    
    const taxaPessoa = tipo === 'camping' ? currentState.opts.pricing.camping : currentState.opts.pricing.dayuse;
    let total = adultos * taxaPessoa;
    if (churrasqueira) total += currentState.opts.pricing.churrasqueira;
    
    currentState.totalAmount = total;
    const tv = document.getElementById('portTotalPreview');
    if(tv) tv.textContent = `R$ ${total.toFixed(2).replace('.',',')}`;
};

window.portPaymentToggle = () => {
    const pmt = document.getElementById('portPagamento')?.value;
    const block = document.getElementById('portDigitalPayment');
    const nsu = document.getElementById('portNSU');
    if(pmt === 'dinheiro') {
        block.classList.add('hidden');
        if(nsu) nsu.removeAttribute('required');
    } else {
        block.classList.remove('hidden');
        if(nsu) nsu.setAttribute('required', 'true');
    }
};

window.portFileChange = (e) => {
    const file = e.target.files[0];
    if(file) {
        if(file.size > 5 * 1024 * 1024) {
             alert("Arquivo muito grande. Máximo 5MB.");
             e.target.value = '';
             return;
        }
        currentState.proofFile = file;
        document.getElementById('portProofLabel').innerHTML = `<i class="fa-solid fa-check-circle text-green-500 text-2xl mb-1 mt-1 block"></i><span class="text-xs font-bold text-green-700 truncate block px-2">${file.name}</span>`;
    }
};

window.portSubmit = async () => {
    if (currentState.isSubmitting) return;
    
    const pmt = document.getElementById('portPagamento').value;
    const nsu = document.getElementById('portNSU')?.value;
    const auth = document.getElementById('portAuth')?.value;

    // Validation for digital payments
    if (pmt !== 'dinheiro') {
        if (!currentState.proofFile) {
            alert('Para pagamentos PIX/Cartão é obrigatório anexar o comprovante digital.');
            return;
        }
        if (!nsu || nsu.trim() === '') {
            alert('NSU/ID da transação é obrigatório para auditoria.');
            return;
        }
    }

    const btn = document.getElementById('btnSavePort');
    const originalBtnHTML = btn.innerHTML;
    
    try {
        currentState.isSubmitting = true;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';

        let proofPath = null;

        // Upload Profile if exists
        if (currentState.proofFile) {
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-bounce"></i> Salvando Comprovante...';
            const ext = currentState.proofFile.name.split('.').pop();
            const fileName = `proofs/${new Date().toISOString().split('T')[0]}/${currentState.idempotencyKey}.${ext}`;
            
            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('gate-payment-proofs')
                .upload(fileName, currentState.proofFile);
                
            if (uploadErr) throw new Error("Erro no upload do comprovante verifique sua conexão: " + uploadErr.message);
            proofPath = uploadData.path;
        }

        btn.innerHTML = '<i class="fa-solid fa-server fa-pulse"></i> Registrando Entrada...';

        // 1. Insert gate_entries
        const adultos = parseInt(document.getElementById('portAdultos').value || 1);
        const tipo = document.querySelector('input[name="portTipo"]:checked')?.value || 'dayuse';
        const churrasqueira = document.getElementById('portChurrasqueira')?.checked || false;
        
        const entryPayload = {
            guest_name: document.getElementById('portNome').value.trim(),
            phone: document.getElementById('portTelefone').value.trim() || null,
            qty_adults: adultos,
            entry_type: tipo,
            is_camping: tipo === 'camping',
            has_churrasqueira: churrasqueira,
            total_amount: currentState.totalAmount, // client calculation
            amount_paid: currentState.totalAmount,
            payment_method: pmt,
            staff_id: currentState.staff?.id || null,
            idempotency_key: currentState.idempotencyKey,
            payment_status: 'verified', // we assume verified at point of sale if proof provided/dinheiro
            pricing_snapshot: currentState.opts.pricing
        };

        const { data: entryData, error: entryErr } = await supabase.from('gate_entries').insert(entryPayload).select('id').single();
        if (entryErr) {
            // Se for code 23505 (unique violation), significa que idempotency key barrada e tentamos duplicar
            if (entryErr.code === '23505') {
                throw new Error("Envio duplicado evitado.");
            }
            throw new Error("Erro ao salvar entrada: " + entryErr.message);
        }

        // 2. Insert gate_payments if digital
        if (pmt !== 'dinheiro') {
            const pmPayload = {
                gate_entry_id: entryData.id,
                payment_method: pmt,
                amount: currentState.totalAmount,
                nsu: nsu?.trim() || null,
                auth_code: auth?.trim() || null,
                proof_path: proofPath,
                verified_at: new Date().toISOString(),
                verified_by: currentState.staff?.id || null
            };
            const { error: pmErr } = await supabase.from('gate_payments').insert(pmPayload);
            if(pmErr) console.error("Falha audit: gate_payments", pmErr);
            
            // 3. Create Audit event
            await supabase.from('gate_entry_events').insert({
                gate_entry_id: entryData.id,
                event_type: 'payment_verified',
                actor_staff_id: currentState.staff?.id || null,
                details: { method: pmt, nsu: nsu }
            });
        }

        // 3. Create Creation Audit Event
        await supabase.from('gate_entry_events').insert({
            gate_entry_id: entryData.id,
            event_type: 'created',
            actor_staff_id: currentState.staff?.id || null,
            details: entryPayload
        });

        // SUCCESS
        btn.innerHTML = '<i class="fa-solid fa-check text-green-300"></i> SUCESSO!';
        btn.classList.add('bg-green-600'); btn.classList.remove('bg-blue-600');
        
        setTimeout(() => {
            btn.innerHTML = originalBtnHTML;
            btn.classList.remove('bg-green-600'); btn.classList.add('bg-blue-600');
            btn.disabled = false;
            currentState.isSubmitting = false;
            window.portResetForm();
            window.portLoadHistory();
        }, 1500);


    } catch (e) {
        console.error(e);
        alert(e.message);
        btn.innerHTML = originalBtnHTML;
        btn.disabled = false;
        currentState.isSubmitting = false;
    }
};

window.portLoadHistory = async () => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    
    // Using Inner Join/Lateral is best, but since we don't know if view is available, we do standard select
    const { data: entries } = await supabase.from('gate_entries')
        .select('*, gate_payments(nsu, proof_path)')
        .gte('created_at', startOfDay)
        .order('created_at', { ascending: false });
        
    const tbody = document.getElementById('portHistoryTable');
    if(!tbody) return;

    if(!entries || entries.length === 0) {
         tbody.innerHTML = `<tr><td colspan="4" class="text-center py-12 font-bold text-gray-400">Nenhuma entrada validada ainda.</td></tr>`;
         document.getElementById('portLiquidTotal').textContent = 'Líquido: R$ 0,00';
         return;
    }

    let tLiquid = 0;
    
    tbody.innerHTML = entries.map(e => {
        const time = new Date(e.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        // Status checks
        const isCancelled = e.payment_status === 'cancelled';
        const isRefunded = e.payment_status === 'refunded';
        
        if (!isCancelled && !isRefunded) tLiquid += Number(e.amount_paid);

        const tipoLabel = e.entry_type === 'camping' ? '🏕️ Camping' : '☀️ Day Use';
        const tipoColor = e.entry_type === 'camping' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700';
        
        let detailsHtml = `<span class="${tipoColor} px-2 py-0.5 rounded-lg text-[10px] font-black mr-1">${tipoLabel}</span>`;
        detailsHtml += `<span class="bg-gray-100/50 text-gray-500 px-2 py-0.5 rounded-lg text-[10px] font-black mr-1">${e.qty_adults} Adultos</span>`;
        if(e.has_churrasqueira) detailsHtml += `<span class="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-[10px] font-black mr-1">🔥 Churr</span>`;
        
        let auditBadge = '';
        if (isCancelled || isRefunded) {
             const lbl = isCancelled ? 'CANCELADO' : 'ESTORNADO';
             auditBadge = `<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-black block w-fit ml-auto mb-1">${lbl}</span>`;
        } else if (e.payment_method === 'dinheiro') {
             auditBadge = `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-black block w-fit ml-auto mb-1"><i class="fa-solid fa-money-bill-1-wave mr-1"></i>Cx Local</span>`;
        } else {
             const nsu = e.gate_payments?.[0]?.nsu || 'Digital';
             auditBadge = `<span class="bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black block w-fit ml-auto mb-1 cursor-pointer hover:bg-amber-100"><i class="fa-solid fa-shield-halved mr-1"></i>Verificado</span>`;
        }

        return `
            <tr class="hover:bg-gray-50/10 transition group cursor-pointer ${isCancelled||isRefunded ? 'opacity-50' : ''}" onclick="window.portOpenAction('${e.id}')">
                <td class="py-4 px-6 font-mono text-xs font-bold text-gray-400 align-middle border-l-4 ${isCancelled||isRefunded ? 'border-red-400' : 'border-transparent'}">${time}</td>
                <td class="py-4 px-6 align-middle">
                    <p class="font-bold text-gray-800 text-sm truncate max-w-[150px] leading-tight">${e.guest_name}</p>
                    ${e.phone ? `<p class="text-[10px] text-gray-400 font-bold mt-0.5"><i class="fa-solid fa-phone mr-1"></i>${e.phone}</p>` : ''}
                </td>
                <td class="py-4 px-6 align-middle bg-opacity-50">${detailsHtml}</td>
                <td class="py-4 px-6 text-right align-middle">
                    ${auditBadge}
                    <p class="font-black text-blue-600 ${isCancelled||isRefunded ? 'line-through' : ''}">R$ ${Number(e.amount_paid).toFixed(2).replace('.',',')}</p>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('portLiquidTotal').textContent = `Líquido: R$ ${tLiquid.toFixed(2).replace('.',',')}`;
};

// Modals for actions (Cancelar / Estornar)
window.portOpenAction = async (id) => {
    // Only simple action view
    const modal = document.getElementById('portActionModal');
    const content = document.getElementById('portActionContent');
    
    content.innerHTML = `
        <div class="text-center mb-6">
            <i class="fa-solid fa-ticket text-blue-500 text-4xl mb-3"></i>
            <h3 class="font-black text-gray-800 text-xl">Ações da Entrada</h3>
            <p class="text-xs text-gray-400 font-bold mt-1">ID: ${id.split('-')[0]}</p>
        </div>
        <div class="space-y-3">
            <button onclick="window.portCancelEntry('${id}')" class="w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-ban"></i> Cancelar / Invalidar
            </button>
            <button onclick="window.portRefundEntry('${id}')" class="w-full bg-amber-50 text-amber-600 py-3 rounded-xl font-bold hover:bg-amber-100 transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-hand-holding-dollar"></i> Emitir Estorno
            </button>
            <button onclick="document.getElementById('portActionModal').classList.add('hidden')" class="w-full bg-gray-100 text-gray-500 py-3 rounded-xl font-bold hover:bg-gray-200 transition">
                Voltar
            </button>
        </div>
    `;
    modal.classList.remove('hidden');
};

window.portCancelEntry = async (id) => {
    const reason = prompt("⚠️ Motivo do cancelamento (Obrigatório para auditoria):");
    if(!reason || reason.trim() === '') return;

    try {
        await supabase.from('gate_entries').update({
            payment_status: 'cancelled',
            cancel_reason: reason,
            cancelled_at: new Date().toISOString(),
            cancelled_by: currentState.staff?.id
        }).eq('id', id);

        await supabase.from('gate_entry_events').insert({
            gate_entry_id: id,
            event_type: 'cancelled',
            actor_staff_id: currentState.staff?.id,
            details: { reason }
        });

        document.getElementById('portActionModal').classList.add('hidden');
        window.portLoadHistory();
    } catch(e) {
        alert(e.message);
    }
};

window.portRefundEntry = async (id) => {
    const reason = prompt("⚠️ Motivo do estorno (Obrigatório para auditoria):");
    if(!reason || reason.trim() === '') return;

     try {
        await supabase.from('gate_entries').update({
            payment_status: 'refunded',
            refund_reason: reason,
            refunded_at: new Date().toISOString(),
            refunded_by: currentState.staff?.id
        }).eq('id', id);

        await supabase.from('gate_entry_events').insert({
            gate_entry_id: id,
            event_type: 'refunded',
            actor_staff_id: currentState.staff?.id,
            details: { reason }
        });

        document.getElementById('portActionModal').classList.add('hidden');
        window.portLoadHistory();
    } catch(e) {
        alert(e.message);
    }
};
