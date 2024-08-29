#!/usr/bin/env node

const app = require('./app');  // Import ứng dụng Express từ tệp app.js
const debug = require('debug')('puppeteer-bizflycloud:server');
const http = require('http');
const { runScrapingAndUpload } = require('./automation/uploadService');
const hls = require('hls-server');
const fs = require('fs');
const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

const server = http.createServer(app);  // Khởi tạo server với ứng dụng Express

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

new hls(server, {
    provider: {
        exists: (req, cb) => {
            const ext = req.url.split('.').pop();
            if (ext !== 'm3u8' && ext !== 'ts') {
                return cb(null, true);
            }
            fs.access(__dirname + req.url, fs.constants.F_OK, function (err) {
                if (err) {
                    console.log('File not exist');
                    return cb(null, false);
                }
                cb(null, true);
            });
        },
        getManifestStream: (req, cb) => {
            const stream = fs.createReadStream(__dirname + req.url);
            cb(null, stream);
        },
        getSegmentStream: (req, cb) => {
            const stream = fs.createReadStream(__dirname + req.url);
            cb(null, stream);
        }
    }
});

function normalizePort(val) {
    const port = parseInt(val, 10);
    if (isNaN(port)) {
        return val;
    }
    if (port >= 0) {
        return port;
    }
    return false;
}

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }
    const bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port;
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function onListening() {
    const addr = server.address();
    const bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    debug('Listening on ' + bind);
    console.log('Server listening on ' + bind);
    runScrapingAndUpload().catch(err => {
        console.error('Error during scraping and upload:', err);
    });
}
