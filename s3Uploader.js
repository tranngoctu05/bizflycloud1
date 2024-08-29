const fs = require('fs');
const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3');

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
async function uploadDirectoryToS3(bucketName, folderPath, s3Folder) {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        const s3Path = path.join(s3Folder, file);

        if (fs.statSync(filePath).isFile()) {
            try {
                const fileStream = fs.createReadStream(filePath);
                const uploadParams = {
                    Bucket: bucketName,
                    Key: s3Path,
                    Body: fileStream,
                    ContentType: 'video/mp2t' 
                };

                await s3.upload(uploadParams).promise();
                console.log(`Uploaded ${file} to ${s3Path}`);
            } catch (err) {
                console.error(`Error uploading ${file}: ${err}`);
            }
        }
    }
}
module.exports = { uploadToS3, uploadDirectoryToS3 };
