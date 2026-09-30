// Vervangt std/http/server.ts: registreert de handler in plaats van te luisteren.
export function serve(handler: (req: Request) => Response | Promise<Response>) {
  (globalThis as any).__registreer(handler)
}
