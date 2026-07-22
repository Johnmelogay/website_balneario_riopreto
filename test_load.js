const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    await page.goto('http://127.0.0.1:3000/sistema.html');
    await page.evaluate(() => {
        window.currentPin = '1234';
        if(window.loginStaff) window.loginStaff('1234');
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
        window.loadModule('funcionarios');
    });
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();
