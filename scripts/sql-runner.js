// Chạy một file .sql qua mysql2, hiểu được lệnh DELIMITER của MySQL Workbench/CLI.
//
// mysql2 không biết DELIMITER (đó là lệnh của client, không phải của server),
// nên file được cắt thành từng đoạn:
//  - đoạn dùng dấu ';' được gửi nguyên khối (multipleStatements)
//  - đoạn dùng dấu khác (vd '$$', bao quanh trigger/procedure) được tách
//    theo dấu đó và gửi từng câu một.
const fs = require('fs');

function splitByDelimiter(sqlText) {
  const chunks = [];
  let delimiter = ';';
  let buffer = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) chunks.push({ delimiter, text });
    buffer = [];
  };

  for (const line of sqlText.split(/\r?\n/)) {
    const m = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) {
      flush();
      delimiter = m[1];
    } else {
      buffer.push(line);
    }
  }
  flush();

  const statements = [];
  for (const { delimiter: d, text } of chunks) {
    if (d === ';') {
      statements.push(text);
    } else {
      for (const part of text.split(d)) {
        if (part.trim()) statements.push(part.trim());
      }
    }
  }
  return statements;
}

async function runSqlFile(conn, filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  for (const stmt of splitByDelimiter(text)) {
    await conn.query(stmt);
  }
}

module.exports = { runSqlFile, splitByDelimiter };
