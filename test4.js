const app = require('express')();
const fs = require('fs');
const hls = require('hls-server');
const server = app.listen(3000);

app.get('/', (req, res) => {
    return res.status(200).sendFile(`${__dirname}/client.html`);
});

new hls(server, {
    provider: {
        exists: (req, cb) => {
            const filePath = __dirname + req.url;
            console.log('Checking file path:', filePath);
            const ext = req.url.split('.').pop();

            if (ext !== 'm3u8' && ext !== 'ts') {
                return cb(null, true);
            }

            fs.access(filePath, fs.constants.F_OK, (err) => {
                if (err) {
                    console.log('File not exist:', filePath);
                    return cb(null, false);
                }
                cb(null, true);
            });
        },
        getManifestStream: (req, cb) => {
            const filePath = __dirname + req.url;
            const stream = fs.createReadStream(filePath);
            stream.on('error', (err) => {
                console.error('Error reading manifest:', err);
            });
            cb(null, stream);
        },
        getSegmentStream: (req, cb) => {
            const filePath = __dirname + req.url;
            const stream = fs.createReadStream(filePath);
            stream.on('error', (err) => {
                console.error('Error reading segment:', err);
            });
            cb(null, stream);
        }
    }
});
