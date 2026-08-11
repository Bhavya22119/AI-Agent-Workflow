require('dotenv').config({ path: '.env.local' });
const { callLLM } = require('./src/lib/engine/llm.ts'); // wait, can't require ts directly

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function testGroq() {
  console.log("Using key:", GROQ_API_KEY ? "Set" : "Not set");
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: 'Say hello!' }],
        max_tokens: 100,
        temperature: 0.7,
      }),
    });
    console.log("Status:", response.status);
    const data = await response.text();
    console.log("Response:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}

testGroq();
