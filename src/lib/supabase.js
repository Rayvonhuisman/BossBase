import { createClient } from "@supabase/supabase-js"
import { nepSupabase } from "../demo/nepSupabase.js"

// ── Demo (bossbase.nl/demo) ─────────────────────────────────────────────────
// De demo draait de ECHTE schermen op nepdata. Dat lukt alleen als de data-laag
// wordt omgeleid, niet de schermen zelf: alle 37 bestanden die data ophalen
// importeren `supabase` uit dit ene bestand. Eén schakelaar hier betekent dus
// nul demo-takken in services, pagina's en componenten.
//
// De keuze valt op basis van het PAD, niet op React-state: deze module wordt
// geladen voordat er ook maar iets gerenderd is, en moet dan al vaststaan.
export const isDemo = typeof window !== "undefined"
  && window.location.pathname.startsWith("/demo")

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!isDemo && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Missing Supabase environment variables")
}

// In de demo wordt er geen echte verbinding gemaakt: geen login, geen mails,
// geen opslag. Schrijfacties landen in het geheugen zodat klikken wel reageert.
export const supabase = isDemo
  ? nepSupabase
  : createClient(supabaseUrl, supabaseAnonKey)
