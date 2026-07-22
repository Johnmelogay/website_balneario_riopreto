const url = 'https://hihaipaslnpaqnqotrwm.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaGFpcGFzbG5wYXFucW90cndtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjE1OTIsImV4cCI6MjA3OTgzNzU5Mn0.zwPHKlcYNQnlQbQdf83qbH3mk4Dsc8fVF4NfWDBs_LA';

const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

async function checkTable(tableName, label) {
    console.log(`\n🔍 Verificando tabela [${label}]...`);
    try {
        const res = await fetch(`${url}/rest/v1/${tableName}?select=*&limit=1`, { headers });
        if (res.ok) {
            const data = await res.json();
            console.log(`✅ Conexão com [${label}] bem sucedida.`);
            return true;
        } else {
            console.error(`❌ Erro ao acessar [${label}]:`, res.status, await res.text());
            return false;
        }
    } catch (e) {
        console.error(`❌ Erro de rede ao acessar [${label}]:`, e.message);
        return false;
    }
}

async function runTests() {
    console.log('=============================================');
    console.log('🚀 INICIANDO TESTES DE PRONTIDÃO PARA O FIM DE SEMANA');
    console.log('=============================================');
    
    let allGood = true;

    allGood &= await checkTable('products', 'Produtos (Estoque/Cardápio)');
    allGood &= await checkTable('orders', 'Comandas/Pedidos');
    allGood &= await checkTable('order_items', 'Itens dos Pedidos');
    allGood &= await checkTable('staff_users', 'Equipe (Login)');

    console.log(`\n🔍 Verificando integridade dos pedidos abertos...`);
    try {
        // Pedidos com mais de 24 horas abertos
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(`${url}/rest/v1/orders?payment_status=eq.aberto&status=neq.cancelado&created_at=lt.${yesterday}&select=id,order_number,created_at`, { headers });
        if (res.ok) {
            const stuckOrders = await res.json();
            if (stuckOrders.length > 0) {
                console.log(`⚠️ ALERTA: Existem ${stuckOrders.length} comandas abertas há mais de 24 horas! Recomendado conferir e fechar/cancelar.`);
            } else {
                console.log(`✅ Nenhuma comanda fantasma/esquecida em aberto.`);
            }
        }
    } catch(e) {
        console.error('Erro ao verificar comandas travadas:', e.message);
    }

    console.log('\n=============================================');
    if (allGood) {
        console.log('🎉 RESULTADO: O sistema de banco de dados está SAUDÁVEL e RESPONDSIVO!');
        console.log('Tudo pronto para um final de semana com volume alto de pedidos.');
    } else {
        console.log('⚠️ RESULTADO: Ocorreram FALHAS em alguns módulos. Verifique o log.');
    }
    console.log('=============================================\n');
}

runTests();
