const { pushMessage } = require('./services/line.service');

(async () => {
  try {
    await pushMessage('✅ LINE Notify พร้อมใช้งานแล้ว');
    console.log('LINE OK');
  } catch (e) {
    console.error('FAILED', e.message);
  }
})();
