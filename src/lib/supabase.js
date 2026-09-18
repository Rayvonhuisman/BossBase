import { createClient } from "@supabase/supabase-js"
import { nepSupabase } from "../demo/nepSupabase.js"

// ── Voorbeeldscherm op de homepage ──────────────────────────────────────────
// Het blok "Klik er zelf doorheen" laadt de ECHTE app in een kader, zodat het
// altijd een exacte kopie is in plaats van een nabouw die uit de pas loopt.
// Die kopie draait onder /demo op nepdata.
//
// Alle 37 bestanden die data ophalen importeren `supabase` uit dit ene bestand.
// Eén schakelaar hier betekent dus nul demo-takken in services, pagina's en
// componenten. De keuze valt op het PAD, niet op React-state: deze module wordt
// geladen voordat er iets gerenderd is en moet dan al vaststaan.
export const isDemo = typeof window !== "undefined"
  && window.location.pathname.startsWith("/demo")

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!isDemo && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Missing Supabase environment variables")
}

// Geen login, geen mails, geen opslag. Schrijfacties landen in het geheugen,
// zodat klikken in het voorbeeldscherm wél reageert.
export const supabase = isDemo
  ? nepSupabase
  : createClient(supabaseUrl, supabaseAnonKey)
