/** Image understanding via Gemini or OpenRouter vision models. */

export async function describeImage(opts: {
  imageBase64: string;
  mime: string;
  caption?: string;
}): Promise<string> {
  const prompt =
    (opts.caption
      ? `O operador enviou esta imagem no Telegram com a legenda: "${opts.caption}".\n\n`
      : 'O operador enviou esta imagem no Telegram.\n\n') +
    'Descreva com precisão o que aparece (UI, erros, código, logs). ' +
    'Se houver erro, cite a mensagem. Em português. Seja objetivo (Telegram). ' +
    'Se fizer sentido, sugira 1–3 próximos passos no contexto Aegis/fleet.';

  const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (googleKey) {
    // Google retirou 2.5-flash para contas novas → 3.8-flash
    const model = process.env.VISION_MODEL || 'gemini-3.8-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: opts.mime,
                  data: opts.imageBase64,
                },
              },
            ],
          },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini vision ${res.status}`);
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    if (!text) throw new Error('Gemini vision empty');
    return text.slice(0, 3500);
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    const model = process.env.VISION_MODEL || 'google/gemini-2.5-flash';
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${opts.mime};base64,${opts.imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 800,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `OpenRouter vision ${res.status}`);
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenRouter vision empty');
    return String(text).slice(0, 3500);
  }

  throw new Error(
    'Visão não configurada. Defina GOOGLE_API_KEY (ou GEMINI_API_KEY) ou OPENROUTER_API_KEY no Vercel do Aegis.'
  );
}
