import { useState } from 'react';
import MarketingShell from './MarketingShell.jsx';

const InfoIcon = {
  mail: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  phone: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.99 1.18 2 2 0 013 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>,
  pin: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  chat: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
};

export default function ContactPage({ navigate, isAuthenticated }) {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    naam: '', bedrijf: '', email: '', branche: 'Schilders', vraag: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const onSubmit = e => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <MarketingShell navigate={navigate} active="contact" isAuthenticated={isAuthenticated}>
      <div className="mkt-c">
        <header className="mkt-page-hd mkt-rev">
          <div>
            <div className="mkt-sec-num">Contact</div>
            <h1>Laat het ons<br /><em>even weten.</em></h1>
          </div>
          <p>
            We pakken zelf de telefoon op. Stuur een bericht via dit formulier —
            of bel direct. We reageren binnen één werkdag, vaak sneller.
          </p>
        </header>

        <section className="mkt-sec mkt-sec--first" style={{ paddingTop: 16, borderTop: 0 }}>
          <div className="mkt-contact-grid mkt-rev">
            <aside className="mkt-contact-side">
              <div className="mkt-sec-num">Direct contact</div>
              <h2>Liever <em>de korte weg?</em></h2>
              <p>
                Geen formulieren-mens? Wij ook niet. Je kunt ons direct mailen
                of bellen op werkdagen tussen 08:30 en 17:30.
              </p>
              <ul className="mkt-contact-info">
                <li>
                  <span className="mkt-contact-icon">{InfoIcon.mail}</span>
                  <div>
                    <b>info@bossbase.nl</b>
                    <span>Mail · &lt; 1 werkdag</span>
                  </div>
                </li>
                <li>
                  <span className="mkt-contact-icon">{InfoIcon.phone}</span>
                  <div>
                    <b>+31 (0)85 808 35 80</b>
                    <span>Telefoon · ma–vr 08:30–17:30</span>
                  </div>
                </li>
                <li>
                  <span className="mkt-contact-icon">{InfoIcon.chat}</span>
                  <div>
                    <b>Chat in de app</b>
                    <span>Voor klanten · 24/7 archief</span>
                  </div>
                </li>
                <li>
                  <span className="mkt-contact-icon">{InfoIcon.pin}</span>
                  <div>
                    <b>Utrecht · Zwolle</b>
                    <span>Bezoek alleen op afspraak</span>
                  </div>
                </li>
              </ul>
            </aside>

            <form className="mkt-form" onSubmit={onSubmit}>
              {sent ? (
                <div className="mkt-form-success">
                  <strong>Bericht verstuurd.</strong> We nemen binnen één werkdag contact op met <b>{form.email}</b>.
                  <div style={{ marginTop: 14 }}>
                    <button type="button" className="mkt-btn mkt-btn--ghost mkt-btn--sm" onClick={() => { setSent(false); setForm({ naam:'', bedrijf:'', email:'', branche:'Schilders', vraag:'' }); }}>
                      Nieuw bericht
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="mkt-form-row">
                <div className="mkt-field">
                  <label htmlFor="naam">Naam</label>
                  <input id="naam" required value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Voor- en achternaam" />
                </div>
                <div className="mkt-field">
                  <label htmlFor="bedrijf">Bedrijf</label>
                  <input id="bedrijf" value={form.bedrijf} onChange={e => set('bedrijf', e.target.value)} placeholder="Bedrijfsnaam (optioneel)" />
                </div>
              </div>
              <div className="mkt-form-row">
                <div className="mkt-field">
                  <label htmlFor="email">E-mail</label>
                  <input id="email" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="naam@bedrijf.nl" />
                </div>
                <div className="mkt-field">
                  <label htmlFor="branche">Branche</label>
                  <select id="branche" value={form.branche} onChange={e => set('branche', e.target.value)}>
                    <option>Schilders</option>
                    <option>Hoveniers</option>
                    <option>Klusbedrijven</option>
                    <option>Stukadoors</option>
                    <option>Loodgieters</option>
                    <option>Installateurs</option>
                    <option>Andere vakbranche</option>
                  </select>
                </div>
              </div>
              <div className="mkt-field">
                <label htmlFor="vraag">Vraag</label>
                <textarea id="vraag" required value={form.vraag} onChange={e => set('vraag', e.target.value)} placeholder="Vertel waar we mee kunnen helpen — een demo, prijsvraag, of iets anders." />
              </div>
              <div className="mkt-form-foot">
                <span>Wij gebruiken je gegevens alleen om je vraag te beantwoorden.</span>
                <button type="submit" className="mkt-btn mkt-btn--primary">
                  <span className="mkt-btn-dot" /> Verstuur bericht
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <section className="mkt-final">
        <div className="mkt-final-in mkt-rev">
          <div className="mkt-sec-num mkt-sec-num--light" style={{ justifyContent: 'center' }}>Liever zelf rondkijken?</div>
          <h2>Geen tijd om<br />te wachten?</h2>
          <p>Maak in 5 minuten een gratis account aan — of bekijk de demo. Geen verplichtingen.</p>
          <div className="mkt-final-ctas">
            <button className="mkt-btn mkt-btn--brand mkt-btn--lg" onClick={() => navigate('/register')}>Start gratis</button>
            <button className="mkt-btn mkt-btn--inverse mkt-btn--lg" onClick={() => navigate('/demo')}>Bekijk demo →</button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
