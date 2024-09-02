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