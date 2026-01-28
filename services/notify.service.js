require('dotenv').config();
const line = require('./line.service');

const ADMIN_LINE_ID = process.env.LINE_TO_ADMIN;

/**
 * แจ้งแอดมิน
 */
async function notifyAdmin(message) {
  if (!ADMIN_LINE_ID) {
    console.warn('[NOTIFY] ADMIN_LINE_ID missing');
    return;
  }

  return line.pushMessage(
    ADMIN_LINE_ID,
    `🛡 PITAK SYSTEM\n${message}`
  );
}

/**
 * แจ้งลูกค้า (อนาคต)
 */
async function notifyUser(lineUserId, message) {
  return line.pushMessage(
    lineUserId,
    message
  );
}

module.exports = {
  notifyAdmin,
  notifyUser
};
