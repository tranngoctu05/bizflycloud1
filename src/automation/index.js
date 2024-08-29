const { scrapeData } = require('./scrapingService');

scrapeData()
    .then(() => console.log('Scraping completed and file uploaded successfully.'))
    .catch(error => console.error('Error during scraping and upload:', error));
