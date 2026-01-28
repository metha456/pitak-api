const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateOrderPDF(order, type = 'order') {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const gold = rgb(0.83, 0.68, 0.21);
  const dark = rgb(0.29, 0, 0.07);

  let y = 780;

  // Header
  page.drawText('PITAK-PHANDIN', { x: 200, y, size: 24, font: fontBold, color: gold });
  y -= 30;
  page.drawText(type === 'receipt' ? 'RECEIPT' : 'ORDER CONFIRMATION', { x: 220, y, size: 14, font, color: dark });
  y -= 40;

  // Line
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 2, color: gold });
  y -= 30;

  // Order details
  const drawRow = (label, value) => {
    page.drawText(label, { x: 50, y, size: 12, font: fontBold });
    page.drawText(String(value), { x: 200, y, size: 12, font });
    y -= 22;
  };

  drawRow('Order ID:', order.orderId);
  drawRow('Customer:', order.customerName);
  drawRow('Phone:', order.phone);
  drawRow('Item:', order.amuletName);
  drawRow('Quantity:', order.quantity);
  drawRow('Price:', `${order.price.toLocaleString()} THB`);
  
  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: 300, y }, thickness: 1, color: gold });
  y -= 20;

  page.drawText('TOTAL:', { x: 50, y, size: 14, font: fontBold });
  page.drawText(`${order.total.toLocaleString()} THB`, { x: 200, y, size: 14, font: fontBold, color: gold });
  y -= 30;

  // Status
  const status = type === 'receipt' ? 'PAID' : 'PENDING';
  const statusColor = type === 'receipt' ? rgb(0.15, 0.68, 0.38) : rgb(0.95, 0.61, 0.07);
  page.drawText(`Status: ${status}`, { x: 50, y, size: 12, font: fontBold, color: statusColor });
  y -= 40;

  // Footer
  page.drawText('Thank you for your order', { x: 200, y, size: 10, font });
  y -= 15;
  page.drawText('Pitak-Phandin Amulet', { x: 220, y, size: 10, font });

  // Save
  const bytes = await pdf.save();
  const uploadDir = path.join(__dirname, '../uploads');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filePath = path.join(uploadDir, `${order.orderId}-${type}.pdf`);
  fs.writeFileSync(filePath, bytes);

  return filePath;
}

module.exports = { generateOrderPDF };
