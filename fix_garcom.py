import re

with open('garcom.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update fetchLocationStats
content = content.replace('''                locationStats[key] = { 
                    total_open_val: 0, 
                    open_orders: 0, 
                    preparing_orders: 0,
                    ready_orders: 0,
                    status_color: 'livre'
                };
            }
            
            if (isTodayOpen) {
                locationStats[key].total_open_val += Number(o.total);
                locationStats[key].open_orders++;

                if (o.status === 'pendente' || o.status === 'fazendo') {
                    locationStats[key].preparing_orders++;
                } else if (o.status === 'pronto' || o.status === 'entregue') {
                    locationStats[key].ready_orders++;
                }
            }''', '''                locationStats[key] = { 
                    total_open_val: 0, 
                    open_orders: 0, 
                    counts: { pendente: 0, preparando: 0, pronto: 0, entregue: 0 },
                    status_color: 'livre'
                };
            }
            
            if (isTodayOpen) {
                locationStats[key].total_open_val += Number(o.total);
                locationStats[key].open_orders++;

                if (o.status && locationStats[key].counts[o.status] !== undefined) {
                    locationStats[key].counts[o.status]++;
                }
            }''')

# 2. Update status_color calculation
content = content.replace('''        // Calculate status_color per location key
        Object.keys(locationStats).forEach(k => {
            const stat = locationStats[k];
            if (stat.total_open_val > 0 || stat.open_orders > 0) {
                if (stat.preparing_orders > 0) {
                    stat.status_color = 'preparando'; // 🔴 Red
                } else {
                    stat.status_color = 'pronto'; // 🟢 Green (Ready for closing / delivered)
                }
            } else {
                stat.status_color = 'livre'; // ⚪ Free
            }
        });''', '''        // Calculate status_color per location key
        Object.keys(locationStats).forEach(k => {
            const stat = locationStats[k];
            if (stat.total_open_val > 0 || stat.open_orders > 0) {
                if (stat.counts.pronto > 0) {
                    stat.status_color = 'pronto';
                } else if (stat.counts.preparando > 0) {
                    stat.status_color = 'preparando';
                } else if (stat.counts.pendente > 0) {
                    stat.status_color = 'pendente';
                } else {
                    stat.status_color = 'ocupado';
                }
            } else {
                stat.status_color = 'livre'; // ⚪ Free
            }
        });''')


# 3. Update filter categories
content = content.replace('''window.filterLocationGrid = (filterKey) => {
    currentGridFilter = filterKey;
    ['todos', 'preparando', 'pronto', 'livre'].forEach(k => {''', '''window.filterLocationGrid = (filterKey) => {
    currentGridFilter = filterKey;
    ['todos', 'pendente', 'preparando', 'pronto', 'livre'].forEach(k => {''')

content = content.replace('''function matchesGridFilter(stat) {
    if (currentGridFilter === 'todos') return true;
    if (currentGridFilter === 'preparando') return stat.status_color === 'preparando';
    if (currentGridFilter === 'pronto') return stat.status_color === 'pronto';
    if (currentGridFilter === 'livre') return stat.status_color === 'livre';
    return true;
}''', '''function matchesGridFilter(stat) {
    if (currentGridFilter === 'todos') return true;
    if (currentGridFilter === 'pendente') return stat.status_color === 'pendente';
    if (currentGridFilter === 'preparando') return stat.status_color === 'preparando';
    if (currentGridFilter === 'pronto') return stat.status_color === 'pronto';
    if (currentGridFilter === 'livre') return stat.status_color === 'livre';
    return true;
}''')


# 4. Update createLocationBtn
old_create_loc = '''    if (stats && stats.total_open_val > 0) {
        if (stats.status_color === 'preparando') {
            // 🔴 PREPARANDO (Red)
            colorClasses = 'bg-red-50/90 border-2 border-red-500 shadow-md shadow-red-100/50';
            badgesHtml = `<div class="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse flex items-center gap-1 border-2 border-white"><i class="fa-solid fa-fire-burner"></i> PREPARANDO</div>`;
        } else if (stats.status_color === 'pronto') {
            // 🟢 PRONTO / APTO PARA FECHAMENTO (Green)
            colorClasses = 'bg-emerald-50/90 border-2 border-emerald-500 shadow-md shadow-emerald-100/50';
            badgesHtml = `<div class="absolute -top-2 -right-2 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 border-2 border-white"><i class="fa-solid fa-circle-check"></i> APTO</div>`;
        }

        amountsHtml = `<div class="mt-2 pt-2 border-t border-stone-200/60 w-full text-center">
            <span class="text-[9px] font-extrabold text-stone-500 uppercase block leading-none mb-1">Consumo</span>
            <span class="text-xs font-black ${stats.status_color === 'preparando' ? 'text-red-700' : 'text-emerald-700'} block leading-none">R$ ${stats.total_open_val.toFixed(2).replace('.', ',')}</span>
        </div>`;'''
new_create_loc = '''    if (stats && stats.total_open_val > 0) {
        if (stats.status_color === 'pendente') {
            colorClasses = 'bg-red-50/90 border-2 border-red-500 shadow-md shadow-red-100/50';
            badgesHtml = `<div class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse flex items-center gap-1 border-2 border-white"><i class="fa-solid fa-clock"></i> PENDENTE</div>`;
        } else if (stats.status_color === 'preparando') {
            colorClasses = 'bg-amber-50/90 border-2 border-amber-500 shadow-md shadow-amber-100/50';
            badgesHtml = `<div class="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse flex items-center gap-1 border-2 border-white"><i class="fa-solid fa-fire-burner"></i> PREPARANDO</div>`;
        } else if (stats.status_color === 'pronto') {
            colorClasses = 'bg-emerald-50/90 border-2 border-emerald-500 shadow-md shadow-emerald-100/50';
            badgesHtml = `<div class="absolute -top-2 -right-2 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 border-2 border-white"><i class="fa-solid fa-bell animate-bounce"></i> PRONTO</div>`;
        } else {
            colorClasses = 'bg-blue-50/90 border-2 border-blue-400 shadow-md shadow-blue-100/50';
            badgesHtml = `<div class="absolute -top-2 -right-2 bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 border-2 border-white"><i class="fa-solid fa-user-check"></i> OCUPADO</div>`;
        }

        amountsHtml = `<div class="mt-2 pt-2 border-t border-stone-200/60 w-full text-center">
            <span class="text-[9px] font-extrabold text-stone-500 uppercase block leading-none mb-1">Consumo</span>
            <span class="text-xs font-black text-stone-800 block leading-none">R$ ${stats.total_open_val.toFixed(2).replace('.', ',')}</span>
        </div>`;'''
content = content.replace(old_create_loc, new_create_loc)

# 5. Update loadComandasAtivasFeed calculation
old_ativas_calc = '''        let hasPreparing = false;
        let totalItemsCount = 0;

        loc.orders.forEach(o => {
            (o.order_items || []).forEach(i => {
                totalItemsCount += i.quantity;
                if (i.status === 'pendente' || i.status === 'fazendo' || o.status === 'pendente' || o.status === 'fazendo') {
                    hasPreparing = true;
                }
            });
        });

        const now = Date.now();
        const start = new Date(loc.firstCreatedAt).getTime();
        const diffMins = Math.floor((now - start) / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        const durationStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;

        const statusBadgeHtml = hasPreparing
            ? `<span class="bg-red-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm animate-pulse"><i class="fa-solid fa-fire-burner"></i> PREPARANDO</span>`
            : `<span class="bg-emerald-600 text-white font-black text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm"><i class="fa-solid fa-circle-check"></i> APTO / ENTREGUE</span>`;'''

new_ativas_calc = '''        let counts = { pendente: 0, preparando: 0, pronto: 0, entregue: 0 };
        let totalItemsCount = 0;

        loc.orders.forEach(o => {
            if (o.status && counts[o.status] !== undefined) counts[o.status]++;
            (o.order_items || []).forEach(i => {
                totalItemsCount += i.quantity;
            });
        });
        
        let locStatusColor = 'livre';
        if (counts.pronto > 0) locStatusColor = 'pronto';
        else if (counts.preparando > 0) locStatusColor = 'preparando';
        else if (counts.pendente > 0) locStatusColor = 'pendente';
        else locStatusColor = 'ocupado';

        const now = Date.now();
        const start = new Date(loc.firstCreatedAt).getTime();
        const diffMins = Math.floor((now - start) / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        const durationStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;

        const statusBadgeHtml = locStatusColor === 'ocupado'
            ? `<span class="bg-blue-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm"><i class="fa-solid fa-user-check"></i> OCUPADO</span>`
            : locStatusColor === 'pendente'
            ? `<span class="bg-red-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm animate-pulse"><i class="fa-solid fa-clock"></i> PENDENTE</span>`
            : locStatusColor === 'preparando'
            ? `<span class="bg-amber-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm animate-pulse"><i class="fa-solid fa-fire-burner"></i> PREPARANDO</span>`
            : `<span class="bg-emerald-600 text-white font-black text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm"><i class="fa-solid fa-bell animate-bounce"></i> PRONTO</span>`;'''

content = content.replace(old_ativas_calc, new_ativas_calc)

# 6. Toast Notification message
content = content.replace("está PRONTO!`", "está PRONTO PARA RETIRADA!`")

with open('garcom.js', 'w', encoding='utf-8') as f:
    f.write(content)

