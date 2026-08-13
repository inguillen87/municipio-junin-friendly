export const config = {
  runtime: 'edge', // Vercel Edge Function for fast streaming and low latency
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { messages, userRole = 'Ejecutivo' } = await req.json();

    // The user stated they added OPENAI_API_KEY as an env variable in Vercel
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.warn("OPENAI_API_KEY not found. Falling back to local offline responses.");
      return new Response(JSON.stringify({ 
        error: "No API Key", 
        fallback: "Modo Offline Activo. Soy MuniBot. Por razones de seguridad no tengo conexión a la red de OpenAI en este momento, pero puedo ayudarte con las consultas locales. ¿Qué necesitas revisar?"
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = `
      Eres MuniBot, el Asistente Ejecutivo de Inteligencia Artificial de la plataforma MuniControl del Municipio de Junín (Mendoza).
      Tu objetivo es ayudar a intendentes, secretarios de hacienda, RRHH y empleados municipales a navegar la plataforma, entender los datos (2450 empleados, presupuesto de $372M, mapas GIS, reclamos 311) y tomar mejores decisiones.
      Responde de forma concisa, profesional, ejecutiva y amable. Evita textos larguísimos. Usa formato markdown para resaltar cosas importantes.
      Rol actual del usuario que te habla: ${userRole}. Adapta tu lenguaje a su nivel (ej. técnico para contadores, ejecutivo para el intendente, servicial para el ciudadano).
    `;

    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Using gpt-4o-mini as it's the fast, capable standard for simple agents
        messages: openAiMessages,
        temperature: 0.3, // Executive tone, less hallucinations
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API Error:", errorData);
      return new Response(JSON.stringify({ error: 'OpenAI API Error', details: errorData }), { status: 500 });
    }

    const data = await response.json();
    return new Response(JSON.stringify({
      response: data.choices[0].message.content
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
