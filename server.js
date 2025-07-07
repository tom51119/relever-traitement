// Application locale de relevés traitement (serveur + interface)

// Structure :
// - Server: Express (Node.js)
// - Front: HTML + JS + CSS (formulaire + historique)
// - Base: SQLite stocké localement

// --- server.js ---
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// DB init
const db = new sqlite3.Database('./releves.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS releves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    heure TEXT,
    operateur TEXT,
    poste TEXT,
    article TEXT,
    machine TEXT,
    traitement TEXT,
    data TEXT
  )`);
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enregistrement d'un relevé
app.post('/api/releve', (req, res) => {
  const { date, heure, operateur, poste, article, machine, traitement, data } = req.body;
  db.run(\`INSERT INTO releves (date, heure, operateur, poste, article, machine, traitement, data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
          [date, heure, operateur, poste, article, machine, traitement, JSON.stringify(data)],
          function(err) {
            if (err) return res.status(500).send(err.message);
            res.json({ success: true, id: this.lastID });
          });
});

// Lecture historique avec filtres
app.get('/api/historique', (req, res) => {
  const { date, machine, article } = req.query;
  let query = 'SELECT * FROM releves WHERE 1=1';
  const params = [];
  if (date) {
    query += ' AND date = ?';
    params.push(date);
  }
  if (machine) {
    query += ' AND machine = ?';
    params.push(machine);
  }
  if (article) {
    query += ' AND article LIKE ?';
    params.push(\`%\${article}%\`);
  }
  query += ' ORDER BY id DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data) })));
  });
});

// Suppression d’un relevé
app.delete('/api/releve/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM releves WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});

// Modification d’un relevé existant
app.put('/api/releve/:id', (req, res) => {
  const id = req.params.id;
  const { date, heure, operateur, poste, article, machine, traitement, data } = req.body;

  db.run(\`UPDATE releves
          SET date = ?, heure = ?, operateur = ?, poste = ?, article = ?, machine = ?, traitement = ?, data = ?
          WHERE id = ?\`,
    [date, heure, operateur, poste, article, machine, traitement, JSON.stringify(data), id],
    function (err) {
      if (err) return res.status(500).send(err.message);
      res.json({ success: true });
    });
});

// Export PDF ou Excel
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

app.get('/api/releve/:id/export', (req, res) => {
  const id = req.params.id;
  const type = req.query.type; // 'pdf' ou 'excel'

  db.get('SELECT * FROM releves WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).send("Relevé introuvable");

    const data = JSON.parse(row.data);

    if (type === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', \`attachment; filename=releve_\${id}.pdf\`);

      const doc = new PDFDocument();
      doc.pipe(res);

      const logoPath = path.join(__dirname, 'public/images/logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 450, 15, { width: 100 });
      }

      doc.fontSize(16).text('Relevé de traitement', { underline: true });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(\`Date : \${row.date}\`);
      doc.text(\`Heure : \${row.heure}\`);
      doc.text(\`Opérateur : \${row.operateur}\`);
      doc.text(\`Poste : \${row.poste}\`);
      doc.text(\`Article : \${row.article}\`);
      doc.text(\`Machine : \${row.machine}\`);
      doc.text(\`Traitement : \${row.traitement}\`);
      doc.moveDown();

      doc.text('Données :');
      Object.entries(data).forEach(([key, val]) => {
        doc.text(\` - \${key}: \${val}\`);
      });

      doc.end();
    } else if (type === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Relevé');

      const logoPath = path.join(__dirname, 'public/images/logo.png');
      if (fs.existsSync(logoPath)) {
        const imageId = workbook.addImage({
          filename: logoPath,
          extension: 'png',
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: 0 },
          ext: { width: 150, height: 60 },
        });
      }

      sheet.addRow([]);
      sheet.addRow(['Champ', 'Valeur']);
      sheet.addRow(['Date', row.date]);
      sheet.addRow(['Heure', row.heure]);
      sheet.addRow(['Opérateur', row.operateur]);
      sheet.addRow(['Poste', row.poste]);
      sheet.addRow(['Article', row.article]);
      sheet.addRow(['Machine', row.machine]);
      sheet.addRow(['Traitement', row.traitement]);

      sheet.addRow([]);
      sheet.addRow(['Données spécifiques']);
      for (const [k, v] of Object.entries(data)) {
        sheet.addRow([k, v]);
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', \`attachment; filename=releve_\${id}.xlsx\`);
      workbook.xlsx.write(res).then(() => res.end());
    } else {
      res.status(400).send("Type d'export non pris en charge");
    }
  });
});

// Route pour la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(\`Serveur en local sur http://localhost:\${PORT}\`);
});
