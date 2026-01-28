const axios = require('axios');

const LINE_API = 'https://api.line.me/v2/bot/message/push';
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

async function pushMessage({ to, text }) {
  if (!to) throw new Error('LINE_TO_MISSING');

  try {
    const res = await axios.post(
      LINE_API,
      {
        to,
        messages: [{ type: 'text', text }]
      },
      {
        headers: {
          'Authorization': `Bearer ${LINE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return res.data;
  } catch (err) {
    console.error('[LINE PUSH ERROR]', err.response?.data || err.message);
    throw new Error('LINE_PUSH_FAILED');
  }
}

module.exports = { pushMessage };
