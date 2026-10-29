/** Local Ollama ranking for real lost and found reports. */

const configuredModel = () => (process.env.OLLAMA_MODEL || 'llama3.1').trim();
const baseUrl = () => (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/$/, '');

function isAvailable() {
  return (process.env.AI_PROVIDER || '').trim().toLowerCase() === 'ollama';
}

function parseJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch (_) {
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try { return JSON.parse(clean.slice(start, end + 1)); } catch (_) {}
    }
    return null;
  }
}

async function chat(messages, maxTokens = 1000) {
  if (!isAvailable()) throw new Error('Ollama is not selected as the AI provider.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS) || 30000);
  const responseFormat = {
    type: 'object',
    properties: { reply: { type: 'string' } },
    required: ['reply'],
    additionalProperties: false
  };
  try {
    const response = await fetch(`${baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: configuredModel(),
        messages,
        stream: false,
        think: false,
        format: responseFormat,
        options: { num_predict: Math.min(maxTokens, 400), temperature: 0.2 }
      })
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const payload = await response.json();
    const parsed = parseJson(payload.message?.content);
    if (typeof parsed?.reply !== 'string' || !parsed.reply.trim()) {
      throw new Error('Ollama returned an invalid chat response');
    }
    return parsed.reply.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function rankCandidates(lostQuery, candidates) {
  if (!isAvailable() || !candidates?.length) return null;
  const summaries = candidates.map((c, candidateIndex) => ({
    candidateIndex, title: c.title || '', description: c.description || '',
    location: c.location || '', date: c.date || '', color: c.color || ''
  }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS) || 30000);
  try {
    const response = await fetch(`${baseUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: configuredModel(), stream: false, format: 'json',
        prompt: `Compare this lost item with the found reports. Rank only reports that could be the same physical item. Compare item category and specific details first, then color, location and date. Do not infer details absent from reports. Return JSON exactly as {"matches":[{"candidateIndex":0,"score":85,"descriptionMatch":"Strong","reason":"Short evidence-based reason."}]}. Include only scores 25-100 and at most ${candidates.length} matches.\nLost report: ${JSON.stringify(lostQuery)}\nFound reports: ${JSON.stringify(summaries)}`
      })
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const payload = await response.json();
    const parsed = parseJson(payload.response);
    const rows = Array.isArray(parsed) ? parsed : parsed?.matches;
    if (!Array.isArray(rows)) throw new Error('Ollama returned invalid match JSON');
    const ranked = [];
    for (const row of rows) {
      const index = Number(row.candidateIndex);
      const candidate = Number.isInteger(index) ? candidates[index] : null;
      if (!candidate) continue;
      const score = Math.max(0, Math.min(100, Math.round(Number(row.score) || 0)));
      if (score < 25) continue;
      ranked.push({
        ...candidate, score,
        descriptionMatch: ['Strong', 'Moderate', 'Weak'].includes(row.descriptionMatch)
          ? row.descriptionMatch : (score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'Weak'),
        reason: typeof row.reason === 'string' ? row.reason.slice(0, 300) : 'Report details may describe the same item.'
      });
    }
    return ranked.sort((a, b) => b.score - a.score);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { isAvailable, chat, rankCandidates, getModel: configuredModel };
