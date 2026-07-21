// elgin_printer_server.js
// Servidor de Impressão Direta Hardware USB para Elgin i8 no Mac (macOS / MacBook Air)
// Bypassa 100% os drivers e o painel de impressoras do macOS!

const http = require('http');
const usb = require('usb');

const PORT = 3001;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    if (req.url === '/print' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                await printDirectHardware(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('❌ Erro de impressão USB:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message || 'Erro de hardware USB' }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

async function printDirectHardware(data) {
    const devices = await usb.usb.getDevices();
    const dev = devices.find(d => (d.vendorId === 0x1fc9 && d.productId === 0x2016) || d.vendorId === 0x04b8 || d.vendorId === 0x0416 || d.vendorId === 0x0f3d);

    if (!dev) {
        throw new Error("Impressora Elgin i8 USB não encontrada no Mac! Verifique se o cabo USB está conectado e a impressora ligada.");
    }

    await dev.open();
    await dev.claimInterface(0);

    const encoder = new TextEncoder();

    // ESC/POS Command Buffers
    const RESET = new Uint8Array([0x1B, 0x40]);
    const CENTER = new Uint8Array([0x1B, 0x61, 0x01]);
    const LEFT = new Uint8Array([0x1B, 0x61, 0x00]);
    const BOLD_ON = new Uint8Array([0x1B, 0x45, 0x01]);
    const BOLD_OFF = new Uint8Array([0x1B, 0x45, 0x00]);
    const CUT_FULL = new Uint8Array([0x1D, 0x56, 0x00]); // Elgin Auto Cut paper

    let receiptText = "";
    receiptText += `LOCAL: ${data.location || 'MESA'}\n`;
    receiptText += `CLIENTE: ${data.customer || 'Nao Informado'}\n`;
    receiptText += `ATENDENTE: ${data.staff || 'Caixa Central'}\n`;
    receiptText += `DATA: ${new Date().toLocaleString('pt-BR')}\n`;
    receiptText += "--------------------------------\n";

    (data.items || []).forEach(item => {
        const name = (item.name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 18).padEnd(18, ' ');
        const qty = `${item.qty}x`.padEnd(4, ' ');
        const total = `R$ ${Number(item.total || 0).toFixed(2)}`;
        receiptText += `${qty} ${name} ${total}\n`;
    });

    receiptText += "--------------------------------\n";
    receiptText += `Subtotal: R$ ${Number(data.subtotal || 0).toFixed(2)}\n`;
    receiptText += `10% Garcons: R$ ${Number(data.serviceFee || 0).toFixed(2)}\n`;
    receiptText += "================================\n";
    receiptText += `TOTAL A RECEBER: R$ ${Number(data.total || 0).toFixed(2)}\n`;
    receiptText += "================================\n\n";
    receiptText += "*** GUIA DE CONFERENCIA ***\n";
    receiptText += "Obrigado pela preferencia!\n\n\n\n";

    const payload = Buffer.concat([
        RESET,
        CENTER,
        BOLD_ON,
        encoder.encode("BALNEARIO RIO PRETO\nCONFERENCIA DE CONSUMO\n\n"),
        BOLD_OFF,
        LEFT,
        encoder.encode(receiptText),
        CUT_FULL
    ]);

    await dev.transferOut(1, payload);
    await dev.close();
    console.log("⚡ Cupom impresso e cortado na Elgin i8 com sucesso via hardware USB!");
}

server.listen(PORT, () => {
    console.log(`🖨️ Servidor Direto de Hardware Elgin i8 ativo na porta ${PORT}`);
});
