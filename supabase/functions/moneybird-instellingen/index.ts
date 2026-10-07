import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient } from "../_shared/scheduledSync.ts"
import { clientFout } from '../_shared/clientFout.ts'
import { laadKoppeling } from "../_shared/moneybird.ts"
import { laadIndeling, standaardIndeling, controleNaKoppelen, maakInkoopRekening, KOSTEN_CATEGORIEEN } from "../_shared/moneybirdIndeling.ts"

// De grootboekrekeningen en btw-tarieven uit de Moneybird-administratie van de
// klant, plus wat de standaardindeling per regel zou kiezen. Voedt het
// instellingenscherm (GrootboekIndeling, provider 'moneybird') — de Moneybird-
// tegenhanger van snelstart-grootboek-setup { lijst: true }.
//
// De standaarden komen van hier en worden niet in de app nagebouwd: twee lijsten
// die uit elkaar lopen geeft een scherm dat iets anders belooft dan de sync doet.
//
// Alleen admins, alleen de administratie van het eigen bedrijf.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  try {
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)
    const { data: profile } = await admin.from('profiles').select('company_id, role').eq('id', user.id).maybeSingle()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)
    if (profile.role !== 'admin') return json({ error: 'Alleen admins kunnen de boekhoudinstellingen beheren' }, 403)

    const k = await laadKoppeling(admin, profile.company_id)
    if (!k) return json({ success: false, error: 'Moneybird is niet gekoppeld' }, 400)

    // Knop "Aanmaken" in de checklist: de inkoopcategorie in Moneybird aanmaken.
    // Daarna gewoon de lijst teruggeven, zodat het vinkje meteen klopt.
    const body = await req.json().catch(() => ({}))
    if (body?.actie === 'aanmaken' && body?.wat === 'inkoop') await maakInkoopRekening(k)

    const ind = await laadIndeling(k)
    // Ook de categorieën die de klant zelf heeft toegevoegd: die krijgen een
    // standaard als hun naam op een rekening lijkt.
    const { data: cats } = await admin.from('kosten_categorieen').select('naam').eq('company_id', profile.company_id)
    const categorieen = [...new Set([...KOSTEN_CATEGORIEEN, ...(cats || []).map((c: any) => String(c.naam))])]

    return json({
      success: true,
      grootboeken: ind.rekeningen.filter(r => r.soort !== 'overig')
        .sort((a, b) => (a.code ?? a.naam).localeCompare(b.code ?? b.naam, 'nl', { numeric: true })),
      btwTarieven: ind.tarieven.sort((a, b) => b.pct - a.pct || a.naam.localeCompare(b.naam, 'nl')),
      standaarden: standaardIndeling(ind, categorieen),
      controle: controleNaKoppelen(ind, k.administratieId),
    })
  } catch (err: any) {
    console.error('moneybird-instellingen:', err?.message)
    return json({ success: false, error: clientFout(err) }, 500)
  }
})
