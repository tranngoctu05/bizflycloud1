const puppeteer = require('puppeteer');
const axios = require('axios');

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto('http://113.161.166.85:81/doc/page/login.asp?_1724463823167', { waitUntil: 'networkidle2' });
    await page.type('#username', 'admin');
    await page.type('#password', 'anhnhat27');
    await page.waitForSelector('.login-btn', { visible: true });
    await page.click('.login-btn');

    const cookieResponse = await page.waitForResponse(response => response.url().includes('sessionLogin?timeStamp') && response.status() === 200);
    await browser.close();
    const headers = cookieResponse.headers();
    const setCookieHeader = headers['set-cookie'];

    if (setCookieHeader) {
        // Phân tích từng cookie
        const cookies = setCookieHeader.split(',').map(cookie => {
            // Tách tên cookie và giá trị
            const [cookiePart] = cookie.split(';');
            return cookiePart.trim();
        });

        console.log('Cookies:', cookies);

        cookies.forEach(cookieStr => {
            const [nameValue, ...attrs] = cookieStr.split(';');
            const [name, value] = nameValue.split('=');

            console.log('Cookie Name:', name);
            console.log('Cookie Value:', value);

            let expires = null;
            let maxAge = null;

            attrs.forEach(attr => {
                const [key, val] = attr.trim().split('=');
                if (key === 'Expires') {
                    expires = new Date(val);
                    console.log('Expiry Date:', expires);
                    console.log('Time Until Expiry:', Math.max(0, expires.getTime() - Date.now()) / 1000, 'seconds');
                } else if (key === 'Max-Age') {
                    maxAge = parseInt(val, 10);
                    console.log('Max-Age:', maxAge);
                    console.log('Time Until Expiry:', maxAge, 'seconds');
                }
            });

            if (!expires && !maxAge) {
                console.log('No explicit expiry information found');
            }
        });
    } else {
        console.log('No cookies found');
    }
})();
