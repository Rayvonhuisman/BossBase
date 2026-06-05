import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, subject, html, from_name, attachments } = await req.json()

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ success: false, error: 'to, subject en html zijn verplicht' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
    const fromLabel = from_name ? `${from_name} <${fromEmail}>` : fromEmail

    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY niet geconfigureerd' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const payload: Record<string, unknown> = { from: fromLabel, to, subject, html }
    if (Array.isArray(attachments) && attachments.length > 0) payload.attachments = attachments

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: data.message || 'Resend fout' }), {
        status: res.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, message_id: data.id }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
