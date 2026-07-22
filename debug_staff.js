const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: "new" });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://127.0.0.1:3000/sistema.html', { waitUntil: 'networkidle2' });
    
    // Attempt to login as Admin (assuming PIN 0000 or 1234 or something works)
    // Actually, I can just execute the loadModule function directly if the auth allows it.
    // wait, we can just log in
    await page.evaluate(() => {
        // Find admin pin
        window.currentPin = '1234'; // Need valid pin
        if(window.loginStaff) window.loginStaff('1234');
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Now switch to 'funcionarios'
    await page.evaluate(() => {
        window.loadModule('funcionarios');
    });
    
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();
