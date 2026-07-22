/**
 * Fechamento Semanal - Balneário Rio Preto
 */
import { supabase } from './scripts.js';

function fmt(v){return 'R$ '+Number(v||0).toFixed(2).replace('.',',')}
function getWeekRange(){
  const now=new Date(), d=now.getDay(), diff=d===0?6:d-1;
  const mon=new Date(now); mon.setDate(now.getDate()-diff); mon.setHours(0,0,0,0);
  const sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
  return {start:mon,end:sun};
}
function dateStr(d){return d.toISOString().split('T')[0]}
const DIAS=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

export async function renderFechamentoSemanal(container){
  const w=getWeekRange();
  container.innerHTML=`
  <div class="max-w-6xl mx-auto anim-fade">
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <h2 class="text-2xl font-black text-gray-800">Fechamento Semanal</h2>
      <div class="flex items-center gap-2 ml-auto">
        <input type="date" id="fsStart" class="input-sys !w-auto" value="${dateStr(w.start)}">
        <span class="text-gray-400 font-bold">→</span>
        <input type="date" id="fsEnd" class="input-sys !w-auto" value="${dateStr(w.end)}">
        <button id="fsBtnLoad" class="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition">Gerar</button>
      </div>
    </div>
    <div id="fsContent" class="space-y-6"><p class="text-gray-400 text-center py-12 font-bold">Selecione o período e clique em Gerar</p></div>
    <div id="fsActions" class="hidden flex flex-wrap gap-3 mt-6">
      <button id="fsCsv" class="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition"><i class="fa-solid fa-file-csv mr-2"></i>Exportar CSV</button>
      <button id="fsSave" class="bg-blue-600 text-white px-6 py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 transition"><i class="fa-solid fa-floppy-disk mr-2"></i>Salvar no Banco</button>
      
      <div class="flex bg-indigo-50 rounded-xl overflow-hidden shadow-lg border border-indigo-200">
        <button id="fsPrintAll" class="bg-indigo-600 text-white px-4 py-3 font-black hover:bg-indigo-700 transition border-r border-indigo-800"><i class="fa-solid fa-print mr-2"></i>Tudo</button>
        <button id="fsPrintResumo" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition border-r border-indigo-200">Resumo</button>
        <button id="fsPrintPortaria" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition border-r border-indigo-200">Portaria</button>
        <button id="fsPrintChales" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition border-r border-indigo-200">Chalés</button>
        <button id="fsPrintPedidos" class="text-indigo-800 px-4 py-3 font-bold hover:bg-indigo-100 transition">Pedidos</button>
      </div>
    </div>
  </div>`;

  let reportData=null;

  document.getElementById('fsBtnLoad').onclick=async()=>{
    const s=document.getElementById('fsStart').value,e=document.getElementById('fsEnd').value;
    if(!s||!e) return;
    reportData=await loadReport(s,e);
    renderReport(reportData);
  };

  async function loadReport(startDate,endDate){
    const [orders,orderItems,gate,bookings,funcs]=await Promise.all([
      supabase.from('orders').select('*, staff_users(name)').gte('created_at',startDate+'T00:00:00').lte('created_at',endDate+'T23:59:59').neq('status','cancelado'),
      supabase.from('order_items').select('*, orders!inner(created_at, status, staff_id)').gte('orders.created_at',startDate+'T00:00:00').lte('orders.created_at',endDate+'T23:59:59'),
      supabase.from('gate_entries').select('*').gte('created_at',startDate+'T00:00:00').lte('created_at',endDate+'T23:59:59'),
      supabase.from('bookings').select('*').gte('checkin_date',startDate).lte('checkin_date',endDate),
      supabase.from('funcionarios').select('*').eq('is_active',true)
    ]);

    const ordersData=orders.data||[], itemsData=orderItems.data||[], gateData=gate.data||[], bookingsData=bookings.data||[], funcsData=funcs.data||[];

    // Group by day using ORDER ITEMS for accurate bar/cozinha split
    const dayMap={};
    ordersData.forEach(o=>{
      const day=new Date(o.created_at).toLocaleDateString('pt-BR',{ timeZone: 'America/Porto_Velho', weekday:'long'});
      const dayKey=day.charAt(0).toUpperCase()+day.slice(1);
      if(!dayMap[dayKey]) dayMap[dayKey]={cozinha:0,bar:0,orders:[],cozinha_items:[],bar_items:[]};
      dayMap[dayKey].orders.push(o);
    });

    // Use order_items to split cozinha vs bar revenue accurately
    itemsData.forEach(item=>{
      const orderDate=item.orders?.created_at;
      if(!orderDate) return;
      const day=new Date(orderDate).toLocaleDateString('pt-BR',{ timeZone: 'America/Porto_Velho', weekday:'long'});
      const dayKey=day.charAt(0).toUpperCase()+day.slice(1);
      if(!dayMap[dayKey]) dayMap[dayKey]={cozinha:0,bar:0,orders:[],cozinha_items:[],bar_items:[]};
      const dest=(item.destination||'').toLowerCase();
      const itemTotal=Number(item.quantity||0)*Number(item.unit_price||0);
      if(dest==='cozinha'){
        dayMap[dayKey].cozinha+=itemTotal;
        dayMap[dayKey].cozinha_items.push(item);
      } else {
        dayMap[dayKey].bar+=itemTotal;
        dayMap[dayKey].bar_items.push(item);
      }
    });

    // Group gate entries by day
    const gateDayMap={};
    let totalPortaria=0;
    gateData.forEach(g=>{
      const day=new Date(g.created_at).toLocaleDateString('pt-BR',{ timeZone: 'America/Porto_Velho', weekday:'long'});
      const dayKey=day.charAt(0).toUpperCase()+day.slice(1);
      if(!gateDayMap[dayKey]) gateDayMap[dayKey]={total:0,entries:[]};
      const val=Number(g.amount_paid||g.total_amount||0);
      gateDayMap[dayKey].total+=val;
      gateDayMap[dayKey].entries.push(g);
      totalPortaria+=val;
    });

    // Payment method totals
    const payMethods={dinheiro:0,pix:0,cartao_debito:0,cartao_credito:0,cartao:0};
    ordersData.forEach(o=>{
      if (Number(o.split_pix||0) > 0 || Number(o.split_dinheiro||0) > 0 || Number(o.split_credito||0) > 0 || Number(o.split_debito||0) > 0) {
        payMethods.pix+=Number(o.split_pix||0);
        payMethods.dinheiro+=Number(o.split_dinheiro||0);
        payMethods.cartao_credito+=Number(o.split_credito||0);
        payMethods.cartao_debito+=Number(o.split_debito||0);
      } else {
        const pm=(o.payment_method||'').toLowerCase();
        if(pm.includes('dinheiro')) payMethods.dinheiro+=Number(o.total||0);
        else if(pm.includes('pix')) payMethods.pix+=Number(o.total||0);
        else if(pm.includes('deb')) payMethods.cartao_debito+=Number(o.total||0);
        else if(pm.includes('cred')) payMethods.cartao_credito+=Number(o.total||0);
        else if(pm.includes('cart')) payMethods.cartao+=Number(o.total||0);
      }
    });

    // Garcom tips calculation (sum of service_fee collected at checkout)
    const garcomMap={};
    ordersData.forEach(o=>{
      const waiter=(o.staff_users&&o.staff_users.name)||'Desconhecido';
      if(!garcomMap[waiter]) garcomMap[waiter]={total:0,card:0,pix:0,cash:0,serviceFee:0};
      const t=Number(o.total||0), pm=(o.payment_method||'').toLowerCase();
      garcomMap[waiter].total+=t;
      garcomMap[waiter].serviceFee+=Number(o.service_fee||0);
      
      const spPix = Number(o.split_pix||0);
      const spDin = Number(o.split_dinheiro||0);
      const spCre = Number(o.split_credito||0);
      const spDeb = Number(o.split_debito||0);
      
      if (spPix > 0 || spDin > 0 || spCre > 0 || spDeb > 0) {
        garcomMap[waiter].pix += spPix;
        garcomMap[waiter].cash += spDin;
        garcomMap[waiter].card += (spCre + spDeb);
      } else {
        // Fallback for older orders without split_* columns
        if(pm.includes('cart')||pm.includes('deb')||pm.includes('cred')) garcomMap[waiter].card+=t;
        else if(pm.includes('pix')) garcomMap[waiter].pix+=t;
        else garcomMap[waiter].cash+=t;
      }
    });

    const totalCozinha=Object.values(dayMap).reduce((s,d)=>s+d.cozinha,0);
    const totalBar=Object.values(dayMap).reduce((s,d)=>s+d.bar,0);
    const totalChalets=bookingsData.reduce((s,b)=>s+Number(b.total_price||0),0);

    return {
      startDate,endDate,dayMap,gateDayMap,payMethods,garcomMap,
      totalCozinha,totalBar,totalPortaria,totalChalets,
      totalBruto:totalCozinha+totalBar+totalPortaria+totalChalets,
      bookingsData,funcsData,ordersData,gateData
    };
  }

  function renderReport(r){
    const c=document.getElementById('fsContent');
    const days=Object.keys(r.dayMap);

    c.innerHTML=`
    <!-- RESUMO GERAL -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-chart-pie text-blue-500 mr-2"></i>Resumo Geral — ${r.startDate} a ${r.endDate}</h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <div class="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 text-center">
          <div class="text-xs font-black text-orange-600 uppercase mb-1">Cozinha</div>
          <div class="text-xl font-black text-orange-800">${fmt(r.totalCozinha)}</div>
        </div>
        <div class="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 text-center">
          <div class="text-xs font-black text-amber-600 uppercase mb-1">Bar</div>
          <div class="text-xl font-black text-amber-800">${fmt(r.totalBar)}</div>
        </div>
        <div class="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl p-4 text-center">
          <div class="text-xs font-black text-cyan-600 uppercase mb-1">Portaria</div>
          <div class="text-xl font-black text-cyan-800">${fmt(r.totalPortaria)}</div>
        </div>
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 text-center">
          <div class="text-xs font-black text-emerald-600 uppercase mb-1">Chalés</div>
          <div class="text-xl font-black text-emerald-800">${fmt(r.totalChalets)}</div>
        </div>
        <div class="bg-gradient-to-br from-purple-100 to-indigo-200 rounded-xl p-4 text-center">
          <div class="text-xs font-black text-indigo-600 uppercase mb-1">Total Bruto</div>
          <div class="text-2xl font-black text-indigo-800">${fmt(r.totalBruto)}</div>
        </div>
      </div>
      <table class="w-full text-sm border-collapse">
        <thead><tr class="bg-gray-50"><th class="py-2 px-3 text-left text-xs font-black text-gray-500">Dia</th><th class="py-2 px-3 text-right text-xs font-black text-gray-500">Cozinha</th><th class="py-2 px-3 text-right text-xs font-black text-gray-500">Bar</th><th class="py-2 px-3 text-right text-xs font-black text-gray-500">Total</th></tr></thead>
        <tbody>${days.map(d=>{const v=r.dayMap[d]; return `<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold">${d}</td><td class="py-2 px-3 text-right">${fmt(v.cozinha)}</td><td class="py-2 px-3 text-right">${fmt(v.bar)}</td><td class="py-2 px-3 text-right font-black">${fmt(v.cozinha+v.bar)}</td></tr>`}).join('')}</tbody>
      </table>
    </div>

    <!-- FORMAS DE PAGAMENTO -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-credit-card text-green-500 mr-2"></i>Formas de Pagamento</h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="bg-green-50 rounded-xl p-3 text-center"><div class="text-xs font-bold text-green-600">Dinheiro</div><div class="font-black text-green-800">${fmt(r.payMethods.dinheiro)}</div></div>
        <div class="bg-violet-50 rounded-xl p-3 text-center"><div class="text-xs font-bold text-violet-600">PIX</div><div class="font-black text-violet-800">${fmt(r.payMethods.pix)}</div></div>
        <div class="bg-blue-50 rounded-xl p-3 text-center"><div class="text-xs font-bold text-blue-600">Débito</div><div class="font-black text-blue-800">${fmt(r.payMethods.cartao_debito)}</div></div>
        <div class="bg-red-50 rounded-xl p-3 text-center"><div class="text-xs font-bold text-red-600">Crédito</div><div class="font-black text-red-800">${fmt(r.payMethods.cartao_credito)}</div></div>
        <div class="bg-gray-50 rounded-xl p-3 text-center"><div class="text-xs font-bold text-gray-600">Cartão (outros)</div><div class="font-black text-gray-800">${fmt(r.payMethods.cartao)}</div></div>
      </div>
    </div>

    <!-- GARÇONS / TIPS -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-hand-holding-dollar text-yellow-500 mr-2"></i>Garçons — Taxa de Serviço (10%)</h3>
      <table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="py-2 px-3 text-left text-xs font-black text-gray-500">Garçom</th><th class="py-2 px-3 text-right">Total Vendas</th><th class="py-2 px-3 text-right">Cartão</th><th class="py-2 px-3 text-right">PIX</th><th class="py-2 px-3 text-right">Dinheiro</th><th class="py-2 px-3 text-right font-black text-emerald-600">10% Acumulado</th></tr></thead>
      <tbody>${Object.entries(r.garcomMap).map(([n,v])=>{return `<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold">${n}</td><td class="py-2 px-3 text-right">${fmt(v.total)}</td><td class="py-2 px-3 text-right">${fmt(v.card)}</td><td class="py-2 px-3 text-right">${fmt(v.pix)}</td><td class="py-2 px-3 text-right">${fmt(v.cash)}</td><td class="py-2 px-3 text-right font-black text-emerald-600">${fmt(v.serviceFee)}</td></tr>`}).join('')||'<tr><td colspan="6" class="py-4 text-center text-gray-400">Sem dados</td></tr>'}</tbody></table>
    </div>

    <!-- FUNCIONÁRIOS/FREELANCERS -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-users text-indigo-500 mr-2"></i>Funcionários / Freelancers</h3>
      <table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="py-2 px-3 text-left text-xs font-black text-gray-500">Nome</th><th class="py-2 px-3">Cargo</th><th class="py-2 px-3 text-right">Diária</th></tr></thead>
      <tbody>${(r.funcsData||[]).map(f=>`<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold">${f.nome}</td><td class="py-2 px-3 text-center"><span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">${f.cargo||'freelancer'}</span></td><td class="py-2 px-3 text-right font-black text-emerald-600">${fmt(f.diaria)}</td></tr>`).join('')||'<tr><td colspan="3" class="py-4 text-center text-gray-400">Nenhum funcionário cadastrado</td></tr>'}</tbody></table>
    </div>

    <!-- CHALÉS -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-house text-teal-500 mr-2"></i>Chalés</h3>
      <table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="py-2 px-3 text-left text-xs font-black text-gray-500">Hóspede</th><th class="py-2 px-3">Check-in</th><th class="py-2 px-3">Check-out</th><th class="py-2 px-3 text-right">Total</th><th class="py-2 px-3">Status</th></tr></thead>
      <tbody>${(r.bookingsData||[]).map(b=>`<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold">${b.guest_name||b.name||'—'}</td><td class="py-2 px-3 text-center text-xs">${b.checkin_date||'—'}</td><td class="py-2 px-3 text-center text-xs">${b.checkout_date||'—'}</td><td class="py-2 px-3 text-right font-black">${fmt(b.total_price)}</td><td class="py-2 px-3 text-center"><span class="text-xs font-bold ${b.status==='confirmed'?'text-green-600':'text-yellow-600'}">${b.status||'—'}</span></td></tr>`).join('')||'<tr><td colspan="5" class="py-4 text-center text-gray-400">Sem reservas no período</td></tr>'}</tbody></table>
    </div>

    <!-- PORTARIA -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-ticket text-cyan-500 mr-2"></i>Entradas da Portaria</h3>
      <table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="py-2 px-3 text-left text-xs font-black text-gray-500">Nome / Placa</th><th class="py-2 px-3">Tipo</th><th class="py-2 px-3">Pagamento</th><th class="py-2 px-3">Data</th><th class="py-2 px-3 text-right">Valor</th></tr></thead>
      <tbody>${(r.gateData||[]).map(g=>`<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold">${g.visitor_name||'—'}</td><td class="py-2 px-3 text-center"><span class="bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded text-xs font-bold uppercase">${g.entry_type||'—'}</span></td><td class="py-2 px-3 text-center text-xs font-bold uppercase text-gray-600">${g.payment_method||'—'}</td><td class="py-2 px-3 text-center text-xs text-gray-500">${new Date(g.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Porto_Velho'})}</td><td class="py-2 px-3 text-right font-black text-emerald-600">${fmt(g.amount_paid||g.total_amount)}</td></tr>`).join('')||'<tr><td colspan="5" class="py-4 text-center text-gray-400">Sem entradas no período</td></tr>'}</tbody></table>
    </div>

    <!-- PEDIDOS (RESTAURANTE/BAR) -->
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-utensils text-orange-500 mr-2"></i>Detalhamento de Pedidos</h3>
      <table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="py-2 px-3 text-left text-xs font-black text-gray-500">ID / Local</th><th class="py-2 px-3">Cliente / Hora</th><th class="py-2 px-3">Pagamento</th><th class="py-2 px-3 text-right">Subtotal</th><th class="py-2 px-3 text-right text-emerald-600 font-bold">10%</th><th class="py-2 px-3 text-right text-gray-800 font-black">Total</th></tr></thead>
      <tbody>${(r.ordersData||[]).map(o=>{
          let pms = [];
          if(o.split_pix>0) pms.push('Pix'); if(o.split_dinheiro>0) pms.push('Dinheiro');
          if(o.split_credito>0) pms.push('Crédito'); if(o.split_debito>0) pms.push('Débito');
          let pgto = pms.join(', ') || String(o.payment_method||'').toUpperCase();
          let waiter = o.staff_users?.name || 'Sistema';
          return `<tr class="border-t border-gray-100"><td class="py-2 px-3"><div class="font-mono text-xs font-bold text-gray-500">#${o.order_number||o.id.substring(0,5)}</div><div class="font-bold uppercase text-gray-800">${o.location_type||'MESA'} ${o.location_id||''}</div></td><td class="py-2 px-3 text-center"><div class="font-bold text-gray-700">${o.customer_name||'—'}</div><div class="text-[10px] text-gray-400 font-mono">${new Date(o.created_at).toLocaleTimeString('pt-BR',{timeZone:'America/Porto_Velho',hour:'2-digit',minute:'2-digit'})} • ${waiter}</div></td><td class="py-2 px-3 text-center text-xs font-bold text-gray-600">${pgto}</td><td class="py-2 px-3 text-right text-gray-600">${fmt(o.total)}</td><td class="py-2 px-3 text-right text-emerald-600 font-bold">${fmt(o.service_fee)}</td><td class="py-2 px-3 text-right font-black text-gray-800">${fmt(Number(o.total)+Number(o.service_fee||0))}</td></tr>`;
      }).join('')||'<tr><td colspan="6" class="py-4 text-center text-gray-400">Sem pedidos no período</td></tr>'}</tbody></table>
    </div>`;

    document.getElementById('fsActions').classList.remove('hidden');
    document.getElementById('fsCsv').onclick=()=>exportCSV(r);
    document.getElementById('fsSave').onclick=()=>saveClosing(r);
    
    document.getElementById('fsPrintAll').onclick=(e)=>printReportElgin(r, 'all', e.target);
    document.getElementById('fsPrintResumo').onclick=(e)=>printReportElgin(r, 'resumo', e.target);
    document.getElementById('fsPrintPortaria').onclick=(e)=>printReportElgin(r, 'portaria', e.target);
    document.getElementById('fsPrintChales').onclick=(e)=>printReportElgin(r, 'chales', e.target);
    document.getElementById('fsPrintPedidos').onclick=(e)=>printReportElgin(r, 'pedidos', e.target);
  }

  function exportCSV(r){
    let csv=`FECHAMENTO SEMANAL;${r.startDate} a ${r.endDate}\n\n`;
    csv+=`RESUMO GERAL\nSetor;Total\nCozinha;${r.totalCozinha.toFixed(2)}\nBar;${r.totalBar.toFixed(2)}\nPortaria;${r.totalPortaria.toFixed(2)}\nChalés;${r.totalChalets.toFixed(2)}\nTOTAL BRUTO;${r.totalBruto.toFixed(2)}\n\n`;

    csv+=`VENDAS POR DIA\nDia;Cozinha;Bar;Total\n`;
    Object.entries(r.dayMap).forEach(([d,v])=>{csv+=`${d};${v.cozinha.toFixed(2)};${v.bar.toFixed(2)};${(v.cozinha+v.bar).toFixed(2)}\n`});

    csv+=`\nFORMAS DE PAGAMENTO\nForma;Total\nDinheiro;${r.payMethods.dinheiro.toFixed(2)}\nPIX;${r.payMethods.pix.toFixed(2)}\nCartão Débito;${r.payMethods.cartao_debito.toFixed(2)}\nCartão Crédito;${r.payMethods.cartao_credito.toFixed(2)}\n\n`;

    csv+=`GARÇONS\nNome;Total Vendas;Cartão;PIX;Dinheiro;10% Acumulado\n`;
    Object.entries(r.garcomMap).forEach(([n,v])=>{csv+=`${n};${v.total.toFixed(2)};${v.card.toFixed(2)};${v.pix.toFixed(2)};${v.cash.toFixed(2)};${v.serviceFee.toFixed(2)}\n`});

    csv+=`\nFUNCIONÁRIOS\nNome;Cargo;Diária\n`;
    (r.funcsData||[]).forEach(f=>{csv+=`${f.nome};${f.cargo};${Number(f.diaria||0).toFixed(2)}\n`});

    csv+=`\nCHALÉS\nHóspede;Check-in;Check-out;Total;Status\n`;
    (r.bookingsData||[]).forEach(b=>{csv+=`${b.guest_name||b.name||''};${b.checkin_date||''};${b.checkout_date||''};${Number(b.total_price||0).toFixed(2)};${b.status||''}\n`});

    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`fechamento_${r.startDate}_${r.endDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function saveClosing(r){
    const {error}=await supabase.from('weekly_closings').upsert({
      week_start:r.startDate, week_end:r.endDate,
      data_snapshot:r, total_bruto:r.totalBruto,
      total_portaria:r.totalPortaria, total_restaurante:r.totalCozinha,
      total_bar:r.totalBar, total_chalets:r.totalChalets
    },{onConflict:'week_start,week_end'});
    alert(error?'Erro ao salvar: '+error.message:'Fechamento salvo com sucesso!');
  }

  async function printReportElgin(r, type = 'all', btnElement = null) {
    const btn = btnElement || document.getElementById('fsPrintAll') || document.getElementById('fsPrint');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>...';
    btn.disabled = true;

    try {
        let htmlContent = '';
        const titleMap = {
            'all': 'FECHAMENTO DETALHADO',
            'resumo': 'RESUMO FINANCEIRO',
            'portaria': 'ENTRADAS DA PORTARIA',
            'chales': 'RESERVAS DE CHALÉS',
            'pedidos': 'DETALHAMENTO DE PEDIDOS'
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
                <h3>RESUMO FINANCEIRO</h3>
                <div class="row"><span>Cozinha (Restaurante):</span><b>R$ ${r.totalCozinha.toFixed(2)}</b></div>
                <div class="row"><span>Bar (Bebidas):</span><b>R$ ${r.totalBar.toFixed(2)}</b></div>
                <div class="row"><span>Portaria:</span><b>R$ ${r.totalPortaria.toFixed(2)}</b></div>
                <div class="row"><span>Chalés (Aluguéis):</span><b>R$ ${r.totalChalets.toFixed(2)}</b></div>
                <div class="total-box"><span>TOTAL BRUTO:</span><span>R$ ${r.totalBruto.toFixed(2)}</span></div>

                <h3>RECEBIMENTOS POR TIPO</h3>
                <div class="row"><span>Dinheiro:</span><b>R$ ${r.payMethods.dinheiro.toFixed(2)}</b></div>
                <div class="row"><span>PIX:</span><b>R$ ${r.payMethods.pix.toFixed(2)}</b></div>
                <div class="row"><span>Cartão Débito:</span><b>R$ ${r.payMethods.cartao_debito.toFixed(2)}</b></div>
                <div class="row"><span>Cartão Crédito:</span><b>R$ ${r.payMethods.cartao_credito.toFixed(2)}</b></div>
                
                <h3>GARÇONS E COMISSÕES</h3>
                ${Object.entries(r.garcomMap).map(([n,v]) => `
                    <div style="border-bottom: 1px dashed #666; padding-bottom: 6px; margin-bottom: 6px;">
                        <div class="row" style="font-weight: 900; font-size: 20px;"><span>${n.substring(0,20)}</span></div>
                        <div class="row sub"><span>Vendas Brutas:</span><span>R$ ${v.total.toFixed(2)}</span></div>
                        <div class="row sub"><span>Pag. Cartão:</span><span>R$ ${v.card.toFixed(2)}</span></div>
                        <div class="row sub"><span>Pag. PIX:</span><span>R$ ${v.pix.toFixed(2)}</span></div>
                        <div class="row sub"><span>Pag. Dinheiro:</span><span>R$ ${v.cash.toFixed(2)}</span></div>
                        <div class="row sub" style="font-weight: 800; font-size: 18px; margin-top: 4px;"><span>10% a Pagar:</span><span>R$ ${v.serviceFee.toFixed(2)}</span></div>
                    </div>
                `).join('') || '<div class="row">Sem dados.</div>'}

                <h3>FUNCIONÁRIOS E DIÁRIAS</h3>
                ${(r.funcsData||[]).map(f => `
                    <div class="row" style="border-bottom: 1px dashed #666; padding-bottom: 4px; margin-bottom: 4px;">
                        <div><b style="font-size: 18px;">${f.nome}</b><br><span style="font-size: 14px;">${f.cargo||'freelancer'}</span></div>
                        <b style="font-size: 18px;">R$ ${Number(f.diaria||0).toFixed(2)}</b>
                    </div>
                `).join('') || '<div class="row">Nenhum funcionário.</div>'}
            `;
        }

        let portariaHtml = '';
        if (type === 'all' || type === 'portaria') {
            portariaHtml = `
                <h3>ENTRADAS DA PORTARIA</h3>
                ${(r.gateData||[]).map(g => `
                    <div style="border-bottom: 1px dashed #666; padding-bottom: 6px; margin-bottom: 6px;">
                        <div class="row"><b style="font-size: 18px;">${g.visitor_name||'Visitante'}</b> <b>R$ ${Number(g.amount_paid||g.total_amount||0).toFixed(2)}</b></div>
                        <div class="row sub"><span>${g.entry_type||'—'} • ${g.payment_method||'—'}</span> <span>${new Date(g.created_at).toLocaleTimeString('pt-BR',{timeZone:'America/Porto_Velho',hour:'2-digit',minute:'2-digit'})}</span></div>
                    </div>
                `).join('') || '<div class="row">Sem entradas registradas.</div>'}
            `;
        }

        let chalesHtml = '';
        if (type === 'all' || type === 'chales') {
            chalesHtml = `
                <h3>RESERVAS DE CHALÉS</h3>
                ${(r.bookingsData||[]).map(b => `
                    <div style="border-bottom: 1px dashed #666; padding-bottom: 6px; margin-bottom: 6px;">
                        <div class="row"><b style="font-size: 18px;">${b.guest_name||b.name||'Hóspede'}</b> <b>R$ ${Number(b.total_price||0).toFixed(2)}</b></div>
                        <div class="row sub"><span>${b.checkin_date} a ${b.checkout_date}</span> <span>${b.status==='confirmed'?'CONFIRMADO':'PENDENTE'}</span></div>
                    </div>
                `).join('') || '<div class="row">Sem reservas registradas.</div>'}
            `;
        }

        let pedidosHtml = '';
        if (type === 'all' || type === 'pedidos') {
            pedidosHtml = `
                <h3>DETALHAMENTO DE PEDIDOS</h3>
                ${r.ordersData.map(o => {
                    let pgto = [
                        o.split_pix > 0 ? 'Pix' : '', 
                        o.split_dinheiro > 0 ? 'Dinheiro' : '', 
                        o.split_credito > 0 ? 'Crédito' : '', 
                        o.split_debito > 0 ? 'Débito' : ''
                    ].filter(Boolean).join(', ') || String(o.payment_method).toUpperCase();
                    return `
                    <div class="order-item">
                        <div class="order-header">
                            <span>#${o.order_number || o.id.substring(0,5)} • ${(o.location_type || 'Mesa').toUpperCase()} ${o.location_id}</span>
                            <span>R$ ${(Number(o.total)+Number(o.service_fee||0)).toFixed(2)}</span>
                        </div>
                        <div class="order-meta">Cliente: ${o.customer_name || 'Não informado'}</div>
                        <div class="order-meta">Abertura: ${new Date(o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho', hour:'2-digit', minute:'2-digit'})} • Garçom: ${o.staff_users?.name || 'Sistema'}</div>
                        <div class="order-meta">
                            Pago via: ${pgto}
                            ${ o.service_fee > 0 ? `(+ 10% R$ ${Number(o.service_fee).toFixed(2)})` : '' }
                        </div>
                    </div>`;
                }).join('') || '<div>Sem pedidos.</div>'}
            `;
        }

        let html = `
            <html>
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: 'Inter', monospace; width: 576px; margin: 0; padding: 12px 16px 20px 16px; color: black; background: white; font-size: 18px; line-height: 1.3; }
                    h2 { text-align: center; margin: 0 0 10px 0; border-bottom: 3px solid black; padding-bottom: 8px; font-size: 28px; font-weight: 900; text-transform: uppercase; }
                    h3 { font-size: 20px; font-weight: 900; margin: 16px 0 6px 0; text-transform: uppercase; border-bottom: 1px solid black; padding-bottom: 2px; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
                    .row.sub { font-size: 16px; color: #333; }
                    .total-box { border: 3px solid black; padding: 12px; margin-top: 12px; font-size: 24px; font-weight: 900; display: flex; justify-content: space-between; border-radius: 8px; }
                    
                    .order-item { border-bottom: 1px dashed #666; padding: 8px 0; font-size: 16px; }
                    .order-header { display: flex; justify-content: space-between; font-weight: 800; font-size: 18px; }
                    .order-meta { font-size: 14px; color: #444; }
                </style>
            </head>
            <body>
                ${headerHtml}
                ${resumoHtml}
                ${portariaHtml}
                ${chalesHtml}
                ${pedidosHtml}
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
