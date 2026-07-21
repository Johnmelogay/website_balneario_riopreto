// elgin_printer_server.js
// Servidor de Impressão Direta Hardware USB para Elgin i8 no Mac (macOS / MacBook Air)
// Imprime a LOGO REAL do Balneário Rio Preto, molduras profissionais e tipografia em destaque!

const http = require('http');
const usb = require('usb');
const fs = require('fs');
const PNG = require('pngjs').PNG;

const PORT = 3001;

// ====== CONVERSOR DA LOGO PNG PARA BITMAP ESC/POS (GS v 0) ======
function getLogoRasterBuffer(targetWidth = 192) {
    try {
        const logoPath = 'images/logo_opt.png';
        if (!fs.existsSync(logoPath)) return Buffer.alloc(0);

        const data = fs.readFileSync(logoPath);
        const png = PNG.sync.read(data);
        
        const width = targetWidth;
        const height = Math.floor(targetWidth * (png.height / png.width));
        const widthBytes = Math.ceil(width / 8);
        
        const rasterData = Buffer.alloc(widthBytes * height);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcX = Math.floor(x * (png.width / width));
                const srcY = Math.floor(y * (png.height / height));
                const idx = (srcY * png.width + srcX) * 4;
                
                const r = png.data[idx];
                const g = png.data[idx + 1];
                const b = png.data[idx + 2];
                const a = png.data[idx + 3];
                
                const lum = (r * 0.299 + g * 0.587 + b * 0.114);
                const isBlack = (a > 128) && (lum < 160);
                
                if (isBlack) {
                    const byteIdx = y * widthBytes + Math.floor(x / 8);
                    const bitIdx = 7 - (x % 8);
                    rasterData[byteIdx] |= (1 << bitIdx);
                }
            }
        }
        
        const header = Buffer.from([
            0x1D, 0x76, 0x30, 0x00,
            widthBytes % 256, Math.floor(widthBytes / 256),
            height % 256, Math.floor(height / 256)
        ]);
        
        return Buffer.concat([header, rasterData]);
    } catch (e) {
        console.warn('Não foi possível carregar a logo:', e.message);
        return Buffer.alloc(0);
    }
}

function removeAccents(str) {
    return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

let isPrinting = false;

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
                console.error('❌ Erro de impressão USB:', e.message || e);
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
    if (isPrinting) {
        throw new Error("Impressão em andamento, aguarde um instante...");
    }
    isPrinting = true;

    let dev = null;
    try {
        const devices = await usb.usb.getDevices();
        dev = devices.find(d => (d.vendorId === 0x1fc9 && d.productId === 0x2016) || d.vendorId === 0x04b8 || d.vendorId === 0x0416 || d.vendorId === 0x0f3d);

        if (!dev) {
            throw new Error("Impressora Elgin i8 USB não encontrada no Mac! Verifique se o cabo USB está conectado e a impressora ligada.");
        }

        await dev.open();
        await dev.claimInterface(0);

        const encoder = new TextEncoder();

        // ESC/POS Command Buffers
        const RESET = new Uint8Array([0x1B, 0x40]);
        const ALIGN_CENTER = new Uint8Array([0x1B, 0x61, 0x01]);
        const ALIGN_LEFT = new Uint8Array([0x1B, 0x61, 0x00]);
        
        const MODE_NORMAL = new Uint8Array([0x1B, 0x21, 0x00]);
        const MODE_BOLD = new Uint8Array([0x1B, 0x21, 0x08]);
        const MODE_LARGE_HEADER = new Uint8Array([0x1B, 0x21, 0x38]); // Double Width + Height + Bold

        const CUT_FULL = new Uint8Array([0x1D, 0x56, 0x00]); // Elgin Auto Cut paper

        // 1. Logo Bitmap Buffer
        const logoBuffer = getLogoRasterBuffer(192);

        // 2. Build ESC/POS Byte Stream
        const chunks = [];
        chunks.push(RESET);

        // --- HEADER WITH REAL LOGO ---
        if (logoBuffer.length > 0) {
            chunks.push(ALIGN_CENTER);
            chunks.push(logoBuffer);
            chunks.push(encoder.encode("\n"));
        }

        chunks.push(ALIGN_CENTER);
        chunks.push(MODE_LARGE_HEADER);
        chunks.push(encoder.encode("BALNEARIO RIO PRETO\n"));
        chunks.push(MODE_NORMAL);
        chunks.push(MODE_BOLD);
        chunks.push(encoder.encode("CONFERENCIA DE CONSUMO\n"));
        chunks.push(MODE_NORMAL);
        chunks.push(encoder.encode("==========================================\n\n"));

        // --- METADATA BOX ---
        chunks.push(ALIGN_LEFT);
        chunks.push(MODE_BOLD);
        const locStr = removeAccents(data.location || 'MESA');
        const custStr = removeAccents(data.customer || 'Nao Informado');
        const staffStr = removeAccents(data.staff || 'Caixa Central');
        const dateStr = new Date().toLocaleString('pt-BR');

        chunks.push(encoder.encode(` LOCAL / COMANDA: ${locStr}\n`));
        chunks.push(MODE_NORMAL);
        chunks.push(encoder.encode(` CLIENTE:         ${custStr}\n`));
        chunks.push(encoder.encode(` ATENDENTE:       ${staffStr}\n`));
        chunks.push(encoder.encode(` DATA & HORA:     ${dateStr}\n`));
        chunks.push(encoder.encode("------------------------------------------\n"));

        // --- TABLE HEADER ---
        chunks.push(MODE_BOLD);
        chunks.push(encoder.encode(" QTD  ITEM / DESCRICAO               VALOR \n"));
        chunks.push(encoder.encode(" ------------------------------------------ \n"));
        chunks.push(MODE_NORMAL);

        // --- ITEMS ---
        (data.items || []).forEach(item => {
            const name = removeAccents(item.name || '').substring(0, 24).padEnd(24, ' ');
            const qty = `[${item.qty}x]`.padEnd(5, ' ');
            const total = `R$ ${Number(item.total || 0).toFixed(2).replace('.', ',')}`.padStart(10, ' ');
            
            chunks.push(MODE_BOLD);
            chunks.push(encoder.encode(` ${qty} `));
            chunks.push(MODE_NORMAL);
            chunks.push(encoder.encode(`${name} ${total}\n`));
            if (item.notes) {
                chunks.push(encoder.encode(`       * Obs: ${removeAccents(item.notes)}\n`));
            }
        });

        chunks.push(encoder.encode("------------------------------------------\n"));

        // --- FINANCIAL SUMMARY BOX ---
        const subtotal = Number(data.subtotal || 0).toFixed(2).replace('.', ',');
        const serviceFee = Number(data.serviceFee || 0).toFixed(2).replace('.', ',');
        const grandTotal = Number(data.total || 0).toFixed(2).replace('.', ',');

        chunks.push(encoder.encode(` Consumo de Produtos:        R$ ${subtotal.padStart(9, ' ')}\n`));
        chunks.push(encoder.encode(` Taxa de Servico 10% (Garcon):R$ ${serviceFee.padStart(9, ' ')}\n`));
        chunks.push(encoder.encode("==========================================\n"));
        
        // GRAND TOTAL IN LARGE BOLD
        chunks.push(ALIGN_CENTER);
        chunks.push(MODE_LARGE_HEADER);
        chunks.push(encoder.encode(`TOTAL: R$ ${grandTotal}\n`));
        chunks.push(MODE_NORMAL);
        chunks.push(ALIGN_LEFT);
        chunks.push(encoder.encode("==========================================\n\n"));

        // --- FOOTER BRAND TAGLINE ---
        chunks.push(ALIGN_CENTER);
        chunks.push(MODE_BOLD);
        chunks.push(encoder.encode("*** GUIA DE CONFERENCIA DO CLIENTE ***\n"));
        chunks.push(MODE_NORMAL);
        chunks.push(encoder.encode("A taxa de servico de 10% e opcional aos garcons.\n"));
        chunks.push(MODE_BOLD);
        chunks.push(encoder.encode("Obrigado pela preferencia e volte sempre!\n"));
        chunks.push(MODE_NORMAL);
        chunks.push(encoder.encode("balnearioriopreto.com.br\n\n\n\n"));

        // --- AUTO CUT ---
        chunks.push(CUT_FULL);

        const payload = Buffer.concat(chunks);

        await dev.transferOut(1, payload);
        
        try {
            await dev.releaseInterface(0);
        } catch (e) {}

        console.log("🎨 Cupom com LOGO REAL e DESIGN PROFISSIONAL impresso e cortado na Elgin i8!");
    } finally {
        if (dev) {
            try {
                await dev.close();
            } catch (e) {}
        }
        isPrinting = false;
    }
}

server.listen(PORT, () => {
    console.log(`🖨️ Servidor Direto de Hardware Elgin i8 ativo na porta ${PORT}`);
});
