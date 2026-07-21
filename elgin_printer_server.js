// elgin_printer_server.js
// Servidor de Impressão Direta em Alta Resolução (Visual PDF/HTML Render - 576 Dots Full Width)
// Ocupa 100% da largura do papel de 80mm da Elgin i8 com tipografia legível, negrito de alto contraste e a logo oficial!

const http = require('http');
const usb = require('usb');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PNG = require('pngjs').PNG;

const PORT = 3001;

// ====== RENDERIZA HTML PARA RASTER BITMAP ESC/POS (576 dots / Full Width 80mm Elgin i8) ======
function htmlToEscPosRaster(htmlContent, targetWidth = 576) {
    const tempHtmlPath = path.join(__dirname, 'temp_receipt_render.html');
    const tempPngPath = path.join(__dirname, 'temp_receipt_render.png');

    fs.writeFileSync(tempHtmlPath, htmlContent);

    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const cmd = `"${chromePath}" --headless --disable-gpu --screenshot="${tempPngPath}" --window-size=576,1400 "${tempHtmlPath}"`;
    
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

            // High contrast binarization threshold for ultra crisp thermal paper
            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
            const isBlack = (a > 128) && (lum < 225);

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
                    <td style="padding: 8px 0; border-bottom: 2px dashed #cbd5e1; vertical-align: top;">
                        <span style="font-weight: 900; color: #047857; margin-right: 6px; font-size: 17px;">${item.qty}x</span>
                        <span style="font-weight: 800; color: #000000; font-size: 16px;">${item.name}</span>
                        ${item.notes ? `<div style="font-size: 13px; color: #d97706; font-style: italic; font-weight: 700; margin-top: 2px;">Obs: ${item.notes}</div>` : ''}
                    </td>
                    <td style="padding: 8px 0; border-bottom: 2px dashed #cbd5e1; vertical-align: top; text-align: right; font-weight: 900; color: #000000; font-size: 17px; white-space: nowrap;">
                        R$ ${Number(item.total || 0).toFixed(2).replace('.', ',')}
                    </td>
                </tr>
            `;
        });

        // HTML Visual Layout tailored for 576 dots full-width Elgin i8 receipt
        const receiptHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800;900&family=Outfit:wght@800;900&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: 'Inter', -apple-system, sans-serif;
                        width: 576px;
                        background: #ffffff;
                        color: #000000;
                        padding: 16px 20px;
                        line-height: 1.35;
                    }
                    .header { text-align: center; padding-bottom: 12px; border-bottom: 3px solid #064e3b; }
                    .logo { width: 72px; height: 72px; border-radius: 16px; margin: 0 auto 8px auto; display: block; object-fit: contain; }
                    .brand-title { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 27px; color: #064e3b; text-transform: uppercase; letter-spacing: -0.5px; }
                    .subtitle { font-size: 14px; font-weight: 900; color: #047857; letter-spacing: 2.5px; text-transform: uppercase; margin-top: 3px; }
                    
                    .info-box { background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 14px; padding: 12px 14px; margin: 14px 0; font-size: 15px; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
                    .info-row:last-child { margin-bottom: 0; }
                    .info-label { color: #475569; font-weight: 800; }
                    .info-val { color: #000000; font-weight: 900; }

                    .items-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 16px; }
                    .items-table th { font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 900; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 3px solid #64748b; padding-bottom: 6px; text-align: left; }
                    .items-table th.right { text-align: right; }

                    .summary-box { background: #f0fdf4; border: 3px solid #4ade80; border-radius: 16px; padding: 14px; margin: 14px 0; }
                    .summary-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 16px; }
                    .summary-row.total { border-top: 3px solid #22c55e; padding-top: 10px; margin-top: 10px; margin-bottom: 0; }
                    .total-title { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 20px; color: #064e3b; }
                    .total-amount { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 28px; color: #047857; }

                    .footer { text-align: center; margin-top: 16px; padding-top: 12px; border-top: 2px dashed #cbd5e1; font-size: 13px; color: #334155; }
                    .footer-highlight { font-weight: 900; color: #064e3b; font-size: 14px; margin-bottom: 3px; }
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
                        <span class="info-val" style="color: #064e3b; font-size: 18px;">${data.location || 'MESA'}</span>
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
                        <span style="color: #334155; font-weight: 800;">Consumo Produtos:</span>
                        <span style="font-weight: 900; color: #000000;">R$ ${subtotal}</span>
                    </div>
                    <div class="summary-row">
                        <span style="color: #334155; font-weight: 800;">Taxa de Serviço 10% (Garçons):</span>
                        <span style="font-weight: 900; color: #047857;">R$ ${serviceFee}</span>
                    </div>
                    <div class="summary-row total">
                        <span class="total-title">TOTAL A RECEBER:</span>
                        <span class="total-amount">R$ ${grandTotal}</span>
                    </div>
                </div>

                <div class="footer">
                    <div class="footer-highlight">*** GUIA DE CONFERÊNCIA ***</div>
                    <p style="margin: 3px 0;">A taxa de serviço de 10% é opcional aos garçons.</p>
                    <p style="margin: 3px 0; font-weight: 800; color: #000000;">Obrigado pela preferência e volte sempre! 🌿</p>
                    <p style="margin-top: 6px; font-size: 11px; color: #64748b; font-weight: 700;">balnearioriopreto.com.br</p>
                </div>
            </body>
            </html>
        `;

        // Render HTML to 576-dot full-width high-resolution raster bitmap
        const rasterBuffer = htmlToEscPosRaster(receiptHtml, 576);

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

        console.log("🎨 IMPRESSÃO FULL WIDTH (576 DOTS) CONCLUÍDA COM SUCESSO NA ELGIN i8!");
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
    console.log(`🖨️ Servidor Direto de Hardware Elgin i8 (576 Dots Full Width) ativo na porta ${PORT}`);
});
