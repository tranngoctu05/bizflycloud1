const { createBrowser } = require('./brower');
const xml2js = require('xml2js');

const FormData = require('form-data');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const s3 = new S3Client({
    region: 'hn',
    endpoint: 'https://hn.ss.bfcplatform.vn',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
});

const uploadToS3 = async (filePath, folderName, fileName) => {
    const fileBuffer = fs.readFileSync(filePath);
    const bucketName = 'testlaine';
    const partSize = 1024 * 1024 * 5;
    let partNum = 0;
    let numPartsLeft = Math.ceil(fileBuffer.length / partSize);
    const multipartMap = { Parts: [] };

    const startTime = new Date();
    const dateFolder = new Date().toISOString().split('T')[0];

    const cloudFilePath = `${folderName}/${dateFolder}/${fileName}.mp4`;

    const createMultipartUploadCommand = new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: cloudFilePath,
        ContentType: 'video/mp4',
    });

    const multipart = await s3.send(createMultipartUploadCommand);

    const completeMultipartUpload = async (uploadId) => {
        const doneParams = {
            Bucket: bucketName,
            Key: cloudFilePath,
            MultipartUpload: multipartMap,
            UploadId: uploadId,
        };

        const completeCommand = new CompleteMultipartUploadCommand(doneParams);
        await s3.send(completeCommand);
        const delta = (new Date() - startTime) / 1000;
        console.log('Hoàn thành upload', delta, 'giây');
    };

    const uploadPart = async (partNum, bufferSlice, uploadId) => {
        const partParams = {
            Bucket: bucketName,
            Key: cloudFilePath,
            PartNumber: partNum,
            UploadId: uploadId,
            Body: bufferSlice,
        };

        const uploadPartCommand = new UploadPartCommand(partParams);
        const data = await s3.send(uploadPartCommand);

        multipartMap.Parts[partNum - 1] = {
            ETag: data.ETag,
            PartNumber: partNum,
        };
        if (--numPartsLeft === 0) {
            await completeMultipartUpload(multipart.UploadId);
        }
    };

    for (let rangeStart = 0; rangeStart < fileBuffer.length; rangeStart += partSize) {
        partNum++;
        const end = Math.min(rangeStart + partSize, fileBuffer.length);
        const bufferSlice = fileBuffer.slice(rangeStart, end);

        console.log('Đang upload phần:', partNum);
        await uploadPart(partNum, bufferSlice, multipart.UploadId);
    }
};

const scrapeData = async () => {
    const browser = await createBrowser();
    const page = await browser.newPage();

    await page.goto('http://113.161.166.85:81/doc/page/login.asp?_1724463823167', { waitUntil: 'networkidle2' });
    await page.type('#username', 'admin');
    await page.type('#password', 'anhnhat27');
    await page.waitForSelector('.login-btn', { visible: true });
    await page.click('.login-btn');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    await page.evaluate(() => {
        const playbackButton = document.querySelector('li[ng-show="bSptCmRecord"] a[ng-click="jumpTo(\'playback\')"]');
        if (playbackButton) {
            playbackButton.click();
        }
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    const [newPage] = await Promise.all([
        new Promise(resolve => browser.once('targetcreated', target => resolve(target.page()))),
        page.click('button.btn[title="Download"]')
    ]);
    await newPage.waitForFunction('document.readyState === "complete"');

    let requestHeaders;
    await newPage.setRequestInterception(true);
    newPage.on('request', request => {
        if (request.url().includes('download?playbackURI=')) {
            requestHeaders = request.headers();
            request.continue();
        } else {
            request.continue();
        }
    });

    await newPage.waitForSelector('#channelLink', { visible: true });
    const options = await newPage.$$eval('#channelLink option', options => options.map(option => option.value));
    await sleep(2000);

    for (let i = 0; i < options.length; i++) {
        try {
            await newPage.select('#channelLink', options[i]);
            await newPage.waitForSelector('div[ng-show="bDownLoadByFile"] button.search-btn', { visible: true });
            await newPage.click('div[ng-show="bDownLoadByFile"] button.search-btn');
            await sleep(3000);

            const lastCheckbox = await newPage.$('.table-row:nth-last-of-type(2) input[type="checkbox"]');
            if (lastCheckbox) {
                await lastCheckbox.click();
                await newPage.click('button.btn[ng-click="startDownload()"]');

                try {
                    const downloadResponse = await newPage.waitForResponse(response => response.url().includes('download?playbackURI=') && response.status() === 200);
                    const downloadUrl = downloadResponse.url();
                    const trackID = downloadUrl.match(/tracks\/(\d+)/)[1];
                    const fileName = downloadUrl.match(/name=([^&]+)/)[1];

                    const outputPath = path.join(__dirname, 'temp-file.mp4');
                    const downloadPromise = axios({
                        url: downloadUrl,
                        method: 'GET',
                        responseType: 'stream',
                        headers: {
                            'Accept': '*/*',
                            'Connection': 'keep-alive',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                            'Cookie': requestHeaders.cookie
                        }
                    });

                    const writer = fs.createWriteStream(outputPath);
                    const response = await downloadPromise;

                    response.data.pipe(writer);

                    const downloadCompletePromise = new Promise((resolve, reject) => {
                        writer.on('finish', async () => {
                            console.log('Tải file thành công:', outputPath);

                            try {
                                // Gọi hàm upload trực tiếp vào S3
                                await uploadToS3(outputPath, trackID, fileName);
                                fs.unlinkSync(outputPath);
                                console.log('File đã được xóa:', outputPath);
                                resolve();
                            } catch (uploadError) {
                                reject(uploadError);
                            }
                        });

                        writer.on('error', (err) => {
                            reject(err);
                        });
                    });

                    await downloadCompletePromise;
                } catch (downloadError) {
                    console.error('Lỗi khi tải file:', downloadError);
                }
            } else {
                console.error('Không tìm thấy checkbox để chọn.');
            }
        } catch (error) {
            console.error('Lỗi khi xử lý tải xuống:', error);
        }
    }

    await browser.close();
};

module.exports = { scrapeData };
