/**
 * Fechamento Semanal e Gerador de Relatório Financeiro - Balneário Rio Preto
 * Contabilidade Precisa (Separação Rigorosa de Comandas Paga vs Aberta) & Comparativo de Estoque
 */
import { supabase } from './scripts.js';

function fmt(v){ return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); }

function getWeekRange(){
  const now = new Date(), d = now.getDay(), diff = d === 0 ? 6 : d - 1;
  const mon = new Date(now); mon.setDate(now.getDate() - diff); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { start: mon, end: sun };
}

function dateStr(d){ return d.toISOString().split('T')[0]; }

export async function renderFechamentoSemanal(container){
  const w = getWeekRange();
  container.innerHTML = `
  <div class="max-w-6xl mx-auto anim-fade space-y-6">
    <div class="flex flex-wrap items-center gap-4 mb-2">
      <div>
        <h2 class="text-2xl font-black text-gray-800">Gerar Relatório de Fechamento</h2>
        <p class="text-xs text-gray-500 font-bold">Relatório financeiro com separação de faturamento pago, comandas em aberto e comparativo de estoque</p>
      </div>
      <div class="flex items-center gap-2 ml-auto">
        <input type="date" id="fsStart" class="input-sys !w-auto" value="${dateStr(w.start)}">
        <span class="text-gray-400 font-bold">→</span>
        <input type="date" id="fsEnd" class="input-sys !w-auto" value="${dateStr(w.end)}">
        <button id="fsBtnLoad" class="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-sm hover:bg-blue-700 shadow-md transition">Gerar Relatório</button>
      </div>
    </div>

    <div id="fsContent" class="space-y-6"><p class="text-gray-400 text-center py-12 font-bold">Selecione o período desejado acima e clique em <strong>Gerar Relatório</strong></p></div>

    <div id="fsActions" class="hidden flex flex-wrap gap-3 mt-6 pt-4 border-t border-gray-200">
      <button id="fsCsv" class="bg-emerald-600 text-white px-5 py-3 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition"><i class="fa-solid fa-file-csv mr-2"></i>Exportar CSV</button>
      <button id="fsSave" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 transition"><i class="fa-solid fa-floppy-disk mr-2"></i>Salvar no Banco</button>
      
      <div class="flex bg-indigo-50 rounded-xl overflow-hidden shadow-lg border border-indigo-200">
        <button id="fsPrintAll" class="bg-indigo-600 text-white px-4 py-3 font-black hover:bg-indigo-700 transition border-r border-indigo-800"><i class="fa-solid fa-print mr-2"></i>Imprimir Tudo</button>
        <button id="fsPrintResumo" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition border-r border-indigo-200">Resumo</button>
        <button id="fsPrintAbertas" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition border-r border-indigo-200">Em Aberto</button>
        <button id="fsPrintEstoque" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition border-r border-indigo-200">Estoque</button>
        <button id="fsPrintPedidos" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition">Pedidos</button>
      </div>
    </div>
  </div>`;

  let reportData = null;

  document.getElementById('fsBtnLoad').onclick = async () => {
    const s = document.getElementById('fsStart').value, e = document.getElementById('fsEnd').value;
    if (!s || !e) return;
    document.getElementById('fsContent').innerHTML = '<div class="flex justify-center py-20"><i class="fa-solid fa-spinner fa-spin text-4xl text-blue-600"></i></div>';
    reportData = await loadReport(s, e);
    renderReport(reportData);
  };

  async function loadReport(startDate, endDate){
    const [ordersRes, orderItemsRes, gateRes, bookingsRes, funcsRes, prodsRes] = await Promise.all([
      supabase.from('orders').select('*, staff_users(name)').gte('created_at', startDate + 'T00:00:00').lte('created_at', endDate + 'T23:59:59').neq('status', 'cancelado'),
      supabase.from('order_items').select('*, orders!inner(created_at, status, staff_id, payment_status)').gte('orders.created_at', startDate + 'T00:00:00').lte('orders.created_at', endDate + 'T23:59:59'),
      supabase.from('gate_entries').select('*').gte('created_at', startDate + 'T00:00:00').lte('created_at', endDate + 'T23:59:59'),
      supabase.from('bookings').select('*').gte('checkin_date', startDate).lte('checkin_date', endDate),
      supabase.from('funcionarios').select('*').eq('is_active', true),
      supabase.from('products').select('*, categories(name)').order('name')
    ]);

    const allOrdersData = ordersRes.data || [];
    const allItemsData = orderItemsRes.data || [];
    const gateData = gateRes.data || [];
    const bookingsData = bookingsRes.data || [];
    const funcsData = funcsRes.data || [];
    const productsData = prodsRes.data || [];

    // RIGOROUS SEPARATION: PAID vs. OPEN ORDERS
    const paidOrdersData = allOrdersData.filter(o => o.payment_status === 'pago');
    const openOrdersData = allOrdersData.filter(o => o.payment_status === 'aberto' && o.status !== 'cancelado');
    const paidItemsData = allItemsData.filter(i => i.orders?.payment_status === 'pago');

    // 1. Group PAID ORDERS by day for accurate revenue breakdown
    const dayMap = {};
    paidOrdersData.forEach(o => {
      const day = new Date(o.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho', weekday: 'long' });
      const dayKey = day.charAt(0).toUpperCase() + day.slice(1);
      if (!dayMap[dayKey]) dayMap[dayKey] = { cozinha: 0, bar: 0, orders: [], cozinha_items: [], bar_items: [] };
      dayMap[dayKey].orders.push(o);
    });

    // Use paid order items to split cozinha vs bar revenue accurately
    paidItemsData.forEach(item => {
      const orderDate = item.orders?.created_at;
      if (!orderDate) return;
      const day = new Date(orderDate).toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho', weekday: 'long' });
      const dayKey = day.charAt(0).toUpperCase() + day.slice(1);
      if (!dayMap[dayKey]) dayMap[dayKey] = { cozinha: 0, bar: 0, orders: [], cozinha_items: [], bar_items: [] };
      const dest = (item.destination || '').toLowerCase();
      const itemTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
      if (dest === 'cozinha') {
        dayMap[dayKey].cozinha += itemTotal;
        dayMap[dayKey].cozinha_items.push(item);
      } else {
        dayMap[dayKey].bar += itemTotal;
        dayMap[dayKey].bar_items.push(item);
      }
    });

    // 2. Group gate entries by day
    const gateDayMap = {};
    let totalPortaria = 0;
    gateData.forEach(g => {
      const day = new Date(g.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho', weekday: 'long' });
      const dayKey = day.charAt(0).toUpperCase() + day.slice(1);
      if (!gateDayMap[dayKey]) gateDayMap[dayKey] = { total: 0, entries: [] };
      const val = Number(g.amount_paid || g.total_amount || 0);
      gateDayMap[dayKey].total += val;
      gateDayMap[dayKey].entries.push(g);
      totalPortaria += val;
    });

    // 3. Payment method totals (PAID ORDERS ONLY)
    const payMethods = { dinheiro: 0, pix: 0, cartao_debito: 0, cartao_credito: 0, cartao: 0 };
    paidOrdersData.forEach(o => {
      if (Number(o.split_pix || 0) > 0 || Number(o.split_dinheiro || 0) > 0 || Number(o.split_credito || 0) > 0 || Number(o.split_debito || 0) > 0) {
        payMethods.pix += Number(o.split_pix || 0);
        payMethods.dinheiro += Number(o.split_dinheiro || 0);
        payMethods.cartao_credito += Number(o.split_credito || 0);
        payMethods.cartao_debito += Number(o.split_debito || 0);
      } else {
        const pm = (o.payment_method || '').toLowerCase();
        if (pm.includes('dinheiro')) payMethods.dinheiro += Number(o.total || 0);
        else if (pm.includes('pix')) payMethods.pix += Number(o.total || 0);
        else if (pm.includes('deb')) payMethods.cartao_debito += Number(o.total || 0);
        else if (pm.includes('cred')) payMethods.cartao_credito += Number(o.total || 0);
        else if (pm.includes('cart')) payMethods.cartao += Number(o.total || 0);
      }
    });

    // 4. Garçom tips calculation (PAID ORDERS ONLY)
    const garcomMap = {};
    paidOrdersData.forEach(o => {
      const waiter = (o.staff_users && o.staff_users.name) || 'Desconhecido';
      if (!garcomMap[waiter]) garcomMap[waiter] = { total: 0, card: 0, pix: 0, cash: 0, serviceFee: 0 };
      const t = Number(o.total || 0), pm = (o.payment_method || '').toLowerCase();
      garcomMap[waiter].total += t;
      garcomMap[waiter].serviceFee += Number(o.service_fee || 0);
      
      const spPix = Number(o.split_pix || 0);
      const spDin = Number(o.split_dinheiro || 0);
      const spCre = Number(o.split_credito || 0);
      const spDeb = Number(o.split_debito || 0);
      
      if (spPix > 0 || spDin > 0 || spCre > 0 || spDeb > 0) {
        garcomMap[waiter].pix += spPix;
        garcomMap[waiter].cash += spDin;
        garcomMap[waiter].card += (spCre + spDeb);
      } else {
        if (pm.includes('cart') || pm.includes('deb') || pm.includes('cred')) garcomMap[waiter].card += t;
        else if (pm.includes('pix')) garcomMap[waiter].pix += t;
        else garcomMap[waiter].cash += t;
      }
    });

    // Totals calculation
    const totalCozinha = Object.values(dayMap).reduce((s, d) => s + d.cozinha, 0);
    const totalBar = Object.values(dayMap).reduce((s, d) => s + d.bar, 0);
    const totalChalets = bookingsData.reduce((s, b) => s + Number(b.total_price || 0), 0);
    const totalEfetivoPago = totalCozinha + totalBar + totalPortaria + totalChalets;

    // Open Comandas Total
    const totalOpenOrdersAmount = openOrdersData.reduce((s, o) => s + Number(o.total || 0), 0);

    // 5. STOCK COMPARISON (Estoque Inicial Estimado vs Vendas no Período vs Estoque Final Atual)
    const stockComparison = productsData.filter(p => p.is_stock_controlled).map(prod => {
      const qtySold = allItemsData.filter(item => item.product_id === prod.id).reduce((s, item) => s + Number(item.quantity || 0), 0);
      const finalStock = Number(prod.stock_qty || 0);
      const initialStock = finalStock + qtySold;
      return {
        id: prod.id,
        name: prod.name,
        category: prod.categories?.name || 'Geral',
        initialStock,
        qtySold,
        finalStock
      };
    });

    return {
      startDate, endDate, dayMap, gateDayMap, payMethods, garcomMap,
      totalCozinha, totalBar, totalPortaria, totalChalets,
      totalEfetivoPago, totalOpenOrdersAmount,
      paidOrdersData, openOrdersData, allOrdersData, gateData, bookingsData, funcsData,
      stockComparison
    };
  }

  function renderReport(r){
    const c = document.getElementById('fsContent');
    const days = Object.keys(r.dayMap);

    c.innerHTML = `
    <!-- RESUMO DE FATURAMENTO EFETIVADO (PAGO) -->
    <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
      <div class="flex justify-between items-center pb-2 border-b border-gray-100">
        <div>
          <h3 class="text-xl font-black text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-chart-pie text-emerald-600"></i> Faturamento Efetivamente Recebido (Pago)
          </h3>
          <p class="text-xs font-bold text-gray-400">Valores pagos e integrados ao caixa no período de ${r.startDate} a ${r.endDate}</p>
        </div>
        <span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-black uppercase">
          ${r.paidOrdersData.length} Vendas Pagas
        </span>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-center">
          <div class="text-xs font-black text-orange-600 uppercase mb-1">Cozinha (Restaurante)</div>
          <div class="text-xl font-black text-orange-800">${fmt(r.totalCozinha)}</div>
        </div>
        <div class="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
          <div class="text-xs font-black text-amber-600 uppercase mb-1">Bar (Bebidas)</div>
          <div class="text-xl font-black text-amber-800">${fmt(r.totalBar)}</div>
        </div>
        <div class="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 text-center">
          <div class="text-xs font-black text-cyan-600 uppercase mb-1">Portaria</div>
          <div class="text-xl font-black text-cyan-800">${fmt(r.totalPortaria)}</div>
        </div>
        <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
          <div class="text-xs font-black text-emerald-600 uppercase mb-1">Chalés</div>
          <div class="text-xl font-black text-emerald-800">${fmt(r.totalChalets)}</div>
        </div>
        <div class="bg-emerald-600 text-white rounded-2xl p-4 text-center shadow-lg shadow-emerald-600/20">
          <div class="text-xs font-black text-emerald-100 uppercase mb-1">TOTAL RECEBIDO (PAGO)</div>
          <div class="text-2xl font-black text-white">${fmt(r.totalEfetivoPago)}</div>
        </div>
      </div>

      <table class="w-full text-sm border-collapse mt-4">
        <thead><tr class="bg-gray-50"><th class="py-2.5 px-3 text-left text-xs font-black text-gray-500">Dia da Semana</th><th class="py-2.5 px-3 text-right text-xs font-black text-gray-500">Cozinha (Pago)</th><th class="py-2.5 px-3 text-right text-xs font-black text-gray-500">Bar (Pago)</th><th class="py-2.5 px-3 text-right text-xs font-black text-gray-500">Total Pago</th></tr></thead>
        <tbody>${days.map(d => { const v = r.dayMap[d]; return `<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold text-gray-800">${d}</td><td class="py-2 px-3 text-right text-gray-600">${fmt(v.cozinha)}</td><td class="py-2 px-3 text-right text-gray-600">${fmt(v.bar)}</td><td class="py-2 px-3 text-right font-black text-emerald-700">${fmt(v.cozinha + v.bar)}</td></tr>`; }).join('')}</tbody>
      </table>
    </div>

    <!-- SEÇÃO DEDICADA: COMANDAS EM ABERTO (A RECEBER) -->
    <div class="bg-white rounded-3xl border border-amber-200 p-6 shadow-sm space-y-4">
      <div class="flex justify-between items-center pb-2 border-b border-amber-100">
        <div>
          <h3 class="text-xl font-black text-amber-900 flex items-center gap-2">
            <i class="fa-solid fa-clock-rotate-left text-amber-600"></i> Comandas em Aberto (A Receber - Pendente)
          </h3>
          <p class="text-xs font-bold text-amber-700">Comandas ativas que ainda NÃO foram pagas pelo cliente. Não contadas no caixa físico.</p>
        </div>
        <div class="bg-amber-500 text-white px-4 py-1.5 rounded-2xl text-xs font-black uppercase shadow-md">
          ${r.openOrdersData.length} Comandas Abertas • Total: ${fmt(r.totalOpenOrdersAmount)}
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-amber-50/70 text-amber-900">
              <th class="py-2.5 px-3 text-left text-xs font-black">ID / Local</th>
              <th class="py-2.5 px-3 text-left text-xs font-black">Cliente / Garçom</th>
              <th class="py-2.5 px-3 text-center text-xs font-black">Data/Hora Abertura</th>
              <th class="py-2.5 px-3 text-right text-xs font-black">Valor Pendente</th>
            </tr>
          </thead>
          <tbody>
            ${(r.openOrdersData || []).map(o => `
              <tr class="border-t border-amber-100 hover:bg-amber-50/30 transition">
                <td class="py-2 px-3">
                  <span class="font-mono text-xs font-bold text-amber-700">#${o.order_number || o.id.substring(0,5)}</span>
                  <div class="font-black uppercase text-gray-800">${o.location_type || 'Mesa'} ${o.location_id}</div>
                </td>
                <td class="py-2 px-3">
                  <div class="font-bold text-gray-900">${o.customer_name || 'Não Informado'}</div>
                  <div class="text-[10px] text-gray-500 font-bold">Garçom: ${o.staff_users?.name || 'Sistema'}</div>
                </td>
                <td class="py-2 px-3 text-center text-xs font-medium text-gray-500">
                  ${new Date(o.created_at).toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho' })}
                </td>
                <td class="py-2 px-3 text-right font-black text-amber-700">
                  ${fmt(o.total)}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="py-6 text-center text-gray-400 font-bold">Nenhuma comanda em aberto no período! 🎉</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- COMPARATIVO DE ESTOQUE (INICIAL VS FINAL NO PERÍODO) -->
    <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
      <div class="flex justify-between items-center pb-2 border-b border-gray-100">
        <div>
          <h3 class="text-xl font-black text-gray-800 flex items-center gap-2">
            <i class="fa-solid fa-boxes-stacked text-blue-600"></i> Comparativo de Estoque (Inicial vs Final no Período)
          </h3>
          <p class="text-xs font-bold text-gray-400">Apuração das saídas de produtos controlados durante o período selecionado</p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="bg-gray-50 text-gray-600">
              <th class="py-2.5 px-3 text-left text-xs font-black">Produto</th>
              <th class="py-2.5 px-3 text-left text-xs font-black">Categoria</th>
              <th class="py-2.5 px-3 text-center text-xs font-black">Estoque Inicial Estimado</th>
              <th class="py-2.5 px-3 text-center text-xs font-black">Vendas no Período</th>
              <th class="py-2.5 px-3 text-center text-xs font-black">Estoque Final Atual</th>
              <th class="py-2.5 px-3 text-center text-xs font-black">Status</th>
            </tr>
          </thead>
          <tbody>
            ${(r.stockComparison || []).map(p => {
              let statusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-black uppercase">Normal</span>';
              if (p.finalStock === 0) statusBadge = '<span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-black uppercase">Esgotado</span>';
              else if (p.finalStock <= 5) statusBadge = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-black uppercase">Estoque Baixo</span>';
              
              return `
                <tr class="border-t border-gray-100 hover:bg-gray-50/50 transition">
                  <td class="py-2.5 px-3 font-bold text-gray-800">${p.name}</td>
                  <td class="py-2.5 px-3 text-xs text-gray-500 font-bold">${p.category}</td>
                  <td class="py-2.5 px-3 text-center font-bold text-gray-600">${p.initialStock} un</td>
                  <td class="py-2.5 px-3 text-center font-black text-rose-600">-${p.qtySold} un</td>
                  <td class="py-2.5 px-3 text-center font-black text-emerald-700">${p.finalStock} un</td>
                  <td class="py-2.5 px-3 text-center">${statusBadge}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="6" class="py-4 text-center text-gray-400">Nenhum produto controlado cadastrado.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- FORMAS DE PAGAMENTO (VALORES RECEBIDOS) -->
    <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
      <h3 class="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
        <i class="fa-solid fa-credit-card text-emerald-600"></i> Recebimentos por Forma de Pagamento (Valores Pagos)
      </h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center"><div class="text-xs font-bold text-emerald-700">Dinheiro</div><div class="font-black text-emerald-900 text-lg">${fmt(r.payMethods.dinheiro)}</div></div>
        <div class="bg-violet-50 border border-violet-100 rounded-2xl p-3 text-center"><div class="text-xs font-bold text-violet-700">PIX</div><div class="font-black text-violet-900 text-lg">${fmt(r.payMethods.pix)}</div></div>
        <div class="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center"><div class="text-xs font-bold text-blue-700">Cartão Débito</div><div class="font-black text-blue-900 text-lg">${fmt(r.payMethods.cartao_debito)}</div></div>
        <div class="bg-purple-50 border border-purple-100 rounded-2xl p-3 text-center"><div class="text-xs font-bold text-purple-700">Cartão Crédito</div><div class="font-black text-purple-900 text-lg">${fmt(r.payMethods.cartao_credito)}</div></div>
        <div class="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center"><div class="text-xs font-bold text-gray-600">Cartão (outros)</div><div class="font-black text-gray-800 text-lg">${fmt(r.payMethods.cartao)}</div></div>
      </div>
    </div>

    <!-- GARÇONS / COMISSÕES 10% (PAGO ONLY) -->
    <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
      <h3 class="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
        <i class="fa-solid fa-hand-holding-dollar text-amber-500"></i> Garçons — Vendas Efetuadas & Taxa de Serviço 10%
      </h3>
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 text-gray-600"><th class="py-2 px-3 text-left text-xs font-black">Garçom</th><th class="py-2 px-3 text-right">Vendas Pagas</th><th class="py-2 px-3 text-right">Cartão</th><th class="py-2 px-3 text-right">PIX</th><th class="py-2 px-3 text-right">Dinheiro</th><th class="py-2 px-3 text-right font-black text-emerald-600">10% Acumulado</th></tr></thead>
        <tbody>${Object.entries(r.garcomMap).map(([n, v]) => { return `<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold text-gray-800">${n}</td><td class="py-2 px-3 text-right">${fmt(v.total)}</td><td class="py-2 px-3 text-right">${fmt(v.card)}</td><td class="py-2 px-3 text-right">${fmt(v.pix)}</td><td class="py-2 px-3 text-right">${fmt(v.cash)}</td><td class="py-2 px-3 text-right font-black text-emerald-600">${fmt(v.serviceFee)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="py-4 text-center text-gray-400">Sem vendas registradas</td></tr>'}</tbody>
      </table>
    </div>

    <!-- DETALHAMENTO DE PEDIDOS PAGOS -->
    <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
      <h3 class="text-lg font-black text-gray-800 flex items-center gap-2">
        <i class="fa-solid fa-utensils text-orange-500"></i> Detalhamento de Pedidos Pagos
      </h3>
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 text-gray-600"><th class="py-2 px-3 text-left text-xs font-black">ID / Local</th><th class="py-2 px-3">Cliente / Garçom</th><th class="py-2 px-3">Forma PG</th><th class="py-2 px-3 text-right">Subtotal</th><th class="py-2 px-3 text-right text-emerald-600 font-bold">10%</th><th class="py-2 px-3 text-right text-gray-800 font-black">Total Pago</th></tr></thead>
        <tbody>${(r.paidOrdersData || []).map(o => {
          let pms = [];
          if (o.split_pix > 0) pms.push('Pix'); if (o.split_dinheiro > 0) pms.push('Dinheiro');
          if (o.split_credito > 0) pms.push('Crédito'); if (o.split_debito > 0) pms.push('Débito');
          let pgto = pms.join(', ') || String(o.payment_method || '').toUpperCase();
          let waiter = o.staff_users?.name || 'Sistema';
          return `<tr class="border-t border-gray-100"><td class="py-2 px-3"><div class="font-mono text-xs font-bold text-gray-500">#${o.order_number || o.id.substring(0, 5)}</div><div class="font-bold uppercase text-gray-800">${o.location_type || 'MESA'} ${o.location_id || ''}</div></td><td class="py-2 px-3 text-center"><div class="font-bold text-gray-700">${o.customer_name || '—'}</div><div class="text-[10px] text-gray-400 font-mono">${new Date(o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho', hour: '2-digit', minute: '2-digit' })} • ${waiter}</div></td><td class="py-2 px-3 text-center text-xs font-bold text-gray-600">${pgto}</td><td class="py-2 px-3 text-right text-gray-600">${fmt(o.total)}</td><td class="py-2 px-3 text-right text-emerald-600 font-bold">${fmt(o.service_fee)}</td><td class="py-2 px-3 text-right font-black text-gray-800">${fmt(Number(o.total) + Number(o.service_fee || 0))}</td></tr>`;
        }).join('') || '<tr><td colspan="6" class="py-4 text-center text-gray-400">Sem pedidos pagos no período</td></tr>'}</tbody>
      </table>
    </div>`;

    document.getElementById('fsActions').classList.remove('hidden');
    document.getElementById('fsCsv').onclick = () => exportCSV(r);
    document.getElementById('fsSave').onclick = () => saveClosing(r);
    
    document.getElementById('fsPrintAll').onclick = (e) => printReportElgin(r, 'all', e.target);
    document.getElementById('fsPrintResumo').onclick = (e) => printReportElgin(r, 'resumo', e.target);
    document.getElementById('fsPrintAbertas').onclick = (e) => printReportElgin(r, 'abertas', e.target);
    document.getElementById('fsPrintEstoque').onclick = (e) => printReportElgin(r, 'estoque', e.target);
    document.getElementById('fsPrintPedidos').onclick = (e) => printReportElgin(r, 'pedidos', e.target);
  }

  function exportCSV(r){
    let csv = `RELATORIO DE FECHAMENTO (${r.startDate} a ${r.endDate})\n`;
    csv += `FATURAMENTO EFETIVAMENTE RECEBIDO (PAGO)\n`;
    csv += `Cozinha;Bar;Portaria;Chales;TOTAL PAGOS\n`;
    csv += `${r.totalCozinha.toFixed(2)};${r.totalBar.toFixed(2)};${r.totalPortaria.toFixed(2)};${r.totalChalets.toFixed(2)};${r.totalEfetivoPago.toFixed(2)}\n\n`;

    csv += `COMANDAS EM ABERTO (A RECEBER)\n`;
    csv += `Total Pendente;Qtd Comandas\n`;
    csv += `${r.totalOpenOrdersAmount.toFixed(2)};${r.openOrdersData.length}\n`;
    csv += `ID;Local;Cliente;Garcom;Abertura;Valor\n`;
    (r.openOrdersData || []).forEach(o => {
      csv += `#${o.order_number || o.id.substring(0,5)};${o.location_type} ${o.location_id};${o.customer_name || ''};${o.staff_users?.name || ''};${o.created_at};${Number(o.total || 0).toFixed(2)}\n`;
    });

    csv += `\nCOMPARATIVO DE ESTOQUE\n`;
    csv += `Produto;Categoria;Estoque Inicial Estimado;Vendas no Periodo;Estoque Final Atual\n`;
    (r.stockComparison || []).forEach(p => {
      csv += `${p.name};${p.category};${p.initialStock};${p.qtySold};${p.finalStock}\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fechamento_${r.startDate}_${r.endDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function saveClosing(r){
    const { error } = await supabase.from('weekly_closings').upsert({
      week_start: r.startDate, week_end: r.endDate,
      data_snapshot: r, total_bruto: r.totalEfetivoPago,
      total_portaria: r.totalPortaria, total_restaurante: r.totalCozinha,
      total_bar: r.totalBar, total_chalets: r.totalChalets
    }, { onConflict: 'week_start,week_end' });
    alert(error ? 'Erro ao salvar: ' + error.message : 'Fechamento salvo com sucesso!');
  }

  async function printReportElgin(r, type = 'all', btnElement = null) {
    const btn = btnElement || document.getElementById('fsPrintAll');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>...';
    btn.disabled = true;

    try {
        const titleMap = {
            'all': 'FECHAMENTO DETALHADO',
            'resumo': 'RESUMO FINANCEIRO (PAGO)',
            'abertas': 'COMANDAS EM ABERTO',
            'estoque': 'COMPARATIVO ESTOQUE',
            'pedidos': 'PEDIDOS PAGOS'
        };

        const headerHtml = `
            <h2>${titleMap[type]}</h2>
            <div class="row"><b>Início:</b><span>${r.startDate}</span></div>
            <div class="row"><b>Fim:</b><span>${r.endDate}</span></div>
            <div class="row"><b>Emissão:</b><span>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Porto_Velho' })}</span></div>
        `;

        let resumoHtml = '';
        if (type === 'all' || type === 'resumo') {
            resumoHtml = `
                <h3>RECEBIMENTOS EFETIVADOS (PAGO)</h3>
                <div class="row"><span>Cozinha (Restaurante):</span><b>R$ ${r.totalCozinha.toFixed(2)}</b></div>
                <div class="row"><span>Bar (Bebidas):</span><b>R$ ${r.totalBar.toFixed(2)}</b></div>
                <div class="row"><span>Portaria:</span><b>R$ ${r.totalPortaria.toFixed(2)}</b></div>
                <div class="row"><span>Chalés (Aluguéis):</span><b>R$ ${r.totalChalets.toFixed(2)}</b></div>
                <div class="total-box"><span>TOTAL PAGO:</span><span>R$ ${r.totalEfetivoPago.toFixed(2)}</span></div>

                <h3>FORMAS DE RECEBIMENTO</h3>
                <div class="row"><span>Dinheiro:</span><b>R$ ${r.payMethods.dinheiro.toFixed(2)}</b></div>
                <div class="row"><span>PIX:</span><b>R$ ${r.payMethods.pix.toFixed(2)}</b></div>
                <div class="row"><span>Cartão Débito:</span><b>R$ ${r.payMethods.cartao_debito.toFixed(2)}</b></div>
                <div class="row"><span>Cartão Crédito:</span><b>R$ ${r.payMethods.cartao_credito.toFixed(2)}</b></div>
            `;
        }

        let abertasHtml = '';
        if (type === 'all' || type === 'abertas') {
            abertasHtml = `
                <h3>COMANDAS EM ABERTO (A RECEBER)</h3>
                <div class="row" style="font-weight: 900; font-size: 18px; margin-bottom: 8px;">
                    <span>TOTAL A RECEBER:</span><b>R$ ${r.totalOpenOrdersAmount.toFixed(2)}</b>
                </div>
                ${(r.openOrdersData || []).map(o => `
                    <div style="border-bottom: 1px dashed #666; padding-bottom: 6px; margin-bottom: 6px;">
                        <div class="row"><b style="font-size: 18px;">#${o.order_number || o.id.substring(0,5)} • ${(o.location_type || 'Mesa').toUpperCase()} ${o.location_id}</b> <b>R$ ${Number(o.total || 0).toFixed(2)}</b></div>
                        <div class="row sub"><span>Cliente: ${o.customer_name || 'Não informado'}</span> <span>Garçom: ${o.staff_users?.name || 'Sistema'}</span></div>
                    </div>
                `).join('') || '<div class="row">Nenhuma comanda em aberto.</div>'}
            `;
        }

        let estoqueHtml = '';
        if (type === 'all' || type === 'estoque') {
            estoqueHtml = `
                <h3>COMPARATIVO DE ESTOQUE</h3>
                ${(r.stockComparison || []).map(p => `
                    <div style="border-bottom: 1px dashed #666; padding-bottom: 6px; margin-bottom: 6px;">
                        <div class="row"><b style="font-size: 18px;">${p.name}</b> <span>${p.category}</span></div>
                        <div class="row sub"><span>Inicial: <b>${p.initialStock}</b> | Vendas: <b style="color:red;">-${p.qtySold}</b></span> <span>Atual: <b>${p.finalStock} un</b></span></div>
                    </div>
                `).join('') || '<div class="row">Sem dados de estoque.</div>'}
            `;
        }

        let html = `
            <html>
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: 'Inter', monospace; width: 576px; margin: 0; padding: 12px 16px 30px 16px; color: black; background: #ffffff; font-size: 18px; line-height: 1.3; overflow: hidden; }

                    h2 { text-align: center; margin: 0 0 10px 0; border-bottom: 3px solid black; padding-bottom: 8px; font-size: 28px; font-weight: 900; text-transform: uppercase; }
                    h3 { font-size: 20px; font-weight: 900; margin: 16px 0 6px 0; text-transform: uppercase; border-bottom: 1px solid black; padding-bottom: 2px; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
                    .row.sub { font-size: 16px; color: #333; }
                    .total-box { border: 3px solid black; padding: 12px; margin-top: 12px; font-size: 24px; font-weight: 900; display: flex; justify-content: space-between; border-radius: 8px; }
                </style>
            </head>
            <body>
                ${headerHtml}
                ${resumoHtml}
                ${abertasHtml}
                ${estoqueHtml}
                <div style="text-align: center; font-size: 16px; margin-top: 20px; font-weight: bold;">-- FIM DO RELATÓRIO --</div>
            </body>
            </html>
        `;
        await fetch('http://localhost:3001/print_html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html })
        });

    } catch (e) {
        console.warn('Erro impressora Elgin:', e);
        alert('Falha ao imprimir. Verifique se o Elgin Server local (porta 3001) está rodando e a impressora ligada.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
  }
}
