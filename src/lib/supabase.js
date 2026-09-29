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

// Het productieproject. URL en anon-key zijn publiek: ze staan in elke
// browserbundel en geven alleen toegang binnen de databaseregels (RLS). Ze staan
// hier als terugval, zodat een build zonder VITE_-variabelen (zoals een
// Vercel-preview waar ze ontbraken) niet stil een wit scherm oplevert. Een
// omgevingsvariabele heeft altijd voorrang, bijvoorbeeld voor een testproject.
// De service-role key hoort hier NOOIT: die blijft server-side.
const PRODUCTIE_URL = "https://mawzqpnsluljxpbarhng.supabase.co"
const PRODUCTIE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hd3pxcG5zbHVsanhwYmFyaG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODQzMTYsImV4cCI6MjA5MzU2MDMxNn0.yJeP2p0go9wttF9hAiNgYd1fMi71KIcnb7KbEdhrNaw"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || PRODUCTIE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || PRODUCTIE_ANON_KEY

if (!isDemo && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Missing Supabase environment variables")
}

// Geen login, geen mails, geen opslag. Schrijfacties landen in het geheugen,
// zodat klikken in het voorbeeldscherm wél reageert.
export const supabase = isDemo
  ? nepSupabase
  : createClient(supabaseUrl, supabaseAnonKey)
