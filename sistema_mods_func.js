/**
 * Módulo Gestão de Staff - Balneário Rio Preto
 * CRUD unificado na tabela staff_users
 */
import { supabase } from './scripts.js';
import { ROLE_LABELS, ROLE_COLORS } from './sistema_auth.js';

let showInactive = false;

export async function renderFuncionarios(container) {
    let query = supabase.from('staff_users').select('*').order('name');
    if (!showInactive) {
        query = query.eq('is_active', true);
    }
    
    const { data: funcs } = await query;

    container.innerHTML = `
        <div class="max-w-6xl mx-auto anim-fade">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-black text-gray-800">Gestão de Equipe (Staff)</h2>
                <div class="flex gap-3">
                    <button onclick="window._funcToggleInactive()" class="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-200 transition">
                        <i class="fa-solid ${showInactive ? 'fa-eye-slash' : 'fa-eye'} mr-2"></i> ${showInactive ? 'Ocultar Inativos' : 'Ver Inativos'}
                    </button>
                    <button onclick="window._funcOpenNew()" class="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition">
                        <i class="fa-solid fa-plus mr-2"></i> Novo Membro
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-100">
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Nome</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Cargo</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">PIN</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">CPF</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Diária</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Status</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${(funcs || []).length === 0 ? '<tr><td colspan="7" class="text-center py-12 text-gray-400 font-bold">Nenhum membro encontrado.</td></tr>' : ''}
                            ${(funcs || []).map(f => {
                                const colors = ROLE_COLORS[f.role] || 'bg-gray-100 text-gray-700';
                                const label = ROLE_LABELS[f.role] || f.role;
                                return \`
                                <tr class="hover:bg-gray-50 transition ${!f.is_active ? 'opacity-50' : ''}">
                                    <td class="py-4 px-4 font-bold text-gray-800 text-sm">\${f.name}</td>
                                    <td class="py-4 px-4"><span class="\${colors} px-2 py-0.5 rounded text-xs font-black">\${label}</span></td>
                                    <td class="py-4 px-4 text-xs font-mono font-bold text-gray-600">\${f.pin || 'S/ PIN'}</td>
                                    <td class="py-4 px-4 text-xs text-gray-500 font-mono">\${f.cpf || '—'}</td>
                                    <td class="py-4 px-4 font-black text-emerald-600">R$ \${Number(f.diaria || 0).toFixed(2).replace('.',',')}</td>
                                    <td class="py-4 px-4"><span class="\${f.is_active ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2 py-0.5 rounded text-xs font-black">\${f.is_active ? 'Ativo' : 'Inativo'}</span></td>
                                    <td class="py-4 px-4 text-right space-x-2">
                                        <button onclick="window._funcEdit('\${f.id}')" class="text-gray-400 hover:text-blue-600 transition" title="Editar / RH"><i class="fa-solid fa-pen"></i></button>
                                        <button onclick="window._funcToggle('\${f.id}', \${!f.is_active})" class="text-gray-400 hover:text-emerald-600 transition" title="Ativar/Inativar"><i class="fa-solid fa-power-off"></i></button>
                                    </td>
                                </tr>
                                \`
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    \`;
}

window._funcToggleInactive = () => {
    showInactive = !showInactive;
    loadModule('funcionarios'); // Reloads tab
};

function showFuncModal(title, f = {}) {
    const mc = document.getElementById('modalContainer');
    mc.innerHTML = \`
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade max-w-md">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800">\${title}</h3>
                    <button onclick="closeMod()" class="text-gray-400 bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <form id="funcForm" class="space-y-4">
                    <input type="hidden" id="funcId" value="\${f.id || ''}">
                    <div>
                        <label class="label-sys">Nome Completo *</label>
                        <input type="text" id="funcName" required class="input-sys" value="\${f.name || ''}" placeholder="Nome">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="label-sys">Cargo (Acesso Sistema)</label>
                            <select id="funcRole" class="input-sys">
                                \${Object.entries(ROLE_LABELS).map(([val, label]) => \`<option value="\${val}" \${f.role===val?'selected':''}>\${label}</option>\`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="label-sys">PIN de Acesso (4 digitos)</label>
                            <input type="text" id="funcPin" class="input-sys" maxlength="4" value="\${f.pin || ''}" placeholder="0000">
                        </div>
                    </div>
                    <hr class="border-gray-100">
                    <h4 class="text-sm font-bold text-gray-400">Dados de RH (Opcional)</h4>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="label-sys">CPF</label>
                            <input type="text" id="funcCPF" class="input-sys" value="\${f.cpf || ''}" placeholder="000.000.000-00">
                        </div>
                        <div>
                            <label class="label-sys">Diária (R$)</label>
                            <input type="number" step="0.01" id="funcDiaria" class="input-sys" value="\${f.diaria || '0'}" placeholder="0,00">
                        </div>
                    </div>
                    <div>
                        <label class="label-sys">Telefone</label>
                        <input type="text" id="funcTel" class="input-sys" value="\${f.telefone || ''}" placeholder="(00) 00000-0000">
                    </div>
                    <div>
                        <label class="label-sys">Email</label>
                        <input type="email" id="funcEmail" class="input-sys" value="\${f.email || ''}" placeholder="email@exemplo.com">
                    </div>
                    <button type="submit" class="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-lg shadow-lg hover:bg-emerald-700 transition">SALVAR MEMBRO</button>
                </form>
            </div>
        </div>
    \`;
    document.getElementById('funcForm').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('funcId').value;
        const payload = {
            name: document.getElementById('funcName').value.trim(),
            role: document.getElementById('funcRole').value,
            pin: document.getElementById('funcPin').value.trim() || null,
            diaria: parseFloat(document.getElementById('funcDiaria').value || 0),
            cpf: document.getElementById('funcCPF').value.trim() || null,
            telefone: document.getElementById('funcTel').value.trim() || null,
            email: document.getElementById('funcEmail').value.trim() || null,
            is_active: f.is_active !== undefined ? f.is_active : true
        };
        if (id) {
            await supabase.from('staff_users').update(payload).eq('id', id);
        } else {
            await supabase.from('staff_users').insert(payload);
        }
        closeMod();
        loadModule('funcionarios');
    };
}

window._funcOpenNew = () => showFuncModal('Novo Membro da Equipe');

window._funcEdit = async (id) => {
    const { data } = await supabase.from('staff_users').select('*').eq('id', id).single();
    if (data) showFuncModal('Editar Membro', data);
};

window._funcToggle = async (id, active) => {
    if(!confirm(\`Deseja \${active ? 'ativar' : 'inativar'} este funcionário?\`)) return;
    await supabase.from('staff_users').update({ is_active: active }).eq('id', id);
    loadModule('funcionarios');
};

window.closeMod = () => {
    const mc = document.getElementById('modalContainer');
    if (mc) mc.innerHTML = '';
};
