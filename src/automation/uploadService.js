const { runMain } = require('./../../test')

const runScrapingAndUpload = async () => {
    try {

        await runMain();

    } catch (error) {
        console.error('Error during scraping or upload:', error);
    }

};

// setInterval(runScrapingAndUpload, 3600000);
module.exports = {
    runScrapingAndUpload
};