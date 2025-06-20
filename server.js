
import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathname = parsedUrl.pathname;

    // Servir la página de demostración
    if (pathname === '/' || pathname === '/demo') {
        fs.readFile('./demo.html', (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Demo no encontrado');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // API simulada para subida de archivos
    if (pathname === '/api/upload' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            // Simular procesamiento
            setTimeout(() => {
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Archivo subido correctamente',
                    timestamp: new Date().toISOString()
                }));
            }, Math.random() * 2000 + 500); // 0.5-2.5 segundos
        });
        return;
    }

    // Manejar CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // 404 para otras rutas
    res.writeHead(404);
    res.end('Página no encontrada');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🟡 Demostración MAAT ejecutándose en puerto ${PORT}`);
    console.log(`🌐 Abre: http://localhost:${PORT}/demo`);
    console.log(`📁 Cargador masivo listo para probar`);
});
