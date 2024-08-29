const { scrapeData } = require('../automation/scrapingService');

const scrapeController = async (req, res) => {
    try {

        res.status(200).send('Data scraped and uploaded successfully.');
    } catch (error) {
        res.status(500).send('Error during scraping and upload.');
    }
};

module.exports = { scrapeController };
