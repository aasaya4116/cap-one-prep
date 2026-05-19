const https = require('https');

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in Netlify environment variables.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { qType, question, formula, workedExample, rubric, userAnswer } = body;

  const systemPrompt = `You are a Capital One senior PM interviewer evaluating a product case interview answer. Be direct, specific, and constructive. Do not be vague or generic.`;

  const userPrompt = `QUESTION TYPE: ${qType}

QUESTION:
${question}

CORRECT APPROACH:
Formula: ${formula}
Worked example: ${workedExample}

KEY RUBRIC POINTS:
${rubric.map((r, i) => `${i + 1}. ${r}`).join('\n')}

CANDIDATE'S ANSWER:
${userAnswer || '[No answer — timed out]'}

Evaluate this as a tough but fair interviewer. In 150-200 words:

Score: X/4 — [one-word verdict]

What they got right: [specific callouts from their answer]

What they missed or should sharpen: [specific gaps]

One concrete tip: [actionable improvement for this question type]`;

  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 450,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.content?.[0]?.text;
            if (text) {
              resolve({ statusCode: 200, headers: corsHeaders, body: JSON.stringify({ text }) });
            } else {
              resolve({
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: parsed?.error?.message || 'Unexpected API response' }),
              });
            }
          } catch {
            resolve({ statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to parse API response' }) });
          }
        });
      }
    );

    req.on('error', (e) => {
      resolve({ statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) });
    });

    req.write(payload);
    req.end();
  });
};
