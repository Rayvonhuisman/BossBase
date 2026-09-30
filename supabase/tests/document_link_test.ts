// Draaien:  node --experimental-strip-types supabase/tests/document_link_test.ts
import { padUit, verwijzing, KORT_GELDIG } from '../functions/_shared/documentLink.ts'
let f = 0
const c = (n: string, ok: boolean, d?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' → ' + JSON.stringify(d)}`); if (!ok) f++ }
c('verwijzing heeft de vorm bucket/pad', verwijzing('signatures', 'a/b.png') === 'signatures/a/b.png')
c('pad uit verwijzing', padUit('signatures', 'signatures/a/b.png') === 'a/b.png')
c('pad uit oude ondertekende URL', padUit('signatures', 'https://x.supabase.co/storage/v1/object/sign/signatures/werkbon-1.png?token=abc') === 'werkbon-1.png')
c('pad uit oude publieke URL', padUit('signed-offertes', 'https://x.supabase.co/storage/v1/object/public/signed-offertes/c/o.pdf') === 'c/o.pdf')
c('URL van een andere bucket: geen pad', padUit('signatures', 'https://x.supabase.co/storage/v1/object/sign/signed-werkbonnen/w.pdf?token=a') === null)
c('verwijzing van een andere bucket wordt niet als pad in deze bucket gelezen', padUit('signatures', 'signed-werkbonnen/w.pdf') !== 'w.pdf')
c('leeg: null', padUit('signatures', null) === null)
c('geldigheid 10 minuten', KORT_GELDIG === 600)
console.log(f ? `${f} mislukt` : 'Alle tests geslaagd'); process.exit(f ? 1 : 0)
