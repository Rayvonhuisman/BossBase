import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt } from '../bb-shared.jsx';

// De staafgrafiek van Financiën in een eigen bestand, zodat recharts (±350 kB)
// alleen laadt als iemand Financiën opent — niet ook bij de Agenda, die in
// hetzelfde BbPages2-bestand staat (audit 2026-10-01, P6).
export default function FinancienGrafiek({ chartData, chartMode, chartPeriod, modeLabel }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--dl)' }} axisLine={false} tickLine={false} interval={chartPeriod === 'maand' ? 4 : 0} />
        <YAxis
          tickFormatter={v => v === 0 ? '€0' : `€${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11, fill: 'var(--dl)' }}
          axisLine={false} tickLine={false} width={44}
        />
        <Tooltip
          formatter={(v, name) => [fmt(v), modeLabel || name]}
          contentStyle={{ border: '1px solid var(--border)', borderRadius: 8, fontSize: '.8rem', boxShadow: 'none' }}
          cursor={{ fill: 'rgba(0,0,0,.03)' }}
        />
        <Bar dataKey={chartMode} fill={chartMode === 'kosten' ? '#dc2626' : '#1DDB62'} radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
