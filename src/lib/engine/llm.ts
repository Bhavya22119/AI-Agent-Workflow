const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function callLLM(prompt: string, model: string = 'llama-3.1-8b-instant'): Promise<{ result: string; provider: string }> {
  if (GROQ_API_KEY) {
    return callGroq(prompt, model);
  }
  return callStub(prompt);
}

async function callGroq(prompt: string, model: string): Promise<{ result: string; provider: string }> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }
  
  const data: any = await response.json();
  return {
    result: data.choices[0]?.message?.content || '',
    provider: 'groq',
  };
}

async function callStub(prompt: string): Promise<{ result: string; provider: string }> {
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
  
  const lower = prompt.toLowerCase();
  let result = '[STUB] This is a deterministic LLM stub response. Configure GROQ_API_KEY for real LLM calls.';
  
  if (lower.includes('sentiment') || lower.includes('positive') || lower.includes('negative')) {
    result = '[STUB] positive - The text has a generally positive sentiment with optimistic undertones.';
  } else if (lower.includes('summarize') || lower.includes('summary')) {
    result = '[STUB] Summary: The input text discusses key topics with relevant details and conclusions.';
  } else if (lower.includes('analyze') || lower.includes('analysis')) {
    result = '[STUB] Analysis: The input shows patterns consistent with the expected domain behavior.';
  }
  
  return { result, provider: 'stub (no GROQ_API_KEY configured)' };
}
