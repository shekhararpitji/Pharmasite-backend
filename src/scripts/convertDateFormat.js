const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { parse } = require('json2csv');

// === CONFIG ===
const inputFilePath = 'C:/Projects/Arpit/Pharmasite-backend/export_data.csv'; // your original file
const outputFilePath = './export_data_cleaned.csv'; // new output file
const dateColumn = 'created_at'; // change this to your actual column name

const rows = [];

// Step 1: Read and transform the CSV
fs.createReadStream(path.resolve(inputFilePath))
  .pipe(csv())
  .on('data', (row) => {
    if (row[dateColumn]) {
      // Convert "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DD"
      row[dateColumn] = row[dateColumn].split(' ')[0];
    }
    rows.push(row);
  })
  .on('end', () => {
    try {
      const csvOutput = parse(rows);
      fs.writeFileSync(outputFilePath, csvOutput);
      console.log(`✅ Date format conversion done. Saved to ${outputFilePath}`);
    } catch (err) {
      console.error('Error converting back to CSV:', err);
    }
  });
