// elgin_printer_server.js
// Servidor de Impressão Direta em Alta Resolução (Suporte a Relatórios Longos Sem Corte de Buffer)

const http = require('http');
const usb = require('usb');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PNG = require('pngjs').PNG;

const PORT = 3001;

/**
 * Envia o buffer para o endpoint USB em pacotes menores (16 KB)
 * Evita estouro de buffer no controlador USB do macOS e na impressora.
 */
async function sendUsbBufferInChunks(dev, endpointAddr, buffer, chunkSize = 16384) {
    for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, i + chunkSize);
        await dev.transferOut(endpointAddr, chunk);
    }
}

// ====== RENDERIZA HTML E FATIA EM BLOCOS ESC/POS (UNLIMITED HEIGHT) ======
function htmlToEscPosRaster(htmlContent, targetWidth = 576) {
    const tempHtmlPath = path.join(__dirname, 'temp_receipt_render.html');
    const tempPngPath = path.join(__dirname, 'temp_receipt_render.png');

    fs.writeFileSync(tempHtmlPath, htmlContent);

    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const cmd = `"${chromePath}" --headless --disable-gpu --hide-scrollbars --screenshot="${tempPngPath}" --window-size=576,32000 "${tempHtmlPath}"`;
    
    execSync(cmd);

    if (!fs.existsSync(tempPngPath)) {
        throw new Error('Falha ao gerar imagem raster do recibo.');
    }

    const pngData = fs.readFileSync(tempPngPath);
    const png = PNG.sync.read(pngData);

    const width = targetWidth;
    const widthBytes = Math.ceil(width / 8);

    // Encontrar a última linha vertical com conteúdo real (ignorando bordas extremas do viewport)
    let lastY = 0;
    for (let y = png.height - 1; y >= 0; y--) {
        for (let x = 8; x < png.width - 8; x++) {
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

    const fullRasterData = Buffer.alloc(widthBytes * height);

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
                fullRasterData[byteIdx] |= (1 << bitIdx);
            }
        }
    }

    // Clean up temp files
    try {
        fs.unlinkSync(tempHtmlPath);
        fs.unlinkSync(tempPngPath);
    } catch(e) {}

    // Fatiar a imagem em blocos verticais (chunks) de 256 linhas (dots) cada
    // Isso evita o estouro do buffer da Elgin i8 e garante impressão contínua de relatórios longos sem cortes!
    const CHUNK_HEIGHT = 256;
    const chunks = [];

    for (let chunkY = 0; chunkY < height; chunkY += CHUNK_HEIGHT) {
        const sliceHeight = Math.min(CHUNK_HEIGHT, height - chunkY);
        const sliceRaster = Buffer.alloc(widthBytes * sliceHeight);

        for (let y = 0; y < sliceHeight; y++) {
            const globalY = chunkY + y;
            const srcByteIdx = globalY * widthBytes;
            const dstByteIdx = y * widthBytes;
            fullRasterData.copy(sliceRaster, dstByteIdx, srcByteIdx, srcByteIdx + widthBytes);
        }

        const chunkHeader = Buffer.from([
            0x1D, 0x76, 0x30, 0x00,
            widthBytes % 256, Math.floor(widthBytes / 256),
            sliceHeight % 256, Math.floor(sliceHeight / 256)
        ]);

        chunks.push(Buffer.concat([chunkHeader, sliceRaster]));
    }

    return Buffer.concat(chunks);
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

        await dev.open();
        await dev.claimInterface(0);

        const RESET = new Uint8Array([0x1B, 0x40, 0x1B, 0x61, 0x01]);
        const FEED_CUT = new Uint8Array([0x0A, 0x0A, 0x1D, 0x56, 0x00]);

        const payload = Buffer.concat([
            RESET,
            rasterData,
            FEED_CUT
        ]);

        await sendUsbBufferInChunks(dev, 1, payload);

        try {
            await dev.releaseInterface(0);
        } catch (e) {}

        console.log("🎨 RELATÓRIO IMPRESSO COM SUCESSO (SEM CORTE E ALTURA ILIMITADA)!");

    } finally {
        if (dev) {

            try {
                await dev.close();
            } catch (e) {}
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
                    .details-box { border: 2px solid #000000; border-radius: 8px; padding: 10px; margin: 12px 0; background: #ffffff; }
                    .table-header { border-bottom: 3px solid #000000; font-weight: 900; font-size: 17px; padding-bottom: 6px; }
                    .totals-card { border: 3px solid #000000; border-radius: 10px; padding: 12px; margin-top: 14px; background: #ffffff; }
                    .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; padding: 3px 0; color: #000000; }
                    .grand-total { display: flex; justify-content: space-between; font-size: 26px; font-weight: 900; border-top: 3px solid #000000; padding-top: 8px; margin-top: 6px; color: #000000; }
                    .footer { text-align: center; margin-top: 14px; font-size: 15px; font-weight: 800; color: #000000; }
                </style>
            </head>
            <body>
                <div class="header">
                    <img src="https://balnearioriopreto.com.br/logo.png" class="logo" onerror="this.style.display='none'">
                    <div class="brand-title">Balneário Rio Preto</div>
                    <div class="subtitle">Extrato de Consumo • Comanda</div>
                </div>

                <div class="details-box">
                    <div style="font-size: 20px; font-weight: 900; color: #000000; text-align: center; margin-bottom: 6px; text-transform: uppercase;">
                        ${data.type?.toUpperCase()} ${data.id} ${data.customerName ? '• ' + data.customerName.toUpperCase() : ''}
                    </div>
                    <div style="font-size: 15px; font-weight: 800; color: #000000; display: flex; justify-content: space-between; border-top: 1px dashed #000; padding-top: 6px;">
                        <span>Data: ${nowStr}</span>
                        <span>Garçom: ${data.staff || 'Equipe'}</span>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
                    <thead>
                        <tr class="table-header">
                            <th style="text-align: left;">ITEM DE CONSUMO</th>
                            <th style="text-align: right; width: 100px;">VALOR</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                </table>

                <div class="totals-card">
                    <div class="total-row">
                        <span>Consumo Produtos:</span>
                        <span>R$ ${subtotal}</span>
                    </div>
                    ${data.serviceFee > 0 ? `
                        <div class="total-row">
                            <span>Taxa de Serviço (10%):</span>
                            <span>R$ ${serviceFee}</span>
                        </div>
                    ` : ''}
                    <div class="grand-total">
                        <span>TOTAL A PAGAR:</span>
                        <span>R$ ${grandTotal}</span>
                    </div>
                </div>

                <div class="footer">
                    Obrigado pela preferência! Volte Sempre 🍃
                </div>
            </body>
            </html>
        `;

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

        await sendUsbBufferInChunks(dev, 1, payload);

        try {
            await dev.releaseInterface(0);
        } catch (e) {}

        console.log("🎨 IMPRESSÃO CONCLUÍDA NA ELGIN i8 SEM NENHUM CORTE!");
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
    console.log(`🖨️ Servidor Direto de Hardware Elgin i8 (Suporte a Relatórios Longos Sem Corte) ativo na porta ${PORT}`);
});
