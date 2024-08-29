require('dotenv').config();  // Đảm bảo dotenv được tải đầu tiên
const path = require('path');
const express = require('express');
const fs = require('fs');
const hls = require('hls-server');

const app = express();
const port = process.env.PORT || 3000;  // Cài đặt cổng mặc định hoặc lấy từ biến môi trường

app.use(express.json());
app.get('/', (req, res) => {
    return res.status(200).sendFile(`${__dirname}/client.html`);
});

app.use(function (err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

app.use(express.static(path.join(__dirname, './../output/2024-08-28')));


module.exports = app;  // Chỉ export ứng dụng Express, không khởi tạo server tại đây
