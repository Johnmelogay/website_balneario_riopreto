/**
 * Módulo Funcionários/Freelancers DB - Balneário Rio Preto
 * CRUD para tabela funcionarios
 */
import { supabase } from './scripts.js';

// ====== RENDER FUNCIONARIOS DB ======
export async function renderFuncionariosDB(container) {
    const { data: funcs } = await supabase.from('funcionarios').select('*').order('nome');

    container.innerHTML = `
        <div class="max-w-5xl mx-auto anim-fade">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-black text-gray-800">Funcionários & Freelancers</h2>
                <button onclick="window._funcOpenNew()" class="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition">
                    <i class="fa-solid fa-plus mr-2"></i> Novo
                </button>
            </div>

            <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-100">
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Nome</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Cargo</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">CPF</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Telefone</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Diária</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Status</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${(funcs || []).length === 0 ? '<tr><td colspan="7" class="text-center py-12 text-gray-400 font-bold">Nenhum funcionário cadastrado.</td></tr>' : ''}
                            ${(funcs || []).map(f => `
                                <tr class="hover:bg-gray-50 transition">
                                    <td class="py-3 px-4 font-bold text-gray-800 text-sm">${f.nome}</td>
                                    <td class="py-3 px-4"><span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-black">${f.cargo || 'freelancer'}</span></td>
                                    <td class="py-3 px-4 text-xs text-gray-500 font-mono">${f.cpf || '—'}</td>
                                    <td class="py-3 px-4 text-xs text-gray-500">${f.telefone || '—'}</td>
                                    <td class="py-3 px-4 font-black text-emerald-600">R$ ${Number(f.diaria || 0).toFixed(2).replace('.',',')}</td>
                                    <td class="py-3 px-4"><span class="${f.is_active ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-2 py-0.5 rounded text-xs font-black">${f.is_active ? 'Ativo' : 'Inativo'}</span></td>
                                    <td class="py-3 px-4 text-right space-x-2">
                                        <button onclick="window._funcEdit('${f.id}')" class="text-gray-400 hover:text-blue-600 transition" title="Editar"><i class="fa-solid fa-pen"></i></button>
                                        <button onclick="window._funcToggle('${f.id}', ${!f.is_active})" class="text-gray-400 hover:text-emerald-600 transition" title="Ativar/Inativar"><i class="fa-solid fa-power-off"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ====== MODAL FORM ======
function showFuncModal(title, f = {}) {
    const mc = document.getElementById('modalContainer');
    mc.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade max-w-md">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800">${title}</h3>
                    <button onclick="closeMod()" class="text-gray-400 bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <form id="funcForm" class="space-y-4">
                    <input type="hidden" id="funcId" value="${f.id || ''}">
                    <div>
                        <label class="label-sys">Nome *</label>
                        <input type="text" id="funcNome" required class="input-sys" value="${f.nome || ''}" placeholder="Nome completo">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="label-sys">Cargo</label>
                            <select id="funcCargo" class="input-sys">
                                <option value="freelancer" ${f.cargo==='freelancer'?'selected':''}>Freelancer</option>
                                <option value="garcom" ${f.cargo==='garcom'?'selected':''}>Garçom</option>
                                <option value="cozinheiro" ${f.cargo==='cozinheiro'?'selected':''}>Cozinheiro</option>
                                <option value="porteiro" ${f.cargo==='porteiro'?'selected':''}>Porteiro</option>
                                <option value="bar" ${f.cargo==='bar'?'selected':''}>Bar</option>
                                <option value="limpeza" ${f.cargo==='limpeza'?'selected':''}>Limpeza</option>
                                <option value="outro" ${f.cargo==='outro'?'selected':''}>Outro</option>
                            </select>
                        </div>
                        <div>
                            <label class="label-sys">Diária (R$)</label>
                            <input type="number" step="0.01" id="funcDiaria" class="input-sys" value="${f.diaria || '0'}" placeholder="0,00">
                        </div>
                    </div>
                    <div>
                        <label class="label-sys">CPF</label>
                        <input type="text" id="funcCPF" class="input-sys" value="${f.cpf || ''}" placeholder="000.000.000-00">
                    </div>
                    <div>
                        <label class="label-sys">Telefone</label>
                        <input type="text" id="funcTel" class="input-sys" value="${f.telefone || ''}" placeholder="(00) 00000-0000">
                    </div>
                    <div>
                        <label class="label-sys">Email</label>
                        <input type="email" id="funcEmail" class="input-sys" value="${f.email || ''}" placeholder="email@exemplo.com">
                    </div>
                    <button type="submit" class="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-lg shadow-lg hover:bg-emerald-700 transition">SALVAR</button>
                </form>
            </div>
        </div>
    `;
    document.getElementById('funcForm').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('funcId').value;
        const payload = {
            nome: document.getElementById('funcNome').value.trim(),
            cargo: document.getElementById('funcCargo').value,
            diaria: parseFloat(document.getElementById('funcDiaria').value || 0),
            cpf: document.getElementById('funcCPF').value.trim() || null,
            telefone: document.getElementById('funcTel').value.trim() || null,
            email: document.getElementById('funcEmail').value.trim() || null
        };
        if (id) {
            await supabase.from('funcionarios').update(payload).eq('id', id);
        } else {
            await supabase.from('funcionarios').insert(payload);
        }
        closeMod();
        loadModule('funcionarios_db');
    };
}

window._funcOpenNew = () => showFuncModal('Novo Funcionário');

window._funcEdit = async (id) => {
    const { data } = await supabase.from('funcionarios').select('*').eq('id', id).single();
    if (data) showFuncModal('Editar Funcionário', data);
};

window._funcToggle = async (id, active) => {
    await supabase.from('funcionarios').update({ is_active: active }).eq('id', id);
    loadModule('funcionarios_db');
};

window.closeMod = () => {
    document.getElementById('modalContainer').innerHTML = '';
};
