const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const url = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1];
const key = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(url, key);

async function test() {
    const { data } = await supabase.from('orders').select('*, staff_users(name)').limit(1);
    console.log(JSON.stringify(data, null, 2));
}
test();
