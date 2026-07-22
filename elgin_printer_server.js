// elgin_printer_server.js
// Servidor de Impressão Direta em Alta Resolução (Logo Ampliada + Margem Superior/Inferior Equilibrada)

const http = require('http');
const usb = require('usb');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PNG = require('pngjs').PNG;

const PORT = 3001;

// ====== RENDERIZA HTML E CORTA O ESPAÇO EM BRANCO AUTOMATICAMENTE ======
function htmlToEscPosRaster(htmlContent, targetWidth = 576) {
    const tempHtmlPath = path.join(__dirname, 'temp_receipt_render.html');
    const tempPngPath = path.join(__dirname, 'temp_receipt_render.png');

    fs.writeFileSync(tempHtmlPath, htmlContent);

    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const cmd = `"${chromePath}" --headless --disable-gpu --screenshot="${tempPngPath}" --window-size=576,1600 "${tempHtmlPath}"`;
    
    execSync(cmd);

    if (!fs.existsSync(tempPngPath)) {
        throw new Error('Falha ao gerar imagem raster do recibo.');
    }

    const pngData = fs.readFileSync(tempPngPath);
    const png = PNG.sync.read(pngData);

    const width = targetWidth;
    const widthBytes = Math.ceil(width / 8);

    // Encontrar a última linha vertical com pixels pretos para ajustar o corte equilibrado no final
    let lastY = 0;
    for (let y = png.height - 1; y >= 0; y--) {
        for (let x = 0; x < png.width; x++) {
            const idx = (y * png.width + x) * 4;
            const a = png.data[idx + 3];
            const lum = png.data[idx] * 0.299 + png.data[idx + 1] * 0.587 + png.data[idx + 2] * 0.114;
            if (a > 128 && lum < 185) {
                lastY = y;
                break;
            }
        }
        if (lastY > 0) break;
    }

    // Margem equilibrada de 45px no final para combinar com o topo
    const croppedHeight = lastY > 0 ? Math.min(png.height, lastY + 45) : png.height;
    const height = Math.floor(targetWidth * (croppedHeight / png.width));

    const rasterData = Buffer.alloc(widthBytes * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const srcX = Math.floor(x * (png.width / width));
            const srcY = Math.floor(y * (croppedHeight / height));
            const idx = (srcY * png.width + srcX) * 4;

            const r = png.data[idx];
            const g = png.data[idx + 1];
            const b = png.data[idx + 2];
            const a = png.data[idx + 3];

            // Limiar equilibrado de luminância
            const lum = (r * 0.299 + g * 0.587 + b * 0.114);
            const isBlack = (a > 128) && (lum < 175);

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

    if (req.url === '/print_html' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                await printGenericHtml(data.html);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('❌ Erro de impressão HTML USB:', e.message || e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message || 'Erro de hardware USB' }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

async function printGenericHtml(htmlContent) {
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

        const rasterData = htmlToEscPosRaster(htmlContent, 576);

        dev.open();
        const iface = dev.interfaces[0];
        if (iface.isKernelDriverActive()) {
            iface.detachKernelDriver();
        }
        iface.claim();

        let outEndpoint = iface.endpoints.find(e => e.direction === 'out');
        if (!outEndpoint) {
            throw new Error("Endpoint de saída USB não encontrado na impressora.");
        }

        const initCmd = Buffer.from([0x1B, 0x40]);
        await new Promise((resolve, reject) => {
            outEndpoint.transfer(initCmd, (err) => err ? reject(err) : resolve());
        });

        const centerCmd = Buffer.from([0x1B, 0x61, 0x01]);
        await new Promise((resolve, reject) => {
            outEndpoint.transfer(centerCmd, (err) => err ? reject(err) : resolve());
        });

        await new Promise((resolve, reject) => {
            outEndpoint.transfer(rasterData, (err) => err ? reject(err) : resolve());
        });

        const cutCmd = Buffer.from([0x1D, 0x56, 0x42, 0x00]);
        await new Promise((resolve, reject) => {
            outEndpoint.transfer(cutCmd, (err) => err ? reject(err) : resolve());
        });

        await new Promise(r => setTimeout(r, 200));

    } finally {
        if (dev) {
            try {
                const iface = dev.interfaces[0];
                iface.release(true, () => {
                    dev.close();
                });
            } catch (e) {
                console.error("Erro ao fechar USB:", e.message);
            }
        }
        isPrinting = false;
    }
}

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
                    <td style="padding: 8px 0; border-bottom: 2px dashed #000000; vertical-align: top;">
                        <span style="font-weight: 900; color: #000000; margin-right: 8px; font-size: 21px;">${item.qty}x</span>
                        <span style="font-weight: 800; color: #000000; font-size: 19px;">${item.name}</span>
                        ${item.notes ? `<div style="font-size: 15px; color: #000000; font-style: italic; font-weight: 700; margin-top: 3px;">Obs: ${item.notes}</div>` : ''}
                    </td>
                    <td style="padding: 8px 0; border-bottom: 2px dashed #000000; vertical-align: top; text-align: right; font-weight: 900; color: #000000; font-size: 20px; white-space: nowrap;">
                        R$ ${Number(item.total || 0).toFixed(2).replace('.', ',')}
                    </td>
                </tr>
            `;
        });

        // HTML Visual Layout with Prominent Logo and Balanced Margins
        const receiptHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900&family=Outfit:wght@800;900&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: 'Inter', -apple-system, sans-serif;
                        width: 576px;
                        background: #ffffff;
                        color: #000000;
                        padding: 4px 14px 12px 14px;
                        line-height: 1.35;
                    }
                    .header { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #000000; }
                    .logo { width: 140px; height: 140px; margin: 0 auto 4px auto; display: block; object-fit: contain; filter: contrast(180%); }
                    .brand-title { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 30px; color: #000000; text-transform: uppercase; letter-spacing: -0.5px; line-height: 1.1; }
                    .subtitle { font-size: 15px; font-weight: 900; color: #000000; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
                    
                    .info-box { border: 2.5px solid #000000; border-radius: 14px; padding: 12px 14px; margin: 12px 0; font-size: 18px; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
                    .info-row:last-child { margin-bottom: 0; }
                    .info-label { color: #000000; font-weight: 800; }
                    .info-val { color: #000000; font-weight: 900; }

                    .items-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 19px; }
                    .items-table th { font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 3px solid #000000; padding-bottom: 6px; text-align: left; }
                    .items-table th.right { text-align: right; }

                    .summary-box { border: 3px solid #000000; border-radius: 16px; padding: 14px; margin: 12px 0; }
                    .summary-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 18px; }
                    .summary-row.total { border-top: 3px solid #000000; padding-top: 10px; margin-top: 8px; margin-bottom: 0; }
                    .total-title { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 24px; color: #000000; }
                    .total-amount { font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 34px; color: #000000; }

                    .footer { text-align: center; margin-top: 12px; padding-top: 10px; border-top: 2px dashed #000000; font-size: 14px; color: #000000; }
                    .footer-highlight { font-weight: 900; color: #000000; font-size: 15px; margin-bottom: 3px; }
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
                        <span class="info-val" style="font-size: 22px;">${data.location || 'MESA'}</span>
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
                        <span style="font-weight: 800;">Consumo Produtos:</span>
                        <span style="font-weight: 900;">R$ ${subtotal}</span>
                    </div>
                    <div class="summary-row">
                        <span style="font-weight: 800;">Taxa de Serviço 10% (Garçons):</span>
                        <span style="font-weight: 900;">R$ ${serviceFee}</span>
                    </div>
                    <div class="summary-row total">
                        <span class="total-title">TOTAL A RECEBER:</span>
                        <span class="total-amount">R$ ${grandTotal}</span>
                    </div>
                </div>

                <div class="footer">
                    <div class="footer-highlight">*** GUIA DE CONFERÊNCIA ***</div>
                    <p style="margin: 3px 0; font-weight: 700;">A taxa de serviço de 10% é opcional aos garçons.</p>
                    <p style="margin: 3px 0; font-weight: 900;">Obrigado pela preferência e volte sempre! 🌿</p>
                    <p style="margin-top: 6px; font-size: 13px; color: #000000; font-weight: 800;">balnearioriopreto.com.br</p>
                </div>
            </body>
            </html>
        `;

        // Render HTML to 576-dot full-width raster bitmap
        const rasterBuffer = htmlToEscPosRaster(receiptHtml, 576);

        await dev.open();
        await dev.claimInterface(0);

        const RESET = new Uint8Array([0x1B, 0x40, 0x1B, 0x61, 0x01]);
        const FEED_CUT = new Uint8Array([0x0A, 0x0A, 0x1D, 0x56, 0x00]); // Balanced line feed + Auto Cut paper

        const payload = Buffer.concat([
            RESET,
            rasterBuffer,
            FEED_CUT
        ]);

        await dev.transferOut(1, payload);

        try {
            await dev.releaseInterface(0);
        } catch (e) {}

        console.log("🎨 IMPRESSÃO COM LOGO AMPLIADA E MARGENS EQUILIBRADAS CONCLUÍDA NA ELGIN i8!");
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
    console.log(`🖨️ Servidor Direto de Hardware Elgin i8 (Logo Ampliada + Margens Equilibradas) ativo na porta ${PORT}`);
});
