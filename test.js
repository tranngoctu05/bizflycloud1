const puppeteer = require('puppeteer');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

//bizcloud infomation
const bucketName = 'testbizflycloud';
const AWS_ACCESS_KEY_ID = 'FN4GTMI90EG1CQHSDGND'
const AWS_SECRET_ACCESS_KEY = 'IBfXEGy9ZfDdMKi7DrktxBtYMi8NUAPAelMG2v34'
let trackID = 201;
const folderName = `track_${trackID}`;
const currentDate = new Date().toISOString('vi-VN').split('T')[0];

const s3Folder = `${folderName}/${currentDate}`;

//connect to s3
const s3 = new S3Client({
    region: 'hn',
    endpoint: 'https://hn.ss.bfcplatform.vn',
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    },
});
async function getPlaylistFromS3(bucketName, s3Folder) {
    const playlistKey = `${s3Folder}/playlist.m3u8`;
    console.log('start')
    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: playlistKey
        });
        const response = await s3.send(command);
        console.log(response)
        const data = await streamToString(response.Body);
        console.log(data)
        return data;

    } catch (err) {
        console.log(err)
        if (err.name === 'NoSuchKey') {
            return [
                '#EXTM3U',
                '#EXT-X-VERSION:3',
                '#EXT-X-TARGETDURATION:10',
                '#EXT-X-MEDIA-SEQUENCE:0',
                '#EXT-X-PLAYLIST-TYPE:EVENT'
            ].join('\n') + '\n';
        } else {
            throw err;
        }
    }
}
function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
    });
}
async function getLastUploadedFile(bucketName, s3Folder) {
    try {
        const listParams = { Bucket: bucketName, Prefix: s3Folder };
        const data = await s3.send(new ListObjectsV2Command(listParams));
        if (data.Contents.length === 0) {
            console.log('Không tìm thấy tệp tin nào trong thư mục S3.');
            return null;
        }
        const sortedFiles = data.Contents.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
        const lastFile = sortedFiles[0];
        console.log(`Tệp tin mới nhất: ${lastFile.Key}`);
        return lastFile.Key;
    } catch (err) {
        console.log('Chưa có thư mục:');
        return null;
    }
}
async function downloadVideo(downloadURL, cookies, outputDir, fileName) {
    try {
        const startTime = Date.now();
        const videoResponse = await axios({
            url: downloadURL,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'Accept': '*/*',
                'Connection': 'keep-alive',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                'Cookie': cookies
            }
        });

        const filePath = path.join(outputDir, fileName);
        const writer = fs.createWriteStream(filePath);
        videoResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const endTime = Date.now();
        const downloadTime = (endTime - startTime) / 1000;

        console.log(`Tải video trong ${downloadTime} giây`);

        return filePath;
    } catch (error) {
        console.error(`Error downloading video: ${error}`);
        throw error;
    }
}
async function uploadDirectoryToS3(bucketName, folderPath, s3Folder) {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        const s3Path = path.join(s3Folder, file).replace(/\\/g, '/');

        if (fs.statSync(filePath).isFile()) {
            try {
                const fileStream = fs.createReadStream(filePath);
                const uploadParams = {
                    Bucket: bucketName,
                    Key: s3Path,
                    Body: fileStream,
                    ContentType: 'video/mp2t'
                };

                await s3.send(new PutObjectCommand(uploadParams));
                console.log(`Uploaded ${file} to ${s3Path}`);
            } catch (err) {
                console.error(`Error uploading ${file}: ${err}`);
            }
        } else if (fs.statSync(filePath).isDirectory()) {
            await uploadDirectoryToS3(bucketName, filePath, path.join(s3Folder, file));
        }
    }
}
async function getToken() {
    let browser;
    browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],

    });
    const page = await browser.newPage();
    await page.goto('http://113.161.166.85:81/doc/page/login.asp?_1724463823167', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#username', { visible: true });
    await page.waitForSelector('#password', { visible: true });
    await page.type('#username', 'admin');
    await page.type('#password', 'anhnhat27');
    await page.waitForSelector('.login-btn', { visible: true });
    await page.evaluate(() => {
        document.querySelector('.login-btn').click();
    });
    const cookieResponse = await page.waitForResponse(response => response.url().includes('sessionLogin?timeStamp') && response.status() === 200);
    const headers = cookieResponse.headers();
    const setCookieHeader = headers['set-cookie'];
    await browser.close();
    if (setCookieHeader) {
        return setCookieHeader.split(',').map(cookie => {
            ``
            const cookieParts = cookie.split(';');
            return cookieParts[0].trim();
        }).join('; ');

    } else {
        throw new Error('No cookies found');
    }
}
async function segmentVideo(filePath, startTime, currentDate) {
    const segmentDuration = 10;
    const outputDir = path.join(__dirname, 'output', currentDate);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        ffmpeg(filePath)
            .output(path.join(outputDir, 'segment_%d.ts'))
            .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-map 0',
                '-preset faster',
                '-f segment',
                `-segment_time ${segmentDuration}`,
                '-reset_timestamps 1',
            ])
            .on('start', () => {
                console.log('Bắt đầu phân đoạn video...');
            })
            .on('end', async () => {
                console.log('Hoàn tất phân đoạn video!');

                let playlistContent = await getPlaylistFromS3(bucketName, s3Folder);

                fs.readdir(outputDir, (err, files) => {
                    if (err) {
                        return reject(err);
                    }

                    const tsFiles = files.filter(file => file.endsWith('.ts'));
                    tsFiles.sort();

                    const playlistLines = playlistContent.split('\n');
                    const headerLines = [
                        '#EXTM3U',
                        '#EXT-X-VERSION:3',
                        '#EXT-X-TARGETDURATION:10',
                        '#EXT-X-MEDIA-SEQUENCE:0',
                        '#EXT-X-PLAYLIST-TYPE:EVENT'
                    ];
                    headerLines.forEach(header => {
                        if (!playlistLines.includes(header)) {
                            playlistLines.unshift(header);
                        }
                    });

                    tsFiles.forEach((file) => {
                        const newFileName = `stream_${startTime}.ts`;
                        const oldPath = path.join(outputDir, file);
                        const newPath = path.join(outputDir, newFileName);

                        fs.renameSync(oldPath, newPath);

                        playlistLines.push(`#EXTINF:${segmentDuration},`);
                        playlistLines.push(newFileName);

                        startTime += segmentDuration;
                    });
                    fs.writeFileSync(path.join(outputDir, 'playlist.m3u8'), playlistLines.join('\n'));
                    resolve();
                });
            })
            .on('error', (err) => {
                console.error('Lỗi:', err.message);
                reject(err);
            })
            .run();
    });
}
function convertStartTime(startTimeStr) {
    const year = startTimeStr.slice(0, 4);
    const month = startTimeStr.slice(4, 6) - 1;
    const day = startTimeStr.slice(6, 8);
    const hours = startTimeStr.slice(9, 11);
    const minutes = startTimeStr.slice(11, 13);
    const seconds = startTimeStr.slice(13, 15);
    return new Date(year, month, day, hours, minutes, seconds).getTime() / 1000;
}
async function processVideos() {
    let cookies = await getToken();

    const xmlData = `<?xml version="1.0" encoding="utf-8"?>
        <CMSearchDescription>
          <searchID>CADFB719-1A60-0001-3B50-2B5E81D55C60</searchID>
          <trackList>
            <trackID>${trackID}</trackID>
          </trackList>
          <timeSpanList>
            <timeSpan>
              <startTime>${currentDate}T00:00:00Z</startTime>
              <endTime>${currentDate}T23:59:59Z</endTime>
            </timeSpan>
          </timeSpanList>
          <maxResults>50</maxResults>
          <searchResultPostion>0</searchResultPostion>
          <metadataList>
            <metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor>
          </metadataList>
        </CMSearchDescription>`;

    try {
        const response = await axios.post('http://113.161.166.85:81/ISAPI/ContentMgmt/search', xmlData, {
            headers: {
                'Content-Type': 'application/xml; charset=UTF-8',
                'Accept': 'application/xml',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'max-age=0',
                'Cookie': cookies,
                'Host': '113.161.166.85:81',
                'Origin': 'http://113.161.166.85:81',
                'Referer': 'http://113.161.166.85:81/doc/page/download.asp?fileType=record&date=2024-08-27',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const parser = new xml2js.Parser();
        parser.parseString(response.data, async (err, result) => {
            if (err) {
                console.error('Error parsing XML:', err);
            } else {
                const matchList = result['CMSearchResult']['matchList'][0]['searchMatchItem'];
                const playbackURIs = matchList.map(item => item['mediaSegmentDescriptor'][0]['playbackURI'][0]);

                const downloadBaseURL = 'http://admin:anhnhat27@113.161.166.85:81/ISAPI/ContentMgmt/download?playbackURI=';


                console.log(currentDate)

                const lastFileKey = await getLastUploadedFile(bucketName, s3Folder);

                let newPlaybackURIs;

                if (lastFileKey) {
                    console.log(lastFileKey)
                    const match = lastFileKey.match(/stream_(\d+)\.ts$/);
                    const timestamp = match ? match[1] : null;
                    const trimmedPlaybackURIs = playbackURIs.slice(0, -1);

                    const oneMinuteInSeconds = 60;
                    const matchedIndex = trimmedPlaybackURIs.reduce((closestIndex, url, index) => {
                        const isoStartTime = url.match(/starttime=(\d{8}T\d{6}Z)/)[1];
                        const unixTimestamp = convertStartTime(isoStartTime);
                        console.log('unix', unixTimestamp)
                        const difference = Math.abs(unixTimestamp - parseInt(timestamp, 10));
                        console.log(difference)
                        if (difference <= oneMinuteInSeconds && (closestIndex === -1 || difference < closestDifference)) {
                            closestIndex = index;
                            closestDifference = difference;
                        }

                        return closestIndex;
                    }, -1);

                    if (matchedIndex === -1) {
                        newPlaybackURIs = [...trimmedPlaybackURIs];
                    } else {
                        newPlaybackURIs = trimmedPlaybackURIs.slice(matchedIndex);
                    }
                } else {
                    newPlaybackURIs = playbackURIs.slice(0, -1);
                }
                console.log(newPlaybackURIs);
                for (const [index, uri] of newPlaybackURIs.entries()) {
                    try {
                        const parsedUrl = new URL(uri);
                        const startTimeParam = parsedUrl.searchParams.get('starttime');
                        const startTime = convertStartTime(startTimeParam);
                        const downloadURL = `${downloadBaseURL}${uri}`;
                        const fileName = `video_${index + 1}.mp4`;

                        const outputDirDownload = path.join(__dirname, folderName);
                        if (!fs.existsSync(outputDirDownload)) {
                            fs.mkdirSync(outputDirDownload, { recursive: true });
                        }

                        let cookiesDow = await getToken();
                        console.log('Start download');

                        const filePath = await downloadVideo(downloadURL, cookiesDow, outputDirDownload, fileName);
                        console.log('Start segment');

                        await segmentVideo(filePath, startTime, currentDate);
                        fs.unlinkSync(filePath);

                        const folderPath = path.join(__dirname, `output/${currentDate}`);
                        await uploadDirectoryToS3(bucketName, folderPath, s3Folder);
                        console.log('Upload thư mục lên S3 thành công!');

                        fs.rmSync(folderPath, { recursive: true, force: true });
                        console.log('Đã xóa file phân đoạn');

                    } catch (error) {
                        console.error(`Error processing video ${index + 1}:`, error);
                    }
                }

            }
        });
    } catch (error) {
        console.error('Error:', error);
    }
};
setInterval(processVideos, 8000000);

// processVideos();
getPlaylistFromS3(bucketName, s3Folder)

