// elgin_printer_server.js
// Servidor de Impressão Direta em Alta Resolução (Visual PDF/HTML Render) para Elgin i8 no Mac
// Renderiza o documento HTML visual completo com as fontes oficiais (Outfit e Inter), a logo,
// bordas arredondadas e cartões coloridos diretamente em bitmap de alta definição para a impressora!

const http = require('http');
const usb = require('usb');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PNG = require('pngjs').PNG;

const PORT = 3001;

// ====== RENDERIZA HTML PARA RASTER BITMAP ESC/POS (384 dots / 80mm) ======
function htmlToEscPosRaster(htmlContent, targetWidth = 384) {
    const tempHtmlPath = path.join(__dirname, 'temp_receipt_render.html');
    const tempPngPath = path.join(__dirname, 'temp_receipt_render.png');

    fs.writeFileSync(tempHtmlPath, htmlContent);

    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const cmd = `"${chromePath}" --headless --disable-gpu --screenshot="${tempPngPath}" --window-size=384,1000 "${tempHtmlPath}"`;
    
    execSync(cmd);

    if (!fs.existsSync(tempPngPath)) {
        throw new Error('Falha ao gerar imagem raster do recibo.');
    }

    const pngData = fs.readFileSync(tempPngPath);
    const png = PNG.sync.read(pngData);

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

            // Threshold for black ink dots
            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
            const isBlack = (a > 128) && (lum < 210);

            if (isBlack) {
                const byteIdx = y * widthBytes + Math.floor(x / 8);
                const bitIdx = 7 - (x % 8);
                rasterData[byteIdx] |= (1 << bitIdx);
            }
        }
    }

    // Clean up temp files
    try {
        fs.unlinkSync(tempHtmlPath);
        fs.unlinkSync(tempPngPath);
    } catch(e) {}

    const header = Buffer.from([
        0x1D, 0x76, 0x30, 0x00,
        widthBytes % 256, Math.floor(widthBytes / 256),
        height % 256, Math.floor(height / 256)
    ]);

    return Buffer.concat([header, rasterData]);
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
                await printVisualPdfHardware(data);
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

async function printVisualPdfHardware(data) {
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

        const nowStr = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const subtotal = Number(data.subtotal || 0).toFixed(2).replace('.', ',');
        const serviceFee = Number(data.serviceFee || 0).toFixed(2).replace('.', ',');
        const grandTotal = Number(data.total || 0).toFixed(2).replace('.', ',');

        let itemsRows = '';
        (data.items || []).forEach(item => {
            itemsRows += `
                <tr>
                    <td style="padding: 4px 0; border-bottom: 1px dashed #cbd5e1; vertical-align: top;">
                        <span style="font-weight: 900; color: #047857; margin-right: 4px;">${item.qty}x</span>
                        <span style="font-weight: 700; color: #0f172a;">${item.name}</span>
                        ${item.notes ? `<div style="font-size: 9px; color: #d97706; font-style: italic; margin-top: 1px;">Obs: ${item.notes}</div>` : ''}
                    </td>
                    <td style="padding: 4px 0; border-bottom: 1px dashed #cbd5e1; vertical-align: top; text-align: right; font-weight: 800; color: #0f172a; white-space: nowrap;">
                        R$ ${Number(item.total || 0).toFixed(2).replace('.', ',')}
                    </td>
                </tr>
            `;
        });

        // HTML Visual Layout exactly matching PDF / site typography and branding
        const receiptHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: 'Inter', -apple-system, sans-serif;
                        width: 384px;
                        background: #ffffff;
                        color: #0f172a;
                        padding: 12px;
                        line-height: 1.3;
                    }
                    .header { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #064e3b; }
                    .logo { width: 56px; height: 56px; border-radius: 12px; margin: 0 auto 6px auto; display: block; object-fit: contain; }
                    .brand-title { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 19px; color: #064e3b; text-transform: uppercase; letter-spacing: -0.5px; }
                    .subtitle { font-size: 10px; font-weight: 900; color: #047857; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 2px; }
                    
                    .info-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; margin: 10px 0; font-size: 11px; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
                    .info-row:last-child { margin-bottom: 0; }
                    .info-label { color: #64748b; font-weight: 700; }
                    .info-val { color: #0f172a; font-weight: 900; }

                    .items-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
                    .items-table th { font-family: 'Outfit', sans-serif; font-size: 10px; font-weight: 900; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #94a3b8; padding-bottom: 4px; text-align: left; }
                    .items-table th.right { text-align: right; }

                    .summary-box { background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 10px; margin: 10px 0; }
                    .summary-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11.5px; }
                    .summary-row.total { border-top: 2px solid #4ade80; padding-top: 6px; margin-top: 6px; margin-bottom: 0; }
                    .total-title { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 15px; color: #064e3b; }
                    .total-amount { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 20px; color: #047857; }

                    .footer { text-align: center; margin-top: 12px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 10px; color: #475569; }
                    .footer-highlight { font-weight: 900; color: #064e3b; margin-bottom: 2px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <img src="https://balnearioriopreto.com.br/images/logo_opt.png" alt="Logo" class="logo" onerror="this.style.display='none'">
                    <h1 class="brand-title">Balneário Rio Preto</h1>
                    <div class="subtitle">Conferência de Consumo</div>
                </div>

                <div class="info-box">
                    <div class="info-row">
                        <span class="info-label">LOCAL / COMANDA:</span>
                        <span class="info-val" style="color: #064e3b; font-size: 13px;">${data.location || 'MESA'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">CLIENTE:</span>
                        <span class="info-val">${data.customer || 'Não Informado'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">ATENDENTE:</span>
                        <span class="info-val">${data.staff || 'Caixa Central'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">DATA & HORA:</span>
                        <span class="info-val">${nowStr}</span>
                    </div>
                </div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Item / Descrição</th>
                            <th class="right">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                </table>

                <div class="summary-box">
                    <div class="summary-row">
                        <span style="color: #475569; font-weight: 700;">Consumo Produtos:</span>
                        <span style="font-weight: 900; color: #0f172a;">R$ ${subtotal}</span>
                    </div>
                    <div class="summary-row">
                        <span style="color: #475569; font-weight: 700;">Taxa de Serviço 10% (Garçons):</span>
                        <span style="font-weight: 900; color: #047857;">R$ ${serviceFee}</span>
                    </div>
                    <div class="summary-row total">
                        <span class="total-title">TOTAL A RECEBER:</span>
                        <span class="total-amount">R$ ${grandTotal}</span>
                    </div>
                </div>

                <div class="footer">
                    <div class="footer-highlight">*** GUIA DE CONFERÊNCIA ***</div>
                    <p style="margin: 2px 0;">A taxa de serviço de 10% é opcional aos garçons.</p>
                    <p style="margin: 2px 0; font-weight: 700; color: #1e293b;">Obrigado pela preferência e volte sempre! 🌿</p>
                    <p style="margin-top: 4px; font-size: 9px; color: #94a3b8;">balnearioriopreto.com.br</p>
                </div>
            </body>
            </html>
        `;

        // Render HTML to high-resolution raster bitmap
        const rasterBuffer = htmlToEscPosRaster(receiptHtml, 384);

        await dev.open();
        await dev.claimInterface(0);

        const RESET = new Uint8Array([0x1B, 0x40, 0x1B, 0x61, 0x01]);
        const FEED_CUT = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]); // Feed + Auto Cut paper

        const payload = Buffer.concat([
            RESET,
            rasterBuffer,
            FEED_CUT
        ]);

        await dev.transferOut(1, payload);

        try {
            await dev.releaseInterface(0);
        } catch (e) {}

        console.log("🎨 IMPRESSÃO RASTER PDF/VISUAL EM ALTA RESOLUÇÃO CONCLUÍDA NA ELGIN i8!");
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
    console.log(`🖨️ Servidor Direto de Hardware Elgin i8 (Visual PDF Raster) ativo na porta ${PORT}`);
});
