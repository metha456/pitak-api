const axios = require('axios');
require('dotenv').config();

const LINE_API = 'https://api.line.me/v2/bot/message/push';
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

async function pushMessage(to, text) {
  if (!to) throw new Error('LINE_TO_MISSING');

  const payload = {
    to,
    messages: [
      { type: 'text', text }
    ]
  };

  const res = await axios.post(LINE_API, payload, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  return res.data;
}

module.exports = { pushMessage };
