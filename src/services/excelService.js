const XLSX = require('xlsx');
const db = require('../config/db');

// Parse the Excel file and insert data into the respective tables
exports.parseAndInsertExcel = async (filePath) => {
  // Read the Excel file
  const workbook = XLSX.readFile(filePath);

  // Get the first sheet (or you can loop through sheets)
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert the sheet to JSON
  let data = XLSX.utils.sheet_to_json(sheet);
  data = preprocessFieldNames(data);

  console.log(data,"??????????????????????????");
  return

  // Loop through the rows and insert data into respective tables
  for (const row of data) {
    const { id, name, email, role } = row; // Assuming these fields exist in your Excel

    // Insert data into the table
    const sql = `
      INSERT INTO users (user_id, username, email, role) 
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE username = VALUES(username), email = VALUES(email), role = VALUES(role);
    `;

    const params = [id, name, email, role];

    try {
      await db.execute(sql, params);
    } catch (err) {
      throw new Error(`Error inserting data: ${err.message}`);
    }
  }
};

const preprocessFieldNames = (data) => {
    return data.map(row => {
      const newRow = {};
      for (const key in row) {
        let newKey = key.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        newRow[newKey] = row[key];
      }
      return newRow;
    });
  };
