import { supabase } from './scripts.js';
import { ROLE_LABELS, ROLE_COLORS } from './sistema_auth.js';

// ====== MODALS (FUNCIONARIOS) ======
window.openModStaff = () => {
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800">Novo Colaborador</h3>
                    <button onclick="closeMod()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label class="label-sys">Nome Completo</label>
                        <input type="text" id="modStfName" class="input-sys" placeholder="Ex: João Silva">
                    </div>
                    <div>
                        <label class="label-sys">PIN de Acesso (4 dígitos)</label>
                        <input type="password" id="modStfPin" class="input-sys" maxlength="4" placeholder="••••">
                    </div>
                    <div>
                        <label class="label-sys">Cargo / Permissão</label>
                        <select id="modStfRole" class="input-sys bg-white">
                            <option value="garcom">Garçom</option>
                            <option value="cozinha">Cozinha</option>
                            <option value="bar">Bar</option>
                            <option value="caixa">Caixa</option>
                            <option value="portaria">Portaria</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    
                    <button onclick="saveNewStaff()" id="btnSaveStaff" class="w-full mt-4 bg-emerald-600 text-white py-3 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition">
                        SALVAR
                    </button>
                </div>
            </div>
        </div>
    `;
};

window.saveNewStaff = async () => {
    const name = document.getElementById('modStfName').value.trim();
    const pin = document.getElementById('modStfPin').value.trim();
    const role = document.getElementById('modStfRole').value;
    
    if(!name || pin.length !== 4) {
        alert('Preencha o nome e um PIN de 4 dígitos validos.');
        return;
    }
    
    const btn = document.getElementById('btnSaveStaff');
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';
    
    // Auth module handles hashing
    const { createStaffUser } = await import('./sistema_auth.js');
    const result = await createStaffUser(name, pin, role);
    
    if(result.success) {
        closeMod();
        loadModule('funcionarios');
    } else {
        alert('Erro: ' + (result.error || 'Falha ao criar usuário'));
        btn.disabled = false;
        btn.innerHTML = 'SALVAR';
    }
};

window.openModStaffPin = (id, name) => {
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800">Alterar PIN</h3>
                    <button onclick="closeMod()" class="text-gray-400"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <p class="text-sm text-gray-500 mb-4">Novo PIN para <strong>${name}</strong></p>
                <div class="space-y-4">
                    <input type="password" id="modStfNewPin" class="input-sys" maxlength="4" placeholder="Novo PIN (4 dígitos)">
                    <button onclick="saveNewPin('${id}')" id="btnSavePin" class="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 transition">
                        ATUALIZAR PIN
                    </button>
                </div>
            </div>
        </div>
    `;
};

window.saveNewPin = async (id) => {
    const pin = document.getElementById('modStfNewPin').value.trim();
    if(pin.length !== 4) return alert('PIN deve ter 4 dígitos.');
    
    const btn = document.getElementById('btnSavePin');
    btn.disabled = true;
    btn.innerHTML = 'Atualizando...';
    
    const { updateStaffPin } = await import('./sistema_auth.js');
    const success = await updateStaffPin(id, pin);
    
    if(success) {
        closeMod();
    } else {
        alert('Erro ao atualizar PIN');
        btn.disabled = false;
        btn.innerHTML = 'ATUALIZAR PIN';
    }
};

window.closeMod = () => { document.getElementById('modalContainer').innerHTML = ''; };

// ====== MODULE: ESTOQUE (CRUD Completo + Profissional) ======
let currentCategories = [];
let allProducts = [];
let selectedProducts = new Set();
let activeFilter = 'all';

async function renderEstoque(container) {
    const { data: cats } = await supabase.from('categories').select('*').order('sort_order');
    currentCategories = cats || [];
    
    const { data: prods } = await supabase.from('products').select('*, categories(name, destination)').order('name');
    allProducts = prods || [];
    
    // Stats
    const totalProducts = allProducts.filter(p => p.is_active).length;
    const lowStockCount = allProducts.filter(p => p.is_active && p.is_stock_controlled && p.stock_qty <= p.min_stock).length;
    const outOfStockCount = allProducts.filter(p => p.is_active && p.is_stock_controlled && p.stock_qty <= 0).length;
    const totalValue = allProducts.filter(p => p.is_active && p.is_stock_controlled).reduce((s, p) => s + (p.stock_qty * Number(p.price)), 0);
    
    container.innerHTML = `
        <!-- Stats Row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 anim-fade">
            <div class="bg-white p-4 rounded-2xl border border-gray-100">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center"><i class="fa-solid fa-boxes-stacked"></i></div>
                    <div>
                        <p class="text-2xl font-black text-gray-800">${totalProducts}</p>
                        <p class="text-[10px] font-bold text-gray-400 uppercase">Produtos Ativos</p>
                    </div>
                </div>
            </div>
            <div class="bg-white p-4 rounded-2xl border border-gray-100">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <div>
                        <p class="text-2xl font-black ${lowStockCount > 0 ? 'text-amber-600' : 'text-gray-800'}">${lowStockCount}</p>
                        <p class="text-[10px] font-bold text-gray-400 uppercase">Estoque Baixo</p>
                    </div>
                </div>
            </div>
            <div class="bg-white p-4 rounded-2xl border border-gray-100">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center"><i class="fa-solid fa-ban"></i></div>
                    <div>
                        <p class="text-2xl font-black ${outOfStockCount > 0 ? 'text-red-600' : 'text-gray-800'}">${outOfStockCount}</p>
                        <p class="text-[10px] font-bold text-gray-400 uppercase">Esgotados</p>
                    </div>
                </div>
            </div>
            <div class="bg-white p-4 rounded-2xl border border-gray-100">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center"><i class="fa-solid fa-coins"></i></div>
                    <div>
                        <p class="text-2xl font-black text-emerald-700">R$ ${totalValue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</p>
                        <p class="text-[10px] font-bold text-gray-400 uppercase">Valor em Estoque</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <!-- Sidebar -->
            <div class="lg:col-span-1 space-y-4">
                <div class="bg-white p-5 rounded-2xl border border-gray-100 anim-fade">
                    <h3 class="font-black text-gray-800 mb-4">Ações</h3>
                    <button onclick="openModProduct()" class="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-sm shadow hover:bg-emerald-700 transition mb-2">
                        <i class="fa-solid fa-plus mr-1"></i> Novo Produto
                    </button>
                    <button onclick="openModCategory()" class="w-full bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-200 transition mb-2">
                        <i class="fa-solid fa-folder-plus mr-1"></i> Nova Categoria
                    </button>
                    <div class="border-t border-gray-100 pt-3 mt-3 space-y-2">
                        <button onclick="exportEstoqueCSV()" class="w-full bg-blue-50 text-blue-600 py-2 rounded-xl font-bold text-xs hover:bg-blue-100 transition">
                            <i class="fa-solid fa-file-csv mr-1"></i> Exportar CSV
                        </button>
                        <button onclick="exportEstoquePDF()" class="w-full bg-red-50 text-red-600 py-2 rounded-xl font-bold text-xs hover:bg-red-100 transition">
                            <i class="fa-solid fa-file-pdf mr-1"></i> Exportar PDF (Imprimir)
                        </button>
                    </div>
                </div>
                
                <div class="bg-white p-5 rounded-2xl border border-gray-100 anim-fade" style="animation-delay: 0.1s">
                    <h3 class="font-black text-gray-800 mb-3">Categorias</h3>
                    <ul class="space-y-1 max-h-60 overflow-y-auto no-scrollbar" id="estCatList">
                        <li onclick="filterByCategory('all')" class="est-cat-filter flex justify-between items-center text-sm p-2 rounded-lg cursor-pointer hover:bg-gray-100 transition font-bold text-emerald-700 bg-emerald-50" data-cat="all">
                            Todos <span class="text-[10px] font-bold text-gray-400">${allProducts.filter(p=>p.is_active).length}</span>
                        </li>
                        ${currentCategories.map(c => {
                            const count = allProducts.filter(p => p.category_id === c.id && p.is_active).length;
                            const destColor = c.destination === 'bar' ? 'text-amber-600' : 'text-red-600';
                            return `
                            <li onclick="filterByCategory('${c.id}')" class="est-cat-filter flex justify-between items-center text-sm p-2 rounded-lg cursor-pointer hover:bg-gray-100 transition ${c.is_active ? 'text-gray-600' : 'text-gray-400 line-through'}" data-cat="${c.id}">
                                <span>${c.name}</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] font-bold ${destColor} uppercase">${c.destination}</span>
                                    <span class="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 rounded">${count}</span>
                                </div>
                            </li>`;
                        }).join('')}
                    </ul>
                </div>
            </div>
            
            <!-- Product Table -->
            <div class="lg:col-span-3 bg-white rounded-2xl border border-gray-100 overflow-hidden anim-fade" style="animation-delay: 0.2s">
                <!-- Toolbar -->
                <div class="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                    <div class="relative flex-1 min-w-[200px]">
                        <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input type="text" id="estSearch" placeholder="Buscar produto ou categoria..." class="input-sys pl-9" onkeyup="filterEstoqueTable()">
                    </div>
                    <div id="bulkActions" class="hidden flex items-center gap-2">
                        <span class="text-xs font-bold text-gray-500" id="selectedCount">0 selecionados</span>
                        <button onclick="bulkToggleProducts(false)" class="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition">
                            <i class="fa-solid fa-power-off mr-1"></i> Inativar
                        </button>
                        <button onclick="bulkDeleteProducts()" class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition">
                            <i class="fa-solid fa-trash mr-1"></i> Excluir
                        </button>
                    </div>
                    <span class="text-xs font-bold text-gray-400" id="estProductCount">${totalProducts} produtos</span>
                </div>
                <!-- Quick Filters -->
                <div class="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5 bg-gray-50/50">
                    <button onclick="setStatusFilter('all')" class="est-qf px-3 py-1 rounded-full text-xs font-bold transition bg-emerald-100 text-emerald-700" data-qf="all">Todos</button>
                    <button onclick="setStatusFilter('active')" class="est-qf px-3 py-1 rounded-full text-xs font-bold transition bg-gray-100 text-gray-500 hover:bg-gray-200" data-qf="active"><i class="fa-solid fa-circle text-[6px] text-green-500 mr-1"></i>Ativos</button>
                    <button onclick="setStatusFilter('inactive')" class="est-qf px-3 py-1 rounded-full text-xs font-bold transition bg-gray-100 text-gray-500 hover:bg-gray-200" data-qf="inactive"><i class="fa-solid fa-circle text-[6px] text-red-400 mr-1"></i>Inativos</button>
                    <span class="w-px h-5 bg-gray-200 self-center"></span>
                    <button onclick="setStatusFilter('low')" class="est-qf px-3 py-1 rounded-full text-xs font-bold transition bg-gray-100 text-gray-500 hover:bg-gray-200" data-qf="low"><i class="fa-solid fa-triangle-exclamation text-amber-500 mr-1"></i>Estoque Baixo</button>
                    <button onclick="setStatusFilter('out')" class="est-qf px-3 py-1 rounded-full text-xs font-bold transition bg-gray-100 text-gray-500 hover:bg-gray-200" data-qf="out"><i class="fa-solid fa-ban text-red-500 mr-1"></i>Esgotados</button>
                    <span class="w-px h-5 bg-gray-200 self-center"></span>
                    <button onclick="setStatusFilter('cozinha')" class="est-qf px-3 py-1 rounded-full text-xs font-bold transition bg-gray-100 text-gray-500 hover:bg-gray-200" data-qf="cozinha">🍳 Cozinha</button>
                    <button onclick="setStatusFilter('bar')" class="est-qf px-3 py-1 rounded-full text-xs font-bold transition bg-gray-100 text-gray-500 hover:bg-gray-200" data-qf="bar">🍺 Bar</button>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse" id="estTable">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-100">
                                <th class="py-3 px-4 w-10"><input type="checkbox" id="selectAll" class="w-4 h-4 text-emerald-600 rounded cursor-pointer" onchange="toggleSelectAll(this.checked)"></th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Produto</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Destino</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Preço</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Estoque</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase">Status</th>
                                <th class="py-3 px-4 text-xs font-black text-gray-500 uppercase text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100" id="estTableBody">
                            <tr><td colspan="7" class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin text-xl"></i></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    renderEstoqueRows();
}

let activeStatusFilter = 'all';

function renderEstoqueRows() {
    const tbody = document.getElementById('estTableBody');
    if(!tbody) return;
    selectedProducts.clear();
    updateBulkUI();
    
    let filtered = allProducts;
    
    // Category filter
    if(activeFilter !== 'all') {
        filtered = filtered.filter(p => p.category_id === activeFilter);
    }
    
    // Status quick filter
    switch(activeStatusFilter) {
        case 'active':  filtered = filtered.filter(p => p.is_active); break;
        case 'inactive': filtered = filtered.filter(p => !p.is_active); break;
        case 'low':     filtered = filtered.filter(p => p.is_active && p.is_stock_controlled && p.stock_qty > 0 && p.stock_qty <= p.min_stock); break;
        case 'out':     filtered = filtered.filter(p => p.is_active && p.is_stock_controlled && p.stock_qty <= 0); break;
        case 'cozinha': filtered = filtered.filter(p => (p.categories?.destination || 'cozinha') === 'cozinha'); break;
        case 'bar':     filtered = filtered.filter(p => (p.categories?.destination) === 'bar'); break;
    }
    
    if(filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 font-bold">Nenhum produto encontrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtered.map(p => {
        const catName = p.categories?.name || 'Sem categoria';
        const dest = p.categories?.destination || 'cozinha';
        const destLabel = dest === 'bar' ? '🍺 Bar' : '🍳 Cozinha';
        const destColor = dest === 'bar' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700';
        const isLow = p.is_stock_controlled && p.stock_qty <= p.min_stock;
        const isOut = p.is_stock_controlled && p.stock_qty <= 0;
        
        let stockHtml;
        if(!p.is_stock_controlled) {
            stockHtml = '<span class="text-gray-400 text-xs font-bold uppercase">∞ Ilimitado</span>';
        } else if(isOut) {
            stockHtml = `<div class="flex items-center gap-2">
                <span class="font-black text-red-500">${p.stock_qty} ${p.unit}</span>
                <span class="bg-red-100 text-red-700 text-[9px] font-black px-1.5 py-0.5 rounded">ESGOTADO</span>
                <button onclick="openModStockAdj('${p.id}', '${p.name.replace(/'/g, '\\\'')}', ${p.stock_qty}, '${p.unit}')" class="text-xs text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100">Ajuste</button>
            </div>`;
        } else if(isLow) {
            stockHtml = `<div class="flex items-center gap-2">
                <span class="font-black text-amber-600">${p.stock_qty} ${p.unit}</span>
                <span class="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded">BAIXO</span>
                <button onclick="openModStockAdj('${p.id}', '${p.name.replace(/'/g, '\\\'')}', ${p.stock_qty}, '${p.unit}')" class="text-xs text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100">Ajuste</button>
            </div>`;
        } else {
            stockHtml = `<div class="flex items-center gap-2">
                <span class="font-black text-gray-700">${p.stock_qty} ${p.unit}</span>
                <button onclick="openModStockAdj('${p.id}', '${p.name.replace(/'/g, '\\\'')}', ${p.stock_qty}, '${p.unit}')" class="text-xs text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100">Ajuste</button>
            </div>`;
        }

        return `
            <tr class="hover:bg-gray-50 transition ${p.is_active ? '' : 'opacity-50 bg-gray-50'} est-row" data-id="${p.id}">
                <td class="py-3 px-4"><input type="checkbox" class="est-check w-4 h-4 text-emerald-600 rounded cursor-pointer" data-id="${p.id}" onchange="toggleProductSelect('${p.id}', this.checked)"></td>
                <td class="py-3 px-4">
                    <p class="font-bold text-gray-800 text-sm e-name">${p.name}</p>
                    <p class="text-xs text-gray-500 e-cat">${catName}</p>
                </td>
                <td class="py-3 px-4"><span class="${destColor} text-[10px] font-black px-2 py-0.5 rounded-lg">${destLabel}</span></td>
                <td class="py-3 px-4 font-black text-emerald-700">R$ ${Number(p.price).toFixed(2).replace('.',',')}</td>
                <td class="py-3 px-4">${stockHtml}</td>
                <td class="py-3 px-4">
                    <span class="${p.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'} text-[10px] font-black px-2 py-0.5 rounded-lg">
                        ${p.is_active ? '● Ativo' : '● Inativo'}
                    </span>
                </td>
                <td class="py-3 px-4 text-right space-x-1">
                    <button onclick="editProduct('${p.id}')" class="text-gray-400 hover:text-blue-600 transition p-1" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button onclick="toggleProduct('${p.id}', ${!p.is_active})" class="text-gray-400 hover:text-${p.is_active ? 'red' : 'green'}-600 transition p-1" title="${p.is_active ? 'Inativar' : 'Ativar'}">
                        <i class="fa-solid fa-power-off"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    window._cachedProducts = allProducts;
    document.getElementById('estProductCount').textContent = `${filtered.length} produto(s)`;
}

window.filterByCategory = (catId) => {
    activeFilter = catId;
    document.querySelectorAll('.est-cat-filter').forEach(el => {
        const isActive = el.getAttribute('data-cat') === catId;
        el.classList.toggle('bg-emerald-50', isActive);
        el.classList.toggle('text-emerald-700', isActive);
        el.classList.toggle('font-bold', isActive);
    });
    renderEstoqueRows();
};

window.setStatusFilter = (filter) => {
    activeStatusFilter = filter;
    document.querySelectorAll('.est-qf').forEach(btn => {
        const isActive = btn.getAttribute('data-qf') === filter;
        btn.classList.toggle('bg-emerald-100', isActive);
        btn.classList.toggle('text-emerald-700', isActive);
        btn.classList.toggle('bg-gray-100', !isActive);
        btn.classList.toggle('text-gray-500', !isActive);
    });
    renderEstoqueRows();
};

window.toggleSelectAll = (checked) => {
    document.querySelectorAll('.est-check').forEach(cb => {
        cb.checked = checked;
        const id = cb.getAttribute('data-id');
        if(checked) selectedProducts.add(id);
        else selectedProducts.delete(id);
    });
    updateBulkUI();
};

window.toggleProductSelect = (id, checked) => {
    if(checked) selectedProducts.add(id);
    else selectedProducts.delete(id);
    updateBulkUI();
};

function updateBulkUI() {
    const bulkEl = document.getElementById('bulkActions');
    const countEl = document.getElementById('selectedCount');
    if(!bulkEl) return;
    if(selectedProducts.size > 0) {
        bulkEl.classList.remove('hidden');
        bulkEl.classList.add('flex');
        countEl.textContent = `${selectedProducts.size} selecionado(s)`;
    } else {
        bulkEl.classList.add('hidden');
        bulkEl.classList.remove('flex');
    }
}

window.bulkToggleProducts = async (active) => {
    if(!confirm(`Deseja ${active ? 'ativar' : 'inativar'} ${selectedProducts.size} produto(s)?`)) return;
    for(const id of selectedProducts) {
        await supabase.from('products').update({ is_active: active }).eq('id', id);
    }
    selectedProducts.clear();
    loadModule('estoque');
};

window.bulkDeleteProducts = async () => {
    if(!confirm(`⚠️ ATENÇÃO: Excluir ${selectedProducts.size} produto(s) permanentemente? Esta ação não pode ser desfeita.`)) return;
    for(const id of selectedProducts) {
        await supabase.from('products').delete().eq('id', id);
    }
    selectedProducts.clear();
    loadModule('estoque');
};

window.exportEstoqueCSV = () => {
    const prods = allProducts.filter(p => activeFilter === 'all' || p.category_id === activeFilter);
    const header = 'Nome,Categoria,Destino,Preço,Estoque,Unidade,Status';
    const rows = prods.map(p => {
        const cat = p.categories?.name || 'Sem Categoria';
        const dest = p.categories?.destination || 'cozinha';
        return `"${p.name}","${cat}","${dest}",${Number(p.price).toFixed(2)},${p.is_stock_controlled ? p.stock_qty : 'Ilimitado'},"${p.unit}","${p.is_active ? 'Ativo' : 'Inativo'}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estoque_balneario_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

window.exportEstoquePDF = () => {
    // Simple print-based PDF generation
    const prods = allProducts.filter(p => activeFilter === 'all' || p.category_id === activeFilter);
    const rows = prods.map(p => `
        <tr style="border-bottom:1px solid #eee">
            <td style="padding:6px 8px;font-weight:bold">${p.name}</td>
            <td style="padding:6px 8px">${p.categories?.name || '-'}</td>
            <td style="padding:6px 8px">R$ ${Number(p.price).toFixed(2).replace('.',',')}</td>
            <td style="padding:6px 8px">${p.is_stock_controlled ? p.stock_qty + ' ' + p.unit : '∞'}</td>
            <td style="padding:6px 8px">${p.is_active ? 'Ativo' : 'Inativo'}</td>
        </tr>
    `).join('');
    
    const printWin = window.open('', '_blank');
    printWin.document.write(`
        <html><head><title>Relatório de Estoque - Balneário Rio Preto</title>
        <style>body{font-family:Arial,sans-serif;padding:30px}table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:8px;font-size:12px;text-transform:uppercase}td{font-size:13px}h1{font-size:20px;margin-bottom:5px}p{color:#888;font-size:12px;margin-bottom:20px}</style></head><body>
        <h1>📦 Relatório de Estoque</h1>
        <p>Balneário Rio Preto — Gerado em ${new Date().toLocaleString('pt-BR')}</p>
        <table>
            <thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <script>setTimeout(()=>{window.print();window.close()},500)<\/script>
        </body></html>
    `);
    printWin.document.close();
};

async function loadEstoqueTable() {
    const { data: prods } = await supabase.from('products').select('*, categories(name, destination)').order('name');
    allProducts = prods || [];
    renderEstoqueRows();
}

window.filterEstoqueTable = () => {
    const q = document.getElementById('estSearch').value.toLowerCase();
    document.querySelectorAll('.est-row').forEach(row => {
        const txt = row.querySelector('.e-name').textContent.toLowerCase() + " " + row.querySelector('.e-cat').textContent.toLowerCase();
        row.style.display = txt.includes(q) ? '' : 'none';
    });
};

window.openModCategory = () => {
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800">Nova Categoria</h3>
                    <button onclick="closeMod()" class="text-gray-400"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="label-sys">Nome da Categoria</label>
                        <input type="text" id="modCatName" class="input-sys" placeholder="Ex: Bebidas">
                    </div>
                    <div>
                        <label class="label-sys">Destino KDS</label>
                        <select id="modCatDest" class="input-sys">
                            <option value="cozinha">Cozinha 🍳</option>
                            <option value="bar">Bar 🍺</option>
                        </select>
                    </div>
                    <button onclick="saveCategory()" id="btnSaveCat" class="w-full mt-4 bg-emerald-600 text-white py-3 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition">SALVAR</button>
                </div>
            </div>
        </div>
    `;
};

window.saveCategory = async () => {
    const name = document.getElementById('modCatName').value.trim();
    const dest = document.getElementById('modCatDest').value;
    if(!name) return alert('Nome é obrigatório');
    
    const btn = document.getElementById('btnSaveCat');
    btn.disabled = true; btn.innerHTML = 'Salvando...';
    
    const { error } = await supabase.from('categories').insert({ name, destination: dest });
    
    if(error){ alert('Erro: ' + error.message); btn.disabled = false; btn.innerHTML = 'SALVAR'; }
    else { closeMod(); loadModule('estoque'); }
};

window.openModProduct = (id = null) => {
    const p = id ? window._cachedProducts.find(x => x.id === id) : null;
    
    const catOptions = currentCategories.map(c => 
        `<option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800">${p ? 'Editar Produto' : 'Novo Produto'}</h3>
                    <button onclick="closeMod()" class="text-gray-400"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2">
                            <label class="label-sys">Nome do Produto</label>
                            <input type="text" id="modProdName" class="input-sys" value="${p ? p.name : ''}">
                        </div>
                        <div>
                            <label class="label-sys">Categoria</label>
                            <select id="modProdCat" class="input-sys bg-white">${catOptions}</select>
                        </div>
                        <div>
                            <label class="label-sys">Preço Venda (R$)</label>
                            <input type="number" step="0.01" id="modProdPrice" class="input-sys" value="${p ? p.price : ''}">
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 border border-gray-200 p-4 rounded-xl mt-4">
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" id="modProdCtrl" class="w-5 h-5 text-emerald-600 rounded" ${p && !p.is_stock_controlled ? '' : 'checked'} onchange="document.getElementById('stockFields').style.display = this.checked ? 'block' : 'none'">
                            <span class="font-bold text-sm text-gray-700">Controlar Estoque</span>
                        </label>
                        
                        <div id="stockFields" class="mt-4 pt-4 border-t border-gray-200" style="display: ${p && !p.is_stock_controlled ? 'none' : 'block'}">
                            <div class="grid grid-cols-3 gap-3">
                                <div class="${p ? 'opacity-50' : ''}">
                                    <label class="label-sys">Qtd Atual</label>
                                    <input type="number" step="0.01" id="modProdQty" class="input-sys" value="${p ? p.stock_qty : 0}" ${p ? 'disabled title="Use Ajuste de Estoque para alterar"' : ''}>
                                </div>
                                <div>
                                    <label class="label-sys">Est. Mínimo</label>
                                    <input type="number" step="0.01" id="modProdMin" class="input-sys" value="${p ? p.min_stock : 5}">
                                </div>
                                <div>
                                    <label class="label-sys">Unidade (un, kg)</label>
                                    <input type="text" id="modProdUnit" class="input-sys" value="${p ? p.unit : 'un'}">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <button onclick="saveProduct('${id || ''}')" id="btnSaveProd" class="w-full mt-4 bg-emerald-600 text-white py-3 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition">
                        SALVAR PRODUTO
                    </button>
                </div>
            </div>
        </div>
    `;
};

window.editProduct = (id) => openModProduct(id);

window.saveProduct = async (id) => {
    const name = document.getElementById('modProdName').value.trim();
    const cat = document.getElementById('modProdCat').value;
    const price = parseFloat(document.getElementById('modProdPrice').value || 0);
    const ctrl = document.getElementById('modProdCtrl').checked;
    const min = parseFloat(document.getElementById('modProdMin').value || 0);
    const unit = document.getElementById('modProdUnit').value.trim() || 'un';
    
    if(!name || !cat) return alert('Nome e categoria são obrigatórios');
    
    document.getElementById('btnSaveProd').disabled = true;
    
    const payload = {
        name, category_id: cat, price, is_stock_controlled: ctrl,
        min_stock: min, unit
    };
    
    if(!id) {
        payload.stock_qty = parseFloat(document.getElementById('modProdQty').value || 0);
        const { error } = await supabase.from('products').insert(payload);
        if(error) alert('Erro: ' + error.message);
    } else {
        const { error } = await supabase.from('products').update(payload).eq('id', id);
        if(error) alert('Erro: ' + error.message);
    }
    
    closeMod();
    loadEstoqueTable();
};

window.toggleProduct = async (id, active) => {
    await supabase.from('products').update({ is_active: active }).eq('id', id);
    loadEstoqueTable();
};

window.openModStockAdj = (id, name, curr, unit) => {
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeMod()">
            <div class="modal-box anim-fade">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800">Ajuste de Estoque</h3>
                    <button onclick="closeMod()" class="text-gray-400"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <p class="font-bold text-gray-700 mb-2">${name}</p>
                <div class="bg-gray-50 p-3 rounded-lg mb-4 flex justify-between">
                    <span class="text-xs font-bold text-gray-500 uppercase">Físico Atual</span>
                    <span class="font-black text-gray-800">${curr} ${unit}</span>
                </div>
                
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="label-sys">Tipo de Movimento</label>
                            <select id="adjType" class="input-sys text-sm">
                                <option value="entrada">+ Entrada</option>
                                <option value="saida">- Saída</option>
                                <option value="balanco">= Balanço (Setar novo total)</option>
                            </select>
                        </div>
                        <div>
                            <label class="label-sys">Quantidade</label>
                            <input type="number" step="0.01" id="adjQty" class="input-sys" placeholder="0">
                        </div>
                    </div>
                    <div>
                        <label class="label-sys">Motivo / Observação</label>
                        <input type="text" id="adjReason" class="input-sys" placeholder="Ex: Compra NF 123, Perda...">
                    </div>
                    
                    <button onclick="saveStockAdj('${id}', ${curr})" id="btnAdj" class="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 transition">
                        CONFIRMAR AJUSTE
                    </button>
                </div>
            </div>
        </div>
    `;
};

window.saveStockAdj = async (id, curr) => {
    const type = document.getElementById('adjType').value;
    const inputQty = parseFloat(document.getElementById('adjQty').value || 0);
    const reason = document.getElementById('adjReason').value.trim();
    
    if(inputQty <= 0) return alert('Quantidade deve ser maior que zero');
    
    let newQty = curr;
    let mvQty = inputQty;
    
    if(type === 'entrada') newQty = curr + inputQty;
    else if(type === 'saida') { newQty = curr - inputQty; if(newQty < 0) newQty = 0; }
    else if(type === 'balanco') {
        newQty = inputQty;
        mvQty = Math.abs(newQty - curr);
        if(mvQty === 0) return closeMod();
    }
    
    const realType = (type === 'balanco') ? (newQty > curr ? 'entrada' : 'saida') : type;
    const staff = await import('./sistema_auth.js').then(m => m.getCurrentStaff());
    
    document.getElementById('btnAdj').disabled = true;
    
    // Update Product Stock
    await supabase.from('products').update({ stock_qty: newQty }).eq('id', id);
    
    // Audit log
    await supabase.from('stock_movements').insert({
        product_id: id,
        type: realType,
        quantity: mvQty,
        previous_qty: curr,
        new_qty: newQty,
        reason: reason || 'Ajuste Manual',
        staff_id: staff.id
    });
    
    closeMod();
    loadEstoqueTable();
};

export { renderEstoque };
