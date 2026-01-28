const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// แปลงข้อความไทยเป็น ASCII-safe
function toAscii(text) {
  if (!text) return '-';
  // ลบอักขระที่ไม่ใช่ ASCII
  return String(text).replace(/[^\x00-\x7F]/g, '').trim() || 'Thai Text';
}

// แปลงชื่อเหรียญ
function translateAmulet(name) {
  if (!name) return 'Amulet';
  
  const map = {
    'ทองแดงรมดำ': 'Bronze Black',
    'ทองเหลืองผิวรุ้ง': 'Brass Rainbow',
    'หน้ากากทองขาว': 'White Gold Mask',
    'พิมพ์ใหญ่': 'Large',
    'พิมพ์กลาง': 'Medium',
    'เนื้อ': '',
    'หลวงพ่อเงิน': 'Luang Por Ngern',
    'พิทักษ์แผ่นดิน': 'Pitak Phandin'
  };

  let result = name;
  for (const [th, en] of Object.entries(map)) {
    result = result.replace(new RegExp(th, 'g'), en);
  }
  
  // ลบอักขระไทยที่เหลือ
  result = result.replace(/[^\x00-\x7F]/g, ' ').trim();
  return result || 'Amulet';
}

async function generateOrderPDF(order, type = 'order') {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const gold = rgb(0.83, 0.68, 0.21);
  const dark = rgb(0.29, 0, 0.07);
  const green = rgb(0.15, 0.68, 0.38);
  const orange = rgb(0.95, 0.61, 0.07);

  let y = 780;

  // Header
  page.drawText('PITAK-PHANDIN', { x: 200, y, size: 24, font: fontBold, color: gold });
  y -= 30;
  
  const title = type === 'receipt' ? 'RECEIPT' : 'ORDER CONFIRMATION';
  page.drawText(title, { x: 210, y, size: 14, font, color: dark });
  y -= 40;

  // Line
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 2, color: gold });
  y -= 30;

  // Order details - แปลงเป็น ASCII
  const drawRow = (label, value) => {
    page.drawText(label, { x: 50, y, size: 12, font: fontBold });
    page.drawText(toAscii(value), { x: 180, y, size: 12, font });
    y -= 24;
  };

  drawRow('Order ID:', order.orderId);
  drawRow('Customer:', order.customerName);
  drawRow('Phone:', order.phone);
  drawRow('Item:', translateAmulet(order.amuletName));
  drawRow('Quantity:', String(order.quantity || 0));
  drawRow('Unit Price:', `${Number(order.price || 0).toLocaleString()} THB`);
  
  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: 350, y }, thickness: 1, color: gold });
  y -= 25;

  // Total
  page.drawText('TOTAL:', { x: 50, y, size: 16, font: fontBold });
  page.drawText(`${Number(order.total || 0).toLocaleString()} THB`, { x: 180, y, size: 16, font: fontBold, color: gold });
  y -= 35;

  // Status
  const status = type === 'receipt' ? 'PAID' : 'PENDING PAYMENT';
  const statusColor = type === 'receipt' ? green : orange;
  page.drawText('Status:', { x: 50, y, size: 12, font: fontBold });
  page.drawText(status, { x: 180, y, size: 12, font: fontBold, color: statusColor });
  y -= 50;

  // Footer
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: gold });
  y -= 25;
  page.drawText('Thank you for your order', { x: 210, y, size: 11, font });
  y -= 18;
  page.drawText('Pitak-Phandin Amulet Collection', { x: 190, y, size: 10, font });

  // Save PDF
  const bytes = await pdf.save();
  const uploadDir = path.join(__dirname, '../uploads');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const fileName = `${order.orderId}-${type}.pdf`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, bytes);

  console.log('PDF created:', fileName);
  return filePath;
}

module.exports = { generateOrderPDF };
