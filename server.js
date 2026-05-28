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
  const campus = req.query.campus;

  const data = fs.readFileSync('./data/restaurants.json', 'utf8');
  const restaurants = JSON.parse(data);

  const filtered = campus
    ? restaurants.filter(r => r.campus.includes(campus))
    : restaurants;

  res.json(filtered);
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

// ────────────────────────────────────────
//  工具：讀寫 friendships.json
// ────────────────────────────────────────
function readFriendships() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'friendships.json'), 'utf8'));
  } catch {
    return { requests: [], friends: [] };
  }
}
function writeFriendships(data) {
  fs.writeFileSync(
    path.join(__dirname, 'data', 'friendships.json'),
    JSON.stringify(data, null, 2), 'utf8'
  );
}

// ────────────────────────────────────────
//  API：送出好友邀請
//  POST /api/friend-request
//  body: { from, fromName, to }
// ────────────────────────────────────────
app.post('/api/friend-request', (req, res) => {
  const { from, fromName, to } = req.body;
  if (!from || !to) return res.status(400).json({ success: false, message: '缺少必要欄位' });
  if (from === to)  return res.status(400).json({ success: false, message: '不能加自己為好友' });

  // 確認對方學號存在
  const users = readJSON('users.json');
  const target = users.find(u => u.sid === to);
  if (!target) return res.status(404).json({ success: false, message: '找不到此學號的使用者' });

  const db = readFriendships();

  // 已經是好友？
  const alreadyFriends = db.friends.some(f =>
    (f.user1 === from && f.user2 === to) || (f.user1 === to && f.user2 === from)
  );
  if (alreadyFriends) return res.status(409).json({ success: false, message: '你們已經是好友了' });

  // 已有待處理的邀請？
  const duplicate = db.requests.some(r => r.from === from && r.to === to);
  if (duplicate) return res.status(409).json({ success: false, message: '邀請已送出，等待對方確認' });

  db.requests.push({
    id: Date.now(),
    from,
    fromName: fromName || from,
    to,
    time: new Date().toISOString()
  });
  writeFriendships(db);
  res.json({ success: true, message: '好友邀請已送出！' });
});

// ────────────────────────────────────────
//  API：查詢我收到的邀請（前端輪詢用）
//  GET /api/friend-requests/:sid
// ────────────────────────────────────────
app.get('/api/friend-requests/:sid', (req, res) => {
  const db = readFriendships();
  const incoming = db.requests.filter(r => r.to === req.params.sid);
  res.json(incoming);
});

// ────────────────────────────────────────
//  API：接受好友邀請
//  POST /api/friend-request/accept
//  body: { requestId }
// ────────────────────────────────────────
app.post('/api/friend-request/accept', (req, res) => {
  const { requestId } = req.body;
  const db = readFriendships();
  const idx = db.requests.findIndex(r => r.id === Number(requestId));
  if (idx === -1) return res.status(404).json({ success: false, message: '找不到邀請' });

  const req_ = db.requests[idx];
  db.friends.push({
    user1: [req_.from, req_.to].sort()[0],
    user2: [req_.from, req_.to].sort()[1],
    since: new Date().toISOString()
  });
  db.requests.splice(idx, 1);
  writeFriendships(db);
  res.json({ success: true });
});

// ────────────────────────────────────────
//  API：拒絕好友邀請
//  POST /api/friend-request/decline
//  body: { requestId }
// ────────────────────────────────────────
app.post('/api/friend-request/decline', (req, res) => {
  const { requestId } = req.body;
  const db = readFriendships();
  const idx = db.requests.findIndex(r => r.id === Number(requestId));
  if (idx === -1) return res.status(404).json({ success: false, message: '找不到邀請' });
  db.requests.splice(idx, 1);
  writeFriendships(db);
  res.json({ success: true });
});

// ────────────────────────────────────────
//  API：取得好友清單
//  GET /api/friends/:sid
// ────────────────────────────────────────
app.get('/api/friends/:sid', (req, res) => {
  const sid = req.params.sid;
  const db  = readFriendships();
  const users = readJSON('users.json');

  const friendSids = db.friends
    .filter(f => f.user1 === sid || f.user2 === sid)
    .map(f => f.user1 === sid ? f.user2 : f.user1);

  const friendList = friendSids.map(fsid => {
    const u = users.find(u => u.sid === fsid);
    return u ? { sid: u.sid, name: u.name, dept: u.dept } : { sid: fsid, name: fsid, dept: '' };
  });

  res.json(friendList);
});

// ────────────────────────────────────────
//  工具：讀寫 groups.json
// ────────────────────────────────────────
function readGroups() {
  try { return JSON.parse(fs.readFileSync('./data/groups.json', 'utf8')); }
  catch { return { groups: [] }; }
}
function writeGroups(data) {
  fs.writeFileSync('./data/groups.json', JSON.stringify(data, null, 2));
}

// 取得某使用者的所有揪團
app.get('/api/groups/user/:sid', (req, res) => {
  const db = readGroups();
  const list = db.groups.filter(g => g.members.includes(req.params.sid));
  res.json(list);
});

// 建立揪團
app.post('/api/groups', (req, res) => {
  const { name, rest, creator, creatorName, memberSids, durHours } = req.body;
  const db = readGroups();
  const id = Date.now();
  const members = [creator, ...(memberSids || []).filter(s => s !== creator)];
  db.groups.push({
    id, name, rest: rest || '', creator, members,
    exp: Date.now() + (durHours || 2) * 3600000,
    messages: [{ sid: 'system', name: '系統',
      text: `「${name}」已建立，${durHours || 2}小時後自動解散 🌿`,
      time: new Date().toISOString() }]
  });
  writeGroups(db);
  res.json({ success: true, id });
});

// 取得揪團訊息
app.get('/api/groups/:id/messages', (req, res) => {
  const db = readGroups();
  const g = db.groups.find(g => g.id === Number(req.params.id));
  if (!g) return res.status(404).json([]);
  res.json(g.messages);
});

// 送出訊息
app.post('/api/groups/:id/messages', (req, res) => {
  const { sid, name, text } = req.body;
  const db = readGroups();
  const g = db.groups.find(g => g.id === Number(req.params.id));
  if (!g) return res.status(404).json({ success: false });
  g.messages.push({ sid, name, text, time: new Date().toISOString() });
  writeGroups(db);
  res.json({ success: true });
});

// 所有其他路徑都回傳 index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ 伺服器啟動成功！請打開瀏覽器前往：http://localhost:${PORT}`);
});