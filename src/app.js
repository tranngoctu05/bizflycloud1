require('dotenv').config();  // Đảm bảo dotenv được tải đầu tiên
const path = require('path');
const express = require('express');
const fs = require('fs');
const hls = require('hls-server');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.get('/', (req, res) => {
    res.render('index');
});
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, '../views'));
app.use(function (err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;