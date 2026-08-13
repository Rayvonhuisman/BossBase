// boss-chat (verify_jwt=true)
//
// De helpagent in het portaal. Neemt de gespreksgeschiedenis aan, vraagt het
// antwoord bij Anthropic op en streamt het terug naar het scherm.
//
// Volgorde van de controles is bewust:
//   1. Ingelogd?            geen sessie, geen gesprek
//   2. Bij een bedrijf?     zonder bedrijf is er geen gesprek om te bewaren
//   3. Binnen de limiet?    30 berichten per uur — vóór de API-aanroep, zodat een
//                           geweigerd bericht niets kost
//   4. Pas dan naar Anthropic
//
// De kennisbank en de instructie komen uit bossKennis.ts. Dat bestand wordt
// gegenereerd (scripts/gen-boss-kennis.mjs) omdat een edge function de
// markdown-bestanden niet van schijf kan lezen.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { BOSS_INSTRUCTIE, BOSS_KENNIS } from '../_shared/bossKennis.ts'
import { stuurBossBaseMail, INTERN_ADRES } from '../_shared/billing.ts'
import { doorzetMail } from '../_shared/bossDoorzetMail.ts'

const MODEL       = 'claude-haiku-4-5-20251001'
const MAX_TOKENS  = 1024
const MAX_PER_UUR = 30
const MAX_DOORZET_PER_DAG = 5

// Hoeveel van het gesprek we meesturen. Een lang gesprek volledig meesturen maakt
// elke vraag duurder zonder dat het antwoord beter wordt; twintig beurten is ruim
// zat voor een helpvraag.
const MAX_HISTORIE = 20

// De enige tool die Boss heeft. Beschrijving en parameters zijn wat het model
// ziet; hoe strenger dit is, hoe minder hij hem op het verkeerde moment pakt.
const TOOLS = [{
  name: 'stuur_naar_team',
  description:
    'Zet een vraag door naar het BossBase-team wanneer je het antwoord niet zeker weet, ' +
    'of bij bugs, klachten en administratieve vragen.',
  input_schema: {
    type: 'object',
    properties: {
      samenvatting: { type: 'string', description: 'Korte samenvatting van de vraag van de gebruiker.' },
      reden:        { type: 'string', description: 'Waarom je het doorzet, bijvoorbeeld: onbekend in kennisbank, bug, klacht, administratief.' },
    },
    required: ['samenvatting', 'reden'],
  },
}]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// Eén regel als server-sent event. De frontend leest dit als een stroom.
const sse = (soort: string, data: unknown) =>
  `event: ${soort}\ndata: ${JSON.stringify(data)}\n\n`

// Boss is gevraagd geen gedachtestreepjes te gebruiken, en de kennisbank bevat er
// geen meer. Toch glipt er in vrij geformuleerde antwoorden nog weleens een door.
// Een taalregel is een verzoek, geen garantie; deze vervanging wel.
//
// Losstaand tussen spaties wordt het een komma, want daar onderbrak het de zin.
// Plakt het aan een woord vast, dan is een koppelteken de bedoeling.
function zonderStreepjes(t: string): string {
  return t
    .replace(/ [\u2014\u2013]+ /g, ', ')
    .replace(/[\u2014\u2013]/g, '-')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
    const apiKey      = Deno.env.get('ANTHROPIC_API_KEY')

    // ── 1. Ingelogd ──────────────────────────────────────────────────────────
    // Auth gaat vóór alle andere controles. Zou de sleutelcontrole hierboven
    // staan, dan krijgt een willekeurige beller van buiten te horen dat onze
    // configuratie niet klopt — informatie waar hij niets mee te maken heeft,
    // en een antwoord dat verhult dat hij simpelweg niet ingelogd is.
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Niet ingelogd' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Ongeldige sessie' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 2. Bij welk bedrijf hoort deze gebruiker ─────────────────────────────
    const { data: profiel } = await admin
      .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    const companyId = profiel?.company_id
    if (!companyId) return json({ error: 'Geen bedrijf gevonden voor dit account' }, 403)

    // Pas nu de sleutel. Dit is een configuratiefout aan onze kant, geen fout van
    // de gebruiker — vandaar een neutrale melding naar buiten en het echte
    // probleem in de log.
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY ontbreekt')
      return json({ error: 'Boss is even niet beschikbaar. Probeer het later opnieuw.' }, 503)
    }

    // ── Verzoek uitpakken ────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const conversationId: string | null = body?.conversation_id ?? null
    const binnen: { rol: string; tekst: string }[] = Array.isArray(body?.messages) ? body.messages : []

    if (binnen.length === 0) return json({ error: 'Geen bericht ontvangen' }, 400)

    const laatste = binnen[binnen.length - 1]
    if (laatste?.rol !== 'gebruiker' || !String(laatste?.tekst || '').trim()) {
      return json({ error: 'Het laatste bericht moet een vraag van de gebruiker zijn' }, 400)
    }

    // ── 3. Rate limit ────────────────────────────────────────────────────────
    const { data: limiet, error: limietFout } = await admin
      .rpc('bb_boss_claim_bericht', { p_user_id: user.id, p_max: MAX_PER_UUR })
    if (limietFout) {
      console.error('rate limit mislukt', limietFout.message)
      return json({ error: 'Boss is even niet beschikbaar. Probeer het later opnieuw.' }, 503)
    }

    if (limiet?.toegestaan === false) {
      const opnieuw = limiet?.opnieuw_op
        ? new Date(limiet.opnieuw_op).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        : 'straks'
      return json({
        error: `Je hebt het maximum van ${MAX_PER_UUR} vragen per uur bereikt. Vanaf ${opnieuw} kun je weer verder.`,
        code: 'te_veel_vragen',
        opnieuwOp: limiet?.opnieuw_op ?? null,
      }, 429)
    }

    // ── 4. Gesprek vastleggen vóórdat we beginnen ────────────────────────────
    // We hebben het gespreks-id nu al nodig: de doorzet-tool mag maximaal één
    // keer per gesprek, en die grendel staat op de gespreksrij. Zou het gesprek
    // pas achteraf ontstaan, dan is er bij een eerste bericht niets om die vlag
    // op te zetten.
    const { data: gesprekId, error: startFout } = await admin.rpc('bb_boss_start_gesprek', {
      p_conversation_id: conversationId,
      p_company_id: companyId,
      p_user_id: user.id,
      p_titel: String(binnen[0]?.tekst || '').slice(0, 80),
    })
    if (startFout || !gesprekId) {
      console.error('gesprek starten mislukt', startFout?.message)
      return json({ error: 'Boss is even niet beschikbaar. Probeer het later opnieuw.' }, 503)
    }

    // ── 5. Naar Anthropic ────────────────────────────────────────────────────
    // De historie wordt omgezet naar het formaat dat de API verwacht. Alles wat
    // geen herkenbare rol heeft valt eruit — de frontend mag geen rollen
    // verzinnen die we niet kennen.
    const historie = binnen
      .slice(-MAX_HISTORIE)
      .filter(m => m?.rol === 'gebruiker' || m?.rol === 'boss')
      .map(m => ({
        role: m.rol === 'gebruiker' ? 'user' : 'assistant',
        content: String(m.tekst || '').slice(0, 4000),
      }))

    // Eén ronde bij Anthropic. Geeft de gestreamde tekst terug plus, als Boss de
    // tool aanroept, wat hij daarvoor meegeeft.
    const vraagAnthropic = async (
      berichten: unknown[],
      stuurTekst: (t: string) => void,
    ): Promise<{ tekst: string; tool: null | { id: string; naam: string; invoer: any } }> => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          stream: true,
          tools: TOOLS,
          // Twee blokken: de instructie en de kennis. Alleen het kennisblok krijgt
          // een cache-markering — dat is het grote, onveranderlijke deel. Zonder
          // caching betaal je die ~21.000 tokens bij élke vraag opnieuw.
          system: [
            { type: 'text', text: BOSS_INSTRUCTIE },
            { type: 'text', text: BOSS_KENNIS, cache_control: { type: 'ephemeral' } },
          ],
          messages: berichten,
        }),
      })

      if (!res.ok || !res.body) {
        const fout = await res.text().catch(() => '')
        throw new Error(`Anthropic ${res.status}: ${fout.slice(0, 300)}`)
      }

      const dec = new TextDecoder()
      const lezer = res.body.getReader()
      let tekst = ''
      let rest = ''
      // De argumenten van een tool komen in stukjes binnen; die plakken we hier
      // aan elkaar tot het blok klaar is.
      let toolId = ''
      let toolNaam = ''
      let toolRuw = ''
      let inTool = false

      while (true) {
        const { done, value } = await lezer.read()
        if (done) break
        rest += dec.decode(value, { stream: true })
        const regels = rest.split('\n')
        rest = regels.pop() ?? ''

        for (const regel of regels) {
          if (!regel.startsWith('data: ')) continue
          const ruw = regel.slice(6).trim()
          if (!ruw || ruw === '[DONE]') continue

          try {
            const ev = JSON.parse(ruw)

            if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
              inTool = true
              toolId = ev.content_block.id
              toolNaam = ev.content_block.name
              toolRuw = ''
            } else if (ev.type === 'content_block_delta') {
              if (ev.delta?.type === 'text_delta' && ev.delta.text) {
                const schoon = zonderStreepjes(ev.delta.text)
                tekst += schoon
                stuurTekst(schoon)
              } else if (ev.delta?.type === 'input_json_delta' && ev.delta.partial_json) {
                toolRuw += ev.delta.partial_json
              }
            } else if (ev.type === 'content_block_stop' && inTool) {
              inTool = false
            } else if (ev.type === 'error') {
              console.error('stroomfout', JSON.stringify(ev.error).slice(0, 300))
            }
          } catch { /* onvolledig blok: komt in de volgende ronde mee */ }
        }
      }

      let tool = null
      if (toolId && toolNaam) {
        let invoer: any = {}
        try { invoer = toolRuw ? JSON.parse(toolRuw) : {} } catch { invoer = {} }
        tool = { id: toolId, naam: toolNaam, invoer }
      }
      return { tekst, tool }
    }

    // Voert de doorzet-tool uit. Geeft altijd een resultaat terug — ook bij
    // mislukking — zodat Boss eerlijk kan zeggen wat er is gebeurd in plaats van
    // te doen alsof het gelukt is.
    const zetDoor = async (invoer: any): Promise<Record<string, unknown>> => {
      const samenvatting = String(invoer?.samenvatting || '').trim() || 'Geen samenvatting meegegeven'
      const reden = String(invoer?.reden || '').trim() || 'onbekend'

      const { data: claim } = await admin.rpc('bb_boss_claim_doorzet', {
        p_conversation_id: gesprekId,
        p_user_id: user.id,
        p_max_per_dag: MAX_DOORZET_PER_DAG,
      })

      if (claim?.toegestaan !== true) {
        return {
          verstuurd: false,
          reden: claim?.reden || 'Doorzetten lukte niet.',
          verwijs_naar: 'info@bossbase.nl',
        }
      }

      try {
        const { data: bedrijf } = await admin
          .from('companies').select('name').eq('id', companyId).maybeSingle()
        const { data: prof } = await admin
          .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

        const m = doorzetMail({
          samenvatting,
          reden,
          naam: prof?.full_name ?? null,
          email: user.email ?? null,
          bedrijfsnaam: bedrijf?.name ?? null,
          gesprek: binnen.map(b => ({ rol: b.rol, tekst: b.tekst })),
        })

        const id = await stuurBossBaseMail(INTERN_ADRES(), m.subject, m.html, user.email ?? undefined)
        if (!id) throw new Error('mail niet geaccepteerd')

        return { verstuurd: true }
      } catch (e) {
        // Claim teruggeven: een storing bij de mailprovider mag iemands enige
        // poging niet opsouperen.
        await admin.rpc('bb_boss_geef_doorzet_vrij', {
          p_conversation_id: gesprekId, p_user_id: user.id,
        })
        console.error('doorzetten mislukt', (e as Error).message)
        return {
          verstuurd: false,
          reden: 'Het versturen lukte niet.',
          verwijs_naar: 'info@bossbase.nl',
        }
      }
    }

    // ── 6. Streamen, eventueel met een tussenstop voor de tool ───────────────
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        let volledig = ''
        const stuur = (t: string) => {
          volledig += t
          controller.enqueue(enc.encode(sse('tekst', { tekst: t })))
        }

        const bewaar = async () => {
          try {
            const gesprek = [
              ...binnen.map(m => ({ rol: m.rol, tekst: m.tekst })),
              { rol: 'boss', tekst: volledig, op: new Date().toISOString() },
            ]
            await admin.rpc('bb_boss_log_gesprek', {
              p_conversation_id: gesprekId,
              p_company_id: companyId,
              p_user_id: user.id,
              p_messages: gesprek,
              p_titel: String(binnen[0]?.tekst || '').slice(0, 80),
            })
          } catch (e) {
            console.error('gesprek bewaren mislukt', (e as Error).message)
          }
        }

        try {
          controller.enqueue(enc.encode(sse('gesprek', { id: gesprekId })))

          const ronde1 = await vraagAnthropic(historie, stuur)

          if (ronde1.tool?.naam === 'stuur_naar_team') {
            // De frontend kan hierop "Boss zet je vraag door…" tonen in plaats
            // van een stilstaande cursor.
            controller.enqueue(enc.encode(sse('bezig', { wat: 'doorzetten' })))

            const resultaat = await zetDoor(ronde1.tool.invoer)

            // Scheiding tussen wat Boss vóór de tool zei en wat hij erna zegt.
            // Zonder dit plakken de twee rondes aan elkaar: "…doen.Ik heb het
            // doorgestuurd" — één zin die uit twee losse antwoorden bestaat.
            if (ronde1.tekst && !/\s$/.test(ronde1.tekst)) stuur('\n\n')

            // Tweede ronde: Boss maakt zijn antwoord af met het toolresultaat.
            const vervolg = [
              ...historie,
              {
                role: 'assistant',
                content: [
                  ...(ronde1.tekst ? [{ type: 'text', text: ronde1.tekst }] : []),
                  { type: 'tool_use', id: ronde1.tool.id, name: ronde1.tool.naam, input: ronde1.tool.invoer },
                ],
              },
              {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: ronde1.tool.id,
                  content: JSON.stringify(resultaat),
                }],
              },
            ]
            await vraagAnthropic(vervolg, stuur)
          }

          await bewaar()
          controller.enqueue(enc.encode(sse('klaar', { tekens: volledig.length })))
        } catch (e) {
          console.error('stream afgebroken', (e as Error).message)
          await bewaar()
          controller.enqueue(enc.encode(sse('fout', {
            bericht: 'Boss kon het antwoord niet afmaken. Probeer het zo nog eens.',
          })))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (e) {
    console.error('boss-chat', e)
    return json({ error: 'Boss is even niet beschikbaar. Probeer het later opnieuw.' }, 500)
  }
})
