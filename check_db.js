const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('scripts.js', 'utf-8');
const url = envFile.match(/const SUPABASE_URL = '(.*)'/)[1];
const key = envFile.match(/const SUPABASE_KEY = '(.*)'/)[1];

const supabase = createClient(url, key);

async function check() {
    const { data: tables } = await supabase.from('blog_posts').select('*').limit(1).catch(() => ({data: null}));
    if (tables) {
        const { data } = await supabase.from('blog_posts').select('*');
        console.log("blog_posts", data);
    }
}
check();
