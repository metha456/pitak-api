// ============================================
// Pitak API – Production v2.0
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

// ============================================
// ENV CHECK
// ============================================
if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
  console.error('❌ Missing NOTION_TOKEN or NOTION_DATABASE_ID');
  process.exit(1);
}

// ============================================
// APP INIT
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================
// NOTION CLIENT
// ============================================
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ============================================
// HELPER: Check duplicate
// ============================================
async function orderExists(orderId) {
  try {
    const result = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'Order ID',
        title: { equals: orderId }
      }
    });
    return result.results.length > 0 ? result.results[0] : null;
  } catch (e) {
    return null;
  }
}

// ============================================
// GET /api/health
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0' });
});

// ============================================
// GET /api/config
// ============================================
app.get('/api/config', (req, res) => {
  res.json({
    promptpayId: process.env.PROMPTPAY_ID || '',
    accountName: process.env.ACCOUNT_NAME || ''
  });
});

// ============================================
// GET /api/notion/test
// ============================================
app.get('/api/notion/test', async (req, res) => {
  try {
    const result = await notion.databases.query({
      database_id: DATABASE_ID,
      page_size: 1
    });
    res.json({ success: true, count: result.results.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// POST /api/orders - สร้าง order ใหม่
// ============================================
app.post('/api/orders', async (req, res) => {
  try {
    const { orderId, customerName, phone, amuletName, quantity, price } = req.body;

    // VALIDATION
    const errors = [];
    if (!orderId) errors.push('orderId is required');
    if (!customerName || customerName.length < 2) errors.push('customerName ต้องมีอย่างน้อย 2 ตัวอักษร');
    if (!phone || !/^0[0-9]{8,9}$/.test(phone)) errors.push('phone ไม่ถูกต้อง');
    if (!amuletName) errors.push('amuletName is required');
    if (!quantity || typeof quantity !== 'number' || quantity <= 0) errors.push('quantity ต้องเป็นตัวเลข > 0');
    if (!price || typeof price !== 'number' || price <= 0) errors.push('price ต้องเป็นตัวเลข > 0');

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: 'ข้อมูลไม่ถูกต้อง', details: errors });
    }

    // CHECK DUPLICATE
    if (await orderExists(orderId)) {
      return res.status(409).json({ success: false, error: 'Order ID นี้มีอยู่แล้ว' });
    }

    // CREATE IN NOTION
    const total = quantity * price;

    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        'Order ID': { title: [{ text: { content: orderId } }] },
        'Customer': { rich_text: [{ text: { content: customerName } }] },
        'Phone': { phone_number: phone },
        'Amulet': { rich_text: [{ text: { content: amuletName } }] },
        'Quantity': { number: quantity },
        'Price': { number: price },
        'Total': { number: total },
        'Status': { select: { name: 'pending' } }
      }
    });

    console.log('✅ Created:', orderId);
    res.status(201).json({ success: true, message: 'สร้างคำสั่งซื้อสำเร็จ', data: { orderId } });

  } catch (err) {
    console.error('❌ POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET /api/orders - ดึงรายการทั้งหมด
// ============================================
app.get('/api/orders', async (req, res) => {
  try {
    const result = await notion.databases.query({
      database_id: DATABASE_ID,
      sorts: [{ property: 'Order ID', direction: 'descending' }]
    });

    const orders = result.results.map(page => ({
      id: page.id,
      orderId: page.properties['Order ID']?.title?.[0]?.plain_text || '',
      customer: page.properties['Customer']?.rich_text?.[0]?.plain_text || '',
      phone: page.properties['Phone']?.phone_number || '',
      amulet: page.properties['Amulet']?.rich_text?.[0]?.plain_text || '',
      quantity: page.properties['Quantity']?.number || 0,
      price: page.properties['Price']?.number || 0,
      total: page.properties['Total']?.number || 0,
      status: page.properties['Status']?.select?.name || ''
    }));

    res.json({ success: true, total: orders.length, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PATCH /api/orders/:orderId/status - อัปเดตสถานะ
// ============================================
app.patch('/api/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const valid = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, error: 'status ไม่ถูกต้อง', valid });
    }

    const existing = await orderExists(orderId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'ไม่พบ order นี้' });
    }

    await notion.pages.update({
      page_id: existing.id,
      properties: { 'Status': { select: { name: status } } }
    });

    console.log(`✅ ${orderId} → ${status}`);
    res.json({ success: true, message: `อัปเดตเป็น ${status}` });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, async () => {
  try {
    await notion.databases.retrieve({ database_id: DATABASE_ID });
    console.log(`
╔════════════════════════════════════════╗
║  🙏 Pitak API v2.0                     ║
║  🌐 http://localhost:${PORT}             ║
║  📊 Notion: ✅ Connected               ║
║                                        ║
║  Routes:                               ║
║  GET  /api/health                      ║
║  GET  /api/config                      ║
║  GET  /api/notion/test                 ║
║  POST /api/orders        ← สร้าง order ║
║  GET  /api/orders        ← ดูทั้งหมด    ║
║  PATCH /api/orders/:id/status          ║
╚════════════════════════════════════════╝
`);
  } catch (err) {
    console.error('❌ Notion failed:', err.message);
    process.exit(1);
  }
});

