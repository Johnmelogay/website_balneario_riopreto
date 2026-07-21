// elgin_printer_server.js
// Micro-servidor em Node.js para comunicação direta via USB com a Elgin i8 no Mac
// Bypassa 100% o macOS System Settings e drivers gráficos do Mac!

const http = require('http');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

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
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                printToElgin(data, (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: err.message || 'Erro ao comunicar com a impressora USB' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    }
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'JSON Inválido' }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

function printToElgin(data, callback) {
    try {
        const device = new escpos.USB();
        const printer = new escpos.Printer(device);

        device.open(function (error) {
            if (error) {
                console.error("❌ Erro ao abrir a Elgin i8 via USB:", error);
                return callback(error);
            }

            console.log("⚡ Imprimindo e cortando recibo na Elgin i8 via Hardware USB Direto...");

            printer
                .font('a')
                .align('ct')
                .style('b')
                .size(1, 1)
                .text('BALNEARIO RIO PRETO')
                .text('CONFERENCIA DE CONSUMO')
                .style('normal')
                .size(0, 0)
                .text('--------------------------------')
                .align('lt')
                .text(`LOCAL: ${data.location || 'MESA'}`)
                .text(`CLIENTE: ${data.customer || 'Nao Informado'}`)
                .text(`ATENDENTE: ${data.staff || 'Caixa Central'}`)
                .text(`DATA: ${new Date().toLocaleString('pt-BR')}`)
                .text('--------------------------------');

            (data.items || []).forEach(item => {
                const name = (item.name || '').substring(0, 18).padEnd(18, ' ');
                const qty = `${item.qty}x`.padEnd(4, ' ');
                const total = `R$ ${Number(item.total || 0).toFixed(2)}`;
                printer.text(`${qty} ${name} ${total}`);
            });

            printer
                .text('--------------------------------')
                .text(`Subtotal: R$ ${Number(data.subtotal || 0).toFixed(2)}`)
                .text(`10% Garcons: R$ ${Number(data.serviceFee || 0).toFixed(2)}`)
                .style('b')
                .size(1, 1)
                .text(`TOTAL: R$ ${Number(data.total || 0).toFixed(2)}`)
                .style('normal')
                .size(0, 0)
                .text('================================')
                .align('ct')
                .text('*** GUIA DE CONFERENCIA ***')
                .text('Obrigado pela preferencia!')
                .feed(3)
                .cut() // Comando nativo de guilhotina da Elgin i8
                .close(function () {
                    console.log("✅ Impresso e cortado com sucesso!");
                    callback(null);
                });
        });
    } catch (err) {
        console.error("❌ Exceção na impressão USB:", err);
        callback(err);
    }
}

server.listen(PORT, () => {
    console.log(`🖨️ Servidor de Impressão Direta USB Elgin i8 ativo na porta ${PORT}`);
});
