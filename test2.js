const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Cấu hình đường dẫn đến ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Tên file video gốc
const inputVideo = '/00000001438000000.mp4';

// Lấy ngày hiện tại và định dạng thành YYYY-MM-DD
const currentDate = new Date().toISOString().split('T')[0];

// Tạo đường dẫn thư mục theo ngày hiện tại
const outputDir = path.join(__dirname, 'output', currentDate);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Thời gian bắt đầu cắt (theo giây từ Unix epoch)
let startTime = Math.floor(Date.now() / 1000);
const segmentDuration = 10;

ffmpeg(inputVideo)
  .output(path.join(outputDir, 'segment_%d.ts')) 
  .outputOptions([
    '-c copy',
    '-map 0',
    '-f segment',
    `-segment_time ${segmentDuration}`,
    '-reset_timestamps 1'
  ])
  .on('start', () => {
    console.log('Bắt đầu chia video...');
  })
  .on('end', () => {
    console.log('Chia nhỏ video thành công!');
    
    fs.readdir(outputDir, (err, files) => {
      if (err) {
        return console.error('Có lỗi khi đọc thư mục:', err);
      }
      
      files.forEach((file, index) => {
        const oldPath = path.join(outputDir, file);
        const newPath = path.join(outputDir, `stream_${startTime}.ts`);
        fs.renameSync(oldPath, newPath);
        startTime += segmentDuration;
      });
    });
  })
  .on('error', (err) => {
    console.error('Có lỗi xảy ra: ', err.message);
  })
  .run();
