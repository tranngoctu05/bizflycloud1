const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { S3Client,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const { URL } = require('url');
const ffmpegPath = 'D:\\ffmpeg-7.0.2-essentials_build\\ffmpeg-7.0.2-essentials_build\\bin\\ffmpeg.exe';
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const upload = multer({ storage: multer.memoryStorage() });
const s3 = new S3Client({
    region: 'hn', // Sửa lại region
    endpoint: 'https://hn.ss.bfcplatform.vn',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
});

const downloadFileFromRTSP = (url, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(url)
            .output(outputPath)
            .on('end', () => {
                console.log(`Finished processing ${outputPath}`);
                resolve();
            })
            .on('error', (err) => {
                console.error('Error processing video:', err);
                reject(err);
            })
            .run();
    });
};

const getFileNameFromUrl = (url) => {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    return params.get('name') || 'default.mp4';
};

const extractDateFromUri = (uri) => {
    const parsedUrl = new URL(uri);
    const startTime = parsedUrl.searchParams.get('starttime');
    if (!startTime) {
        throw new Error('No starttime parameter found in URI');
    }
    const date = startTime.split('T')[0];
    const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

    return formattedDate;
};

const uploadToCloud = async (trackData) => {


    // for (const [trackID, urls] of Object.entries(filteredResult)) {
    //     for (const url of urls) {
    //         const date = extractDateFromUri(url);
    //         const fileName = getFileNameFromUrl(url);
    //         const folderPrefix = `${trackID}/${date}/`;
    //         const tempFilePath = path.join(__dirname, fileName);
    //         const s3Key = folderPrefix + fileName;

    //         try {
    //             console.log(`Downloading file from ${url}`);
    //             await downloadFileFromRTSP(url, tempFilePath);

    //             console.log(`Uploading file ${fileName} to S3`);
    //             await uploadFileToS3(tempFilePath, s3Key);

    //             fs.unlinkSync(tempFilePath);
    //         } catch (error) {
    //             console.error(`Error processing file ${fileName}:`, error);
    //             if (fs.existsSync(tempFilePath)) {
    //                 fs.unlinkSync(tempFilePath);
    //             }
    //         }
    //     }
    // }
};

const uploadFileToS3 = async (tempFilePath, s3Key) => {
    const fileStream = fs.createReadStream(tempFilePath);
    const bucketName = 'testlaine';
    const partSize = 1024 * 1024 * 5;
    const fileSize = fs.statSync(tempFilePath).size;
    const numParts = Math.ceil(fileSize / partSize);

    const createMultipartUploadCommand = new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: s3Key,
    });
    const multipart = await s3.send(createMultipartUploadCommand);
    const uploadId = multipart.UploadId;

    const uploadPart = async (partNumber, partStream) => {
        const uploadPartCommand = new UploadPartCommand({
            Bucket: bucketName,
            Key: s3Key,
            PartNumber: partNumber,
            UploadId: uploadId,
            Body: partStream,
        });

        const data = await s3.send(uploadPartCommand);
        return { ETag: data.ETag, PartNumber: partNumber };
    };

    const parts = [];
    for (let partNumber = 1; partNumber <= numParts; partNumber++) {
        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, fileSize);
        const partStream = fileStream.read(end - start);

        console.log(`Uploading part ${partNumber}`);
        const part = await uploadPart(partNumber, partStream);
        parts.push(part);
    }

    const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: s3Key,
        MultipartUpload: { Parts: parts },
        UploadId: uploadId,
    });

    await s3.send(completeMultipartUploadCommand);
    console.log(`File ${s3Key} uploaded successfully`);
};

module.exports = { uploadToCloud };
