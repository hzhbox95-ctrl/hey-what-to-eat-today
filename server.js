const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 讓 Express 能讀取 JSON 格式的請求
app.use(express.json());

// 把 public 資料夾設為靜態網頁目錄
app.use(express.static(path.join(__dirname, 'public')));

// ── API：取得餐廳列表 ──
app.get('/api/restaurants', (req, res) => {
  const data = fs.readFileSync('./data/restaurants.json', 'utf8');
  res.json(JSON.parse(data));
});

// ── API：登入 ──
app.post('/api/login', (req, res) => {
  const { sid, password } = req.body;
  const users = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
  const user = users.find(u => u.sid === sid && u.password === password);
  if (user) {
    res.json({ success: true, user: { sid: user.sid, name: user.name, dept: user.dept, campus: user.campus } });
  } else {
    res.status(401).json({ success: false, message: '學號或密碼錯誤' });
  }
});

// ── API：註冊 ──
app.post('/api/register', (req, res) => {
  const { sid, name, password, dept, campus } = req.body;
  const users = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
  if (users.find(u => u.sid === sid)) {
    return res.status(400).json({ success: false, message: '此學號已被註冊' });
  }
  users.push({ sid, name, password, dept, campus });
  fs.writeFileSync('./data/users.json', JSON.stringify(users, null, 2));
  res.json({ success: true });
});

// ── API：回報問題 ──
app.post('/api/report', (req, res) => {
  const report = { ...req.body, time: new Date().toISOString() };
  let reports = [];
  try { reports = JSON.parse(fs.readFileSync('./data/reports.json', 'utf8')); } catch(e) {}
  reports.push(report);
  fs.writeFileSync('./data/reports.json', JSON.stringify(reports, null, 2));
  res.json({ success: true });
});

// 所有其他路徑都回傳 index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ 伺服器啟動成功！請打開瀏覽器前往：http://localhost:${PORT}`);
});