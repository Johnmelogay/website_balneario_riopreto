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
    <div id="fsActions" class="hidden flex gap-3 mt-6">
      <button id="fsCsv" class="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition"><i class="fa-solid fa-file-csv mr-2"></i>Exportar CSV</button>
      <button id="fsSave" class="bg-blue-600 text-white px-6 py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 transition"><i class="fa-solid fa-floppy-disk mr-2"></i>Salvar no Banco</button>
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
    const [orders,gate,bookings,funcs]=await Promise.all([
      supabase.from('orders').select('*, staff_users(name)').gte('created_at',startDate+'T00:00:00').lte('created_at',endDate+'T23:59:59').eq('status','delivered'),
      supabase.from('gate_entries').select('*').gte('created_at',startDate+'T00:00:00').lte('created_at',endDate+'T23:59:59'),
      supabase.from('bookings').select('*').gte('check_in',startDate).lte('check_in',endDate),
      supabase.from('funcionarios').select('*').eq('is_active',true)
    ]);

    const ordersData=orders.data||[], gateData=gate.data||[], bookingsData=bookings.data||[], funcsData=funcs.data||[];

    // Group orders by day and destination
    const dayMap={};
    ordersData.forEach(o=>{
      const day=new Date(o.created_at).toLocaleDateString('pt-BR',{weekday:'long'});
      const dayKey=day.charAt(0).toUpperCase()+day.slice(1);
      if(!dayMap[dayKey]) dayMap[dayKey]={cozinha:0,bar:0,orders:[],cozinha_items:[],bar_items:[]};
      const dest=(o.destination||'').toLowerCase();
      const total=Number(o.total||0);
      if(dest.includes('cozinha')||dest.includes('kitchen')){
        dayMap[dayKey].cozinha+=total;
        dayMap[dayKey].cozinha_items.push(o);
      } else {
        dayMap[dayKey].bar+=total;
        dayMap[dayKey].bar_items.push(o);
      }
      dayMap[dayKey].orders.push(o);
    });

    // Group gate entries by day
    const gateDayMap={};
    let totalPortaria=0;
    gateData.forEach(g=>{
      const day=new Date(g.created_at).toLocaleDateString('pt-BR',{weekday:'long'});
      const dayKey=day.charAt(0).toUpperCase()+day.slice(1);
      if(!gateDayMap[dayKey]) gateDayMap[dayKey]={total:0,entries:[]};
      const val=Number(g.amount_paid||g.total_amount||0);
      gateDayMap[dayKey].total+=val;
      gateDayMap[dayKey].entries.push(g);
      totalPortaria+=val;
    });

    // Payment method totals from orders
    const payMethods={dinheiro:0,pix:0,cartao_debito:0,cartao_credito:0,cartao:0};
    ordersData.forEach(o=>{
      const pm=(o.payment_method||'').toLowerCase();
      if(pm.includes('dinheiro')) payMethods.dinheiro+=Number(o.total||0);
      else if(pm.includes('pix')) payMethods.pix+=Number(o.total||0);
      else if(pm.includes('deb')) payMethods.cartao_debito+=Number(o.total||0);
      else if(pm.includes('cred')) payMethods.cartao_credito+=Number(o.total||0);
      else if(pm.includes('cart')) payMethods.cartao+=Number(o.total||0);
    });

    // Garcom tips calculation (total sales - card - pix = tip base for 20%)
    const garcomMap={};
    ordersData.forEach(o=>{
      const waiter=(o.staff_users&&o.staff_users.name)||'Desconhecido';
      if(!garcomMap[waiter]) garcomMap[waiter]={total:0,card:0,pix:0,cash:0};
      const t=Number(o.total||0), pm=(o.payment_method||'').toLowerCase();
      garcomMap[waiter].total+=t;
      if(pm.includes('cart')||pm.includes('deb')||pm.includes('cred')) garcomMap[waiter].card+=t;
      else if(pm.includes('pix')) garcomMap[waiter].pix+=t;
      else garcomMap[waiter].cash+=t;
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
      <h3 class="text-lg font-black text-gray-800 mb-4"><i class="fa-solid fa-hand-holding-dollar text-yellow-500 mr-2"></i>Garçons — Gorjetas (20%)</h3>
      <table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="py-2 px-3 text-left text-xs font-black text-gray-500">Garçom</th><th class="py-2 px-3 text-right">Total Vendas</th><th class="py-2 px-3 text-right">Cartão</th><th class="py-2 px-3 text-right">PIX</th><th class="py-2 px-3 text-right">Dinheiro</th><th class="py-2 px-3 text-right font-black text-emerald-600">Gorjeta (20%)</th></tr></thead>
      <tbody>${Object.entries(r.garcomMap).map(([n,v])=>{const tip=v.total*0.2; return `<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold">${n}</td><td class="py-2 px-3 text-right">${fmt(v.total)}</td><td class="py-2 px-3 text-right">${fmt(v.card)}</td><td class="py-2 px-3 text-right">${fmt(v.pix)}</td><td class="py-2 px-3 text-right">${fmt(v.cash)}</td><td class="py-2 px-3 text-right font-black text-emerald-600">${fmt(tip)}</td></tr>`}).join('')||'<tr><td colspan="6" class="py-4 text-center text-gray-400">Sem dados</td></tr>'}</tbody></table>
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
      <tbody>${(r.bookingsData||[]).map(b=>`<tr class="border-t border-gray-100"><td class="py-2 px-3 font-bold">${b.guest_name||b.name||'—'}</td><td class="py-2 px-3 text-center text-xs">${b.check_in||'—'}</td><td class="py-2 px-3 text-center text-xs">${b.check_out||'—'}</td><td class="py-2 px-3 text-right font-black">${fmt(b.total_price)}</td><td class="py-2 px-3 text-center"><span class="text-xs font-bold ${b.status==='confirmed'?'text-green-600':'text-yellow-600'}">${b.status||'—'}</span></td></tr>`).join('')||'<tr><td colspan="5" class="py-4 text-center text-gray-400">Sem reservas no período</td></tr>'}</tbody></table>
    </div>`;

    document.getElementById('fsActions').classList.remove('hidden');
    document.getElementById('fsCsv').onclick=()=>exportCSV(r);
    document.getElementById('fsSave').onclick=()=>saveClosing(r);
  }

  function exportCSV(r){
    let csv=`FECHAMENTO SEMANAL;${r.startDate} a ${r.endDate}\n\n`;
    csv+=`RESUMO GERAL\nSetor;Total\nCozinha;${r.totalCozinha.toFixed(2)}\nBar;${r.totalBar.toFixed(2)}\nPortaria;${r.totalPortaria.toFixed(2)}\nChalés;${r.totalChalets.toFixed(2)}\nTOTAL BRUTO;${r.totalBruto.toFixed(2)}\n\n`;

    csv+=`VENDAS POR DIA\nDia;Cozinha;Bar;Total\n`;
    Object.entries(r.dayMap).forEach(([d,v])=>{csv+=`${d};${v.cozinha.toFixed(2)};${v.bar.toFixed(2)};${(v.cozinha+v.bar).toFixed(2)}\n`});

    csv+=`\nFORMAS DE PAGAMENTO\nForma;Total\nDinheiro;${r.payMethods.dinheiro.toFixed(2)}\nPIX;${r.payMethods.pix.toFixed(2)}\nCartão Débito;${r.payMethods.cartao_debito.toFixed(2)}\nCartão Crédito;${r.payMethods.cartao_credito.toFixed(2)}\n\n`;

    csv+=`GARÇONS\nNome;Total Vendas;Cartão;PIX;Dinheiro;Gorjeta 20%\n`;
    Object.entries(r.garcomMap).forEach(([n,v])=>{csv+=`${n};${v.total.toFixed(2)};${v.card.toFixed(2)};${v.pix.toFixed(2)};${v.cash.toFixed(2)};${(v.total*0.2).toFixed(2)}\n`});

    csv+=`\nFUNCIONÁRIOS\nNome;Cargo;Diária\n`;
    (r.funcsData||[]).forEach(f=>{csv+=`${f.nome};${f.cargo};${Number(f.diaria||0).toFixed(2)}\n`});

    csv+=`\nCHALÉS\nHóspede;Check-in;Check-out;Total;Status\n`;
    (r.bookingsData||[]).forEach(b=>{csv+=`${b.guest_name||b.name||''};${b.check_in||''};${b.check_out||''};${Number(b.total_price||0).toFixed(2)};${b.status||''}\n`});

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
}
