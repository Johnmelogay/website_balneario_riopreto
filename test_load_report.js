import { supabase } from './scripts.js';
import fs from 'fs';

async function test() {
    const startDate = '2026-07-20';
    const endDate = '2026-07-26';
    console.log('Testing loadReport...');
    try {
        const [ordersRes, orderItemsRes, gateRes, bookingsRes, funcsRes, prodsRes] = await Promise.all([
          supabase.from('orders').select('*, staff_users(name)').gte('created_at', startDate + 'T00:00:00').lte('created_at', endDate + 'T23:59:59').neq('status', 'cancelado'),
          supabase.from('order_items').select('*, orders!inner(created_at, status, staff_id, payment_status)').gte('orders.created_at', startDate + 'T00:00:00').lte('orders.created_at', endDate + 'T23:59:59'),
          supabase.from('gate_entries').select('*').gte('created_at', startDate + 'T00:00:00').lte('created_at', endDate + 'T23:59:59'),
          supabase.from('bookings').select('*').gte('checkin_date', startDate).lte('checkin_date', endDate),
          supabase.from('funcionarios').select('*').eq('is_active', true),
          supabase.from('products').select('*, categories(name)').order('name')
        ]);
        
        console.log('Queries done.');
        if (ordersRes.error) console.log('ordersRes Error:', ordersRes.error);
        if (orderItemsRes.error) console.log('orderItemsRes Error:', orderItemsRes.error);
        if (gateRes.error) console.log('gateRes Error:', gateRes.error);
        if (bookingsRes.error) console.log('bookingsRes Error:', bookingsRes.error);
        if (funcsRes.error) console.log('funcsRes Error:', funcsRes.error);
        if (prodsRes.error) console.log('prodsRes Error:', prodsRes.error);

        let initialStockMap = {};
        const { data: weekSnapshots, error: snapErr1 } = await supabase
            .from('audit_logs')
            .select('details, created_at')
            .eq('action_type', 'STOCK_SNAPSHOT')
            .gte('created_at', startDate + 'T00:00:00')
            .lte('created_at', endDate + 'T23:59:59')
            .order('created_at', { ascending: true }) // Earliest in week
            .limit(1);

        if (snapErr1) console.log('snapErr1:', snapErr1);

        if (weekSnapshots && weekSnapshots.length > 0) {
            (weekSnapshots[0].details?.snapshot || []).forEach(s => initialStockMap[s.id] = s.qty);
        }
        
        console.log('Success! No crash.');
    } catch(e) {
        console.error('CRASH!', e);
    }
}
test();
