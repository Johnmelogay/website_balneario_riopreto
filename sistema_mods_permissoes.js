/**
 * Módulo de Gestão de Permissões por Cargo - Balneário Rio Preto
 * Exclusivo para o cargo CEO
 */
import { 
    ROLE_LABELS, 
    ROLE_COLORS, 
    ALL_SYSTEM_MODULES, 
    ALL_SYSTEM_ACTIONS, 
    DEFAULT_ROLE_PERMISSIONS,
    getRolePermissions, 
    saveRolePermissions,
    getCurrentStaff
} from './sistema_auth.js';
import { logAuditAction } from './audit_logger.js';

let activeRoleTab = 'admin';
let currentPermissionsState = {};

export async function renderPermissoes(container) {
    const staff = getCurrentStaff();
    if (!staff || staff.role !== 'ceo') {
        container.innerHTML = `
            <div class="max-w-xl mx-auto my-12 bg-red-50 border border-red-200 rounded-2xl p-8 text-center anim-fade">
                <i class="fa-solid fa-triangle-exclamation text-4xl text-red-500 mb-3"></i>
                <h3 class="text-xl font-black text-red-800">Acesso Restrito ao CEO</h3>
                <p class="text-sm font-medium text-red-600 mt-2">Este painel de configuração de segurança é de acesso exclusivo do cargo CEO do Balneário Rio Preto.</p>
            </div>
        `;
        return;
    }

    currentPermissionsState = getRolePermissions();
    buildUI(container);
}

function buildUI(container) {
    const rolesList = Object.keys(ROLE_LABELS);
    const activeRoleData = currentPermissionsState[activeRoleTab] || { modules: [], actions: [] };
    const isCeoTab = activeRoleTab === 'ceo';

    container.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-6 anim-fade">
            <!-- Header Banner -->
            <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                <div class="absolute -right-10 -bottom-10 opacity-10 text-9xl pointer-events-none">
                    <i class="fa-solid fa-user-shield"></i>
                </div>
                <div class="space-y-2 max-w-2xl z-10">
                    <div class="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-indigo-300 text-xs font-bold uppercase tracking-wider">
                        <i class="fa-solid fa-crown text-amber-400"></i> Painel Executivo do CEO
                    </div>
                    <h2 class="text-2xl md:text-3xl font-black tracking-tight">Gestão de Permissões e Acessos</h2>
                    <p class="text-slate-300 text-sm font-normal">
                        Configure o nível de acesso a cada módulo e autorize operações críticas para todos os cargos da empresa.
                    </p>
                </div>
                <div class="flex items-center gap-3 z-10 w-full md:w-auto">
                    <button onclick="window._resetPermissionsToDefault()" class="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition flex items-center gap-2 border border-slate-700">
                        <i class="fa-solid fa-rotate-left"></i> Restaurar Padrões
                    </button>
                    <button onclick="window._savePermissionsState()" class="flex-1 md:flex-none px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-2">
                        <i class="fa-solid fa-floppy-disk"></i> Salvar Alterações
                    </button>
                </div>
            </div>

            <!-- Toast alert placeholder -->
            <div id="permToast" class="hidden"></div>

            <!-- Role Selector Tabs -->
            <div class="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm overflow-x-auto no-scrollbar flex gap-2">
                ${rolesList.map(r => {
                    const isActive = r === activeRoleTab;
                    const badgeClass = ROLE_COLORS[r] || 'bg-gray-100 text-gray-700';
                    const isCeo = r === 'ceo';
                    return `
                        <button onclick="window._switchRoleTab('${r}')" class="px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2.5 whitespace-nowrap shrink-0 ${isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}">
                            <span class="${badgeClass} px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isActive ? '!bg-white/20 !text-white' : ''}">${ROLE_LABELS[r]}</span>
                            ${isCeo ? '<i class="fa-solid fa-lock text-[10px] opacity-80" title="Permissões Totais Inalteráveis"></i>' : ''}
                        </button>
                    `;
                }).join('')}
            </div>

            <!-- Active Role Details -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Section 1: Module Access -->
                <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                            <div>
                                <h3 class="font-black text-gray-800 text-lg flex items-center gap-2">
                                    <i class="fa-solid fa-border-all text-indigo-600"></i> Módulos do Menu Lateral
                                </h3>
                                <p class="text-xs font-medium text-gray-400 mt-0.5">Selecione quais seções o cargo <strong>${ROLE_LABELS[activeRoleTab]}</strong> pode visualizar.</p>
                            </div>
                            <span class="${ROLE_COLORS[activeRoleTab]} px-3 py-1 rounded-full text-xs font-black uppercase">${ROLE_LABELS[activeRoleTab]}</span>
                        </div>

                        ${isCeoTab ? `
                            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center gap-3 text-amber-800 text-xs font-bold">
                                <i class="fa-solid fa-lock text-base text-amber-600"></i>
                                <span>O cargo CEO possui acesso irrestrito a todos os módulos do sistema. Esta regra não pode ser alterada.</span>
                            </div>
                        ` : ''}

                        <div class="space-y-3">
                            ${ALL_SYSTEM_MODULES.filter(m => m.id !== 'permissoes').map(mod => {
                                const isChecked = isCeoTab || (activeRoleData.modules && activeRoleData.modules.includes(mod.id));
                                return `
                                    <label class="flex items-center justify-between p-3.5 rounded-2xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition cursor-pointer ${isCeoTab ? 'opacity-70 pointer-events-none' : ''}">
                                        <div class="flex items-center gap-3">
                                            <div class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                                <i class="fa-solid fa-${mod.icon}"></i>
                                            </div>
                                            <div>
                                                <span class="font-bold text-sm text-gray-800">${mod.label}</span>
                                            </div>
                                        </div>
                                        <input type="checkbox" ${isChecked ? 'checked' : ''} ${isCeoTab ? 'disabled' : ''} 
                                            onchange="window._toggleModulePerm('${mod.id}', this.checked)"
                                            class="w-5 h-5 rounded-lg text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer">
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>

                <!-- Section 2: Specific Actions -->
                <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                            <div>
                                <h3 class="font-black text-gray-800 text-lg flex items-center gap-2">
                                    <i class="fa-solid fa-key text-amber-500"></i> Ações & Operações Sensíveis
                                </h3>
                                <p class="text-xs font-medium text-gray-400 mt-0.5">Autorize permissões para funções críticas de segurança e financeira.</p>
                            </div>
                            <span class="${ROLE_COLORS[activeRoleTab]} px-3 py-1 rounded-full text-xs font-black uppercase">${ROLE_LABELS[activeRoleTab]}</span>
                        </div>

                        ${isCeoTab ? `
                            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center gap-3 text-amber-800 text-xs font-bold">
                                <i class="fa-solid fa-lock text-base text-amber-600"></i>
                                <span>O CEO possui autorização automática para executar qualquer operação sensível no sistema.</span>
                            </div>
                        ` : ''}

                        <div class="space-y-3">
                            ${ALL_SYSTEM_ACTIONS.map(act => {
                                const isChecked = isCeoTab || (activeRoleData.actions && activeRoleData.actions.includes(act.id));
                                return `
                                    <label class="flex items-start justify-between p-3.5 rounded-2xl border border-gray-100 hover:border-amber-100 hover:bg-amber-50/20 transition cursor-pointer ${isCeoTab ? 'opacity-70 pointer-events-none' : ''}">
                                        <div class="pr-3">
                                            <span class="font-bold text-sm text-gray-800 block">${act.label}</span>
                                            <span class="text-xs font-medium text-gray-400 block mt-0.5 leading-snug">${act.desc}</span>
                                        </div>
                                        <input type="checkbox" ${isChecked ? 'checked' : ''} ${isCeoTab ? 'disabled' : ''} 
                                            onchange="window._toggleActionPerm('${act.id}', this.checked)"
                                            class="w-5 h-5 rounded-lg text-amber-600 focus:ring-amber-500 border-gray-300 cursor-pointer mt-0.5">
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ====== GLOBAL WINDOW HANDLERS ======
window._switchRoleTab = (role) => {
    activeRoleTab = role;
    const container = document.getElementById('pageContent');
    if (container) buildUI(container);
};

window._toggleModulePerm = (moduleId, enabled) => {
    if (activeRoleTab === 'ceo') return;
    if (!currentPermissionsState[activeRoleTab]) {
        currentPermissionsState[activeRoleTab] = { modules: [], actions: [] };
    }
    const mods = currentPermissionsState[activeRoleTab].modules || [];
    if (enabled && !mods.includes(moduleId)) {
        mods.push(moduleId);
    } else if (!enabled && mods.includes(moduleId)) {
        currentPermissionsState[activeRoleTab].modules = mods.filter(m => m !== moduleId);
    }
};

window._toggleActionPerm = (actionId, enabled) => {
    if (activeRoleTab === 'ceo') return;
    if (!currentPermissionsState[activeRoleTab]) {
        currentPermissionsState[activeRoleTab] = { modules: [], actions: [] };
    }
    const acts = currentPermissionsState[activeRoleTab].actions || [];
    if (enabled && !acts.includes(actionId)) {
        acts.push(actionId);
    } else if (!enabled && acts.includes(actionId)) {
        currentPermissionsState[activeRoleTab].actions = acts.filter(a => a !== actionId);
    }
};

window._savePermissionsState = async () => {
    const success = saveRolePermissions(currentPermissionsState);
    const toast = document.getElementById('permToast');
    if (success) {
        if (toast) {
            toast.className = "bg-emerald-600 text-white font-bold p-4 rounded-2xl shadow-lg flex items-center justify-between text-sm anim-fade";
            toast.innerHTML = `<div class="flex items-center gap-3"><i class="fa-solid fa-circle-check text-xl"></i> Permissões salvas com sucesso! As novas regras já estão em vigor.</div>`;
            setTimeout(() => toast.classList.add('hidden'), 4000);
        }
        try {
            await logAuditAction('PERMISSIONS_UPDATED', { updated_by_ceo: true, updated_role: activeRoleTab });
        } catch(e) {}
    } else {
        if (toast) {
            toast.className = "bg-red-600 text-white font-bold p-4 rounded-2xl shadow-lg flex items-center justify-between text-sm anim-fade";
            toast.innerHTML = `<div class="flex items-center gap-3"><i class="fa-solid fa-circle-xmark text-xl"></i> Erro ao salvar permissões.</div>`;
            setTimeout(() => toast.classList.add('hidden'), 4000);
        }
    }
};

window._resetPermissionsToDefault = () => {
    if (!confirm('Deseja restaurar as permissões de todos os cargos para os valores padrão do sistema?')) return;
    currentPermissionsState = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
    saveRolePermissions(currentPermissionsState);
    const container = document.getElementById('pageContent');
    if (container) buildUI(container);
};
