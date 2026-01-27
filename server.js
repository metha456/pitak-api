require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_DATABASE_ID;
const ADMIN_KEY = process.env.ADMIN_KEY || 'pitak-admin-2026';
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ADMIN_LINE_ID = process.env.ADMIN_LINE_USER_ID;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${req.params.orderId}-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadDir));

async function sendLine(userId, msg) {
  if (!LINE_TOKEN || !userId) return false;
  try {
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: msg }] })
    });
    return r.ok;
  } catch (e) { return false; }
}

async function findOrder(id) {
  try {
    const r = await notion.databases.query({ 
      database_id: DB, 
      filter: { property: 'Order ID', title: { equals: id } } 
    });
    return r.results[0] || null;
  } catch (e) {
    console.error('Notion error:', e.message);
    return null;
  }
}

function parseOrder(p) {
  const props = p.properties;
  return {
    id: p.id,
    orderId: props['Order ID']?.title?.[0]?.plain_text || '',
    customerName: props['Customer']?.rich_text?.[0]?.plain_text || '',
    phone: props['Phone']?.rich_text?.[0]?.plain_text || '',
    amuletName: props['Amulet']?.rich_text?.[0]?.plain_text || '',
    quantity: props['Quantity']?.number || 0,
    price: props['Price']?.number || 0,
    total: props['Total']?.number || 0,
    status: props['Status']?.select?.name || 'pending',
    slipUrl: props['SlipUrl']?.url || null,
    lineUserId: props['LineUserId']?.rich_text?.[0]?.plain_text || null
  };
}

function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', version: '2C' } });
});

app.post('/api/orders', async (req, res) => {
  try {
    const { orderId, customerName, phone, amuletName, quantity, price, lineUserId } = req.body;
    if (!orderId || !customerName || !phone || !amuletName || !quantity || !price) {
      return res.status(400).json({ success: false, error: { message: 'ข้อมูลไม่ครบ' } });
    }
    const existing = await findOrder(orderId);
    if (existing) {
      return res.status(409).json({ success: false, error: { message: 'Order ซ้ำ' } });
    }
    const total = quantity * price;
    const props = {
      'Order ID': { title: [{ text: { content: orderId } }] },
      'Customer': { rich_text: [{ text: { content: customerName } }] },
      'Phone': { rich_text: [{ text: { content: phone } }] },
      'Amulet': { rich_text: [{ text: { content: amuletName } }] },
      'Quantity': { number: quantity },
      'Price': { number: price },
      'Total': { number: total },
      'Status': { select: { name: 'pending' } }
    };
    if (lineUserId) props['LineUserId'] = { rich_text: [{ text: { content: lineUserId } }] };
    await notion.pages.create({ parent: { database_id: DB }, properties: props });
    const msg = `🙏 สั่งจองสำเร็จ!\n\n📋 ${orderId}\n🎖️ ${amuletName} x${quantity}\n💰 ${total.toLocaleString()} บาท`;
    if (lineUserId) await sendLine(lineUserId, msg);
    if (ADMIN_LINE_ID) await sendLine(ADMIN_LINE_ID, `🆕 Order ใหม่\n${orderId}\n${customerName}\n${total} บาท`);
    res.status(201).json({ success: true, data: { orderId, status: 'pending' } });
  } catch (e) {
    res.status(500).json({ success: false, error: { message: e.message } });
  }
});

app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const p = await findOrder(req.params.orderId);
    if (!p) return res.status(404).json({ success: false, error: { message: 'Not found' } });
    res.json({ success: true, data: parseOrder(p) });
  } catch (e) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

app.get('/api/orders', adminAuth, async (req, res) => {
  try {
    const r = await notion.databases.query({ database_id: DB, sorts: [{ timestamp: 'created_time', direction: 'descending' }] });
    const orders = r.results.map(parseOrder);
    res.json({ success: true, data: { orders } });
  } catch (e) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

app.patch('/api/orders/:orderId/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: { message: 'Invalid status' } });
    const p = await findOrder(req.params.orderId);
    if (!p) return res.status(404).json({ success: false, error: { message: 'Not found' } });
    await notion.pages.update({ page_id: p.id, properties: { 'Status': { select: { name: status } } } });
    const order = parseOrder(p);
    const statusTh = { pending: 'รอตรวจสอบ', paid: 'ชำระแล้ว', shipped: 'จัดส่งแล้ว', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก' };
    if (order.lineUserId) await sendLine(order.lineUserId, `📦 อัปเดตสถานะ\n${order.orderId}\n→ ${statusTh[status]}`);
    res.json({ success: true, data: { orderId: req.params.orderId, status } });
  } catch (e) { res.status(500).json({ success: false, error: { message: e.message } }); }
});

app.post('/webhook', (req, res) => {
  console.log('📩 WEBHOOK HIT');
  const events = req.body.events || [];
  for (const event of events) {
    console.log('Event:', event.type, event.source?.userId);
    if (event.type === 'follow') {
      sendLine(event.source.userId, '🙏 ยินดีต้อนรับสู่ เหรียญพิทักษ์แผ่นดิน');
    }
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Pitak API v2C on port ${PORT}`));
