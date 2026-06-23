// Gedeelde hash voor e-mailverificatiecodes. De code wordt nooit plain
// opgeslagen; we hashen SHA-256 over `${code}:${userId}` zodat de hash aan de
// gebruiker gebonden is (rainbow tables over losse 6-cijfercodes zijn nutteloos).
export async function hashVerificationCode(code: string, userId: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${userId}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
