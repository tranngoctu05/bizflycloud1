const puppeteer = require('puppeteer');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { uploadToS3, uploadDirectoryToS3 } = require('./s3Uploader');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadVideo(uri, downloadURL, cookies, outputDir, fileName) {
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
async function getToken() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://113.161.166.85:81/doc/page/login.asp?_1724463823167', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#username', { visible: true });
    await page.waitForSelector('#password', { visible: true });
    await page.waitForSelector('.login-btn', { visible: true });
    await page.type('#username', 'admin');
    await page.type('#password', 'anhnhat27');
    await page.click('.login-btn');

    const cookieResponse = await page.waitForResponse(response => response.url().includes('sessionLogin?timeStamp') && response.status() === 200);
    await browser.close();

    const headers = cookieResponse.headers();
    const setCookieHeader = headers['set-cookie'];

    if (setCookieHeader) {
        return setCookieHeader.split(',').map(cookie => {
            const cookieParts = cookie.split(';');
            return cookieParts[0].trim();
        }).join('; ');
    } else {
        throw new Error('No cookies found');
    }
}
async function segmentVideo(filePath, startTime) {
    const segmentDuration = 10;
    const currentDate = new Date().toISOString().split('T')[0];
    const outputDir = path.join(__dirname, 'output', currentDate);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        ffmpeg(filePath)
            .output(path.join(outputDir, `stream_${startTime}_%03d.ts`))
            .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-map 0',
                '-f segment',
                `-segment_time ${segmentDuration}`,
                '-reset_timestamps 1'
            ])
            .on('start', () => {
                console.log('Bắt đầu phân đoạn video...');
            })
            .on('end', () => {
                console.log('Hoàn tất phân đoạn video!');

                // Tạo file playlist.m3u8
                const playlistFilePath = path.join(outputDir, 'playlist.m3u8');
                fs.readdir(outputDir, (err, files) => {
                    if (err) {
                        return reject(err);
                    }

                    const tsFiles = files.filter(file => file.endsWith('.ts'));

                    tsFiles.sort();
                    const playlistContent = [
                        '#EXTM3U',
                        '#EXT-X-VERSION:3',
                        '#EXT-X-TARGETDURATION:10',
                        '#EXT-X-MEDIA-SEQUENCE:0',
                        '#EXT-X-PLAYLIST-TYPE:EVENT',
                        ...tsFiles.map((file, index) => `#EXTINF:${segmentDuration},\n${file}`)
                    ].join('\n');

                    fs.writeFileSync(playlistFilePath, playlistContent);

                    startTime += segmentDuration;

                    resolve(startTime);
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
const runMain = async () => {
    let cookies = await getToken();
    let trackID = 201;
    const xmlData = `<?xml version="1.0" encoding="utf-8"?>
        <CMSearchDescription>
          <searchID>CADFB719-1A60-0001-3B50-2B5E81D55C60</searchID>
          <trackList>
            <trackID>${trackID}</trackID>
          </trackList>
          <timeSpanList>
            <timeSpan>
              <startTime>2024-08-30T00:00:00Z</startTime>
              <endTime>2024-08-31T23:59:59Z</endTime>
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
                console.log('Playback URL:', playbackURIs);
                const downloadBaseURL = 'http://admin:anhnhat27@113.161.166.85:81/ISAPI/ContentMgmt/download?playbackURI=';

                for (const [index, uri] of playbackURIs.entries()) {
                    const parsedUrl = new URL(uri);
                    const startTimeParam = parsedUrl.searchParams.get('starttime');
                    const startTime = convertStartTime(startTimeParam);
                    console.log('Start time:', startTime);
                    const downloadURL = `${downloadBaseURL}${uri}`;
                    console.log('Download URL:', downloadURL);

                    const fileName = `video_${index + 1}.mp4`;
                    const folderName = `track_${trackID}`;
                    const outputDirDowload = path.join(__dirname, folderName);

                    if (!fs.existsSync(outputDirDowload)) {
                        fs.mkdirSync(outputDirDowload, { recursive: true });
                    }
                    let cookiesDow = await getToken();
                    const filePath = await downloadVideo(uri, downloadURL, cookiesDow, outputDirDowload, fileName);
                    startTime = await segmentVideo(filePath, startTime);
                    fs.unlinkSync(filePath);
                    const s3Folder = new Date().toISOString().split('T')[0];
                    const bucketName = 'shajhdsa';
                    const folderPath = path.join(__dirname, `output/${currentDate}`);
                    await uploadDirectoryToS3(bucketName, folderPath, s3Folder);
                    console.log('Upload thư mục lên S3 thành công!');
                    fs.rmdirSync(folderPath, { recursive: true, force: true });
                    console.log('Đã xóa file phân đoạn');

                }
            }
        });
    } catch (error) {
        console.error('Error:', error);
    }
};
module.exports = {
    runMain
};