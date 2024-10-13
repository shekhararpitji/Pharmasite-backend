const XLSX = require('xlsx');
const db = require('../config/db');

exports.parseAndInsertExcel = async (filePath) => {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  let data = XLSX.utils.sheet_to_json(sheet);
  data = preprocessFieldNames(data);

  console.log(data,"??????????????????????????");
  return


  for (const row of data) {
    const { id, name, email, role } = row; 

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
