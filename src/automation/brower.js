const puppeteer = require('puppeteer');
const config = require('../config/puppeteerConfig');

let browser;

const createBrowser = async () => {
    const browser = await puppeteer.launch(config);
    return browser;
};

const closeBrowser = async () => {
    if (browser) {
        await browser.close();
        browser = null;
    }
};

module.exports = { createBrowser, closeBrowser };