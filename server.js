/**
 * =====================================================
 * PITAK-API v2.1 - Production Ready
 * เหรียญพิทักษ์แผ่นดิน - Order Management System
 * =====================================================
 */

'use strict';
// =================================================
// IMPORT
// ================================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Client } = require('@notionhq/client');
// ==================================================
// APP INITIALIZATION
// ==================================================
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// ==================================================
// CONFIGURATION
// ==================================================
const config = {
  notion: {
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.NOTION_DATABASE_ID
  },
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    adminUserId: process.env.ADMIN_LINE_USER_ID
  },
  admin: {
    key: process.env.ADMIN_KEY || 'pitak-admin-2026'
  }
};

// ==================================================
// NOTION CLIENT
// ==================================================
let notion = null;
if (config.notion.token) {
  notion = new Client({ auth: config.notion.token });
  console.log('✅ Notion client initialized');
} else {
  console.log('⚠️ Notion token not set');
}

// ==================================================
// MIDDLEWARES
// ==================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================================================
// FILE UPLOAD CONFIG
// ==================================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.orderId}-${Date.now()}${ext}`);
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      return cb(null, true);
    }
    cb(new Error('อนุญาตเฉพาะ JPG, PNG, PDF'));
  }
});

app.use('/uploads', express.static(uploadDir));

// ==================================================
// HELPER FUNCTIONS
// ==================================================

// Response helpers
const success = (res, data, status = 200) => {
  return res.status(status).json({ success: true, data, error: null });
};

const error = (res, message, code = 'ERROR', status = 400) => {
  return res.status(status).json({ success: false, data: null, error: { code, message } });
};

// LINE Messaging
async function sendLine(userId, message) {
  if (!config.line.channelAccessToken || !userId) return false;
  
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.line.channelAccessToken}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: message }]
      })
    });
    return res.ok;
  } catch (e) {
    console.error('LINE Error:', e.message);
    return false;
  }
}

// Notion: Find Order
async function findOrder(orderId) {
  if (!notion || !config.notion.databaseId) return null;
  
  try {
    const response = await notion.databases.query({
      database_id: config.notion.databaseId,
      filter: { property: 'Order ID', title: { equals: orderId } }
    });
    return response.results[0] || null;
  } catch (e) {
    console.error('Notion findOrder error:', e.message);
    return null;
  }
}

// Notion: Parse Order
function parseOrder(page) {
  const p = page.properties;
  return {
    id: page.id,
    orderId: p['Order ID']?.title?.[0]?.plain_text || '',
    customerName: p['Customer']?.rich_text?.[0]?.plain_text || '',
    phone: p['Phone']?.rich_text?.[0]?.plain_text || '',
    amuletName: p['Amulet']?.rich_text?.[0]?.plain_text || '',
    quantity: p['Quantity']?.number || 0,
    price: p['Price']?.number || 0,
    total: p['Total']?.number || 0,
    status: p['Status']?.select?.name || 'pending',
    slipUrl: p['SlipUrl']?.url || null,
    lineUserId: p['LineUserId']?.rich_text?.[0]?.plain_text || null,
    createdAt: page.created_time
  };
}

// ==================================================
// MIDDLEWARE: Admin Authentication
// ==================================================
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== config.admin.key) {
    return error(res, 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  next();
}

// ==================================================
// ROUTES: Health Check
// ==================================================
app.get('/api/health', (req, res) => {
  success(res, {
    status: 'ok',
    version: '2.1',
    notion: !!notion,
    line: !!config.line.channelAccessToken,
    time: new Date().toISOString()
  });
});

// ==================================================
// ROUTES: Orders (Public)
// ==================================================

// Create Order
app.post('/api/orders', async (req, res) => {
  try {
    const { orderId, customerName, phone, amuletName, quantity, price, lineUserId } = req.body;

    // Validation
    if (!orderId || !customerName || !phone || !amuletName || !quantity || !price) {
      return error(res, 'ข้อมูลไม่ครบถ้วน', 'VALIDATION_ERROR');
    }

    // Check Notion
    if (!notion) {
      return error(res, 'Database not connected', 'DB_ERROR', 500);
    }

    // Check duplicate
    const existing = await findOrder(orderId);
    if (existing) {
      return error(res, 'Order ID ซ้ำ', 'DUPLICATE_ORDER', 409);
    }

    // Calculate total
    const total = quantity * price;

    // Build properties
    const properties = {
      'Order ID': { title: [{ text: { content: orderId } }] },
      'Customer': { rich_text: [{ text: { content: customerName } }] },
      'Phone': { rich_text: [{ text: { content: phone } }] },
      'Amulet': { rich_text: [{ text: { content: amuletName } }] },
      'Quantity': { number: quantity },
      'Price': { number: price },
      'Total': { number: total },
      'Status': { select: { name: 'pending' } }
    };

    if (lineUserId) {
      properties['LineUserId'] = { rich_text: [{ text: { content: lineUserId } }] };
    }

    // Create in Notion
    await notion.pages.create({
      parent: { database_id: config.notion.databaseId },
      properties
    });

    console.log('✅ Order created:', orderId);

    // Send LINE notifications
    const orderMsg = `🙏 สั่งจองสำเร็จ!\n\n📋 ${orderId}\n🎖️ ${amuletName} x${quantity}\n💰 ${total.toLocaleString()} บาท\n\n⏰ กรุณาชำระภายใน 24 ชม.`;
    
    if (lineUserId) {
      await sendLine(lineUserId, orderMsg);
    }
    
    if (config.line.adminUserId) {
      await sendLine(config.line.adminUserId, `🆕 Order ใหม่\n${orderId}\n${customerName}\n📞 ${phone}\n💰 ${total} บาท`);
    }

    success(res, { orderId, status: 'pending', total }, 201);

  } catch (e) {
    console.error('Create order error:', e.message);
    error(res, e.message, 'SERVER_ERROR', 500);
  }
});

// Get Single Order
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    if (!notion) {
      return error(res, 'Database not connected', 'DB_ERROR', 500);
    }

    const page = await findOrder(req.params.orderId);
    if (!page) {
      return error(res, 'ไม่พบ Order', 'NOT_FOUND', 404);
    }

    success(res, parseOrder(page));

  } catch (e) {
    error(res, e.message, 'SERVER_ERROR', 500);
  }
});

// Upload Slip
app.post('/api/orders/:orderId/slip', upload.single('slip'), async (req, res) => {
  try {
    if (!notion) {
      return error(res, 'Database not connected', 'DB_ERROR', 500);
    }

    const { orderId } = req.params;
    const page = await findOrder(orderId);
    
    if (!page) {
      return error(res, 'ไม่พบ Order', 'NOT_FOUND', 404);
    }

    if (!req.file) {
      return error(res, 'กรุณาแนบไฟล์สลิป', 'FILE_REQUIRED');
    }

    const slipUrl = `https://pitak-api.onrender.com/uploads/${req.file.filename}`;

    // Update Notion
    await notion.pages.update({
      page_id: page.id,
      properties: {
        'SlipUrl': { url: slipUrl }
      }
    });

    console.log('✅ Slip uploaded:', orderId);

    // Notify admin
    const order = parseOrder(page);
    if (config.line.adminUserId) {
      await sendLine(config.line.adminUserId, `📸 สลิปใหม่!\n${orderId}\n${order.customerName}`);
    }

    success(res, { orderId, slipUrl });

  } catch (e) {
    error(res, e.message, 'SERVER_ERROR', 500);
  }
});

// ==================================================
// ROUTES: Admin
// ==================================================

// List All Orders (Admin)
app.get('/api/orders', adminAuth, async (req, res) => {
  try {
    if (!notion) {
      return error(res, 'Database not connected', 'DB_ERROR', 500);
    }

    const response = await notion.databases.query({
      database_id: config.notion.databaseId,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }]
    });

    const orders = response.results.map(parseOrder);

    // Summary
    const summary = {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      paid: orders.filter(o => o.status === 'paid').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
      totalAmount: orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total || 0), 0)
    };

    success(res, { summary, orders });

  } catch (e) {
    console.error('List orders error:', e.message);
    error(res, e.message, 'SERVER_ERROR', 500);
  }
});

// Update Order Status (Admin)
app.patch('/api/orders/:orderId/status', adminAuth, async (req, res) => {
  try {
    if (!notion) {
      return error(res, 'Database not connected', 'DB_ERROR', 500);
    }

    const { orderId } = req.params;
    const { status } = req.body;

    const validStatus = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    if (!validStatus.includes(status)) {
      return error(res, 'สถานะไม่ถูกต้อง', 'INVALID_STATUS');
    }

    const page = await findOrder(orderId);
    if (!page) {
      return error(res, 'ไม่พบ Order', 'NOT_FOUND', 404);
    }

    // Update Notion
    await notion.pages.update({
      page_id: page.id,
      properties: {
        'Status': { select: { name: status } }
      }
    });

    console.log('✅ Status updated:', orderId, '→', status);

    // Notify customer
    const order = parseOrder(page);
    if (order.lineUserId) {
      const statusText = {
        pending: 'รอชำระเงิน',
        paid: 'ชำระเงินแล้ว ✅',
        shipped: 'จัดส่งแล้ว 🚚',
        completed: 'เสร็จสิ้น ✨',
        cancelled: 'ยกเลิก ❌'
      };
      await sendLine(order.lineUserId, `📦 อัปเดตสถานะ\n${orderId}\n→ ${statusText[status]}`);
    }

    success(res, { orderId, status });

  } catch (e) {
    error(res, e.message, 'SERVER_ERROR', 500);
  }
});

// ==================================================
// ROUTES: LINE Webhook
// ==================================================
app.post('/webhook', (req, res) => {
  console.log('📩 Webhook received');
  
  const events = req.body.events || [];
  
  for (const event of events) {
    console.log('Event:', event.type, event.source?.userId);
    
    if (event.type === 'follow') {
      sendLine(event.source.userId, '🙏 ยินดีต้อนรับสู่ เหรียญพิทักษ์แผ่นดิน\n\nสั่งจองได้ที่เว็บไซต์ของเรา');
    }
    
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = event.message.text.toLowerCase();
      if (text.includes('สถานะ') || text.includes('order')) {
        sendLine(event.source.userId, '📋 ตรวจสอบสถานะ Order\n\nกรุณาแจ้งหมายเลข Order ของท่าน');
      }
    }
  }
  
  res.sendStatus(200);
});
// ==================================================
// ROUTES: PDF Generation
// ==================================================
const { generateOrderPDF } = require('./utils/pdf');

// Generate PDF (Admin)
app.get('/api/orders/:orderId/pdf', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type || 'order'; // order or receipt

    if (!notion) {
      return error(res, 'Database not connected', 'DB_ERROR', 500);
    }

    const page = await findOrder(orderId);
    if (!page) {
      return error(res, 'Order not found', 'NOT_FOUND', 404);
    }

    const order = parseOrder(page);
    const filePath = await generateOrderPDF(order, type);

    res.download(filePath);

  } catch (e) {
    console.error('PDF Error:', e.message);
    error(res, e.message, 'PDF_ERROR', 500);
  }
});
// ==================================================
// ERROR HANDLERS
// ==================================================
app.use((req, res) => {
  error(res, `Route ${req.originalUrl} not found`, 'NOT_FOUND', 404);
});

app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.message);
  error(res, err.message, 'SERVER_ERROR', 500);
});

// ==================================================
// START SERVER
// ==================================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  🙏 PITAK-API v2.1                                ║
║  📡 Port: ${PORT}                                      ║
║                                                   ║
║  ✅ Notion: ${notion ? 'Connected' : 'Not connected'}                        ║
║  ✅ LINE: ${config.line.channelAccessToken ? 'Configured' : 'Not configured'}                          ║
║                                                   ║
║  Endpoints:                                       ║
║  • GET  /api/health                               ║
║  • POST /api/orders                               ║
║  • GET  /api/orders/:id                           ║
║  • POST /api/orders/:id/slip                      ║
║  • GET  /api/orders (Admin)                       ║
║  • PATCH /api/orders/:id/status (Admin)           ║
║  • POST /webhook                                  ║
╚═══════════════════════════════════════════════════╝
  `);
});
