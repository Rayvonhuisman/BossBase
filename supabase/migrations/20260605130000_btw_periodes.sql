CREATE TABLE btw_periodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  periode_type text NOT NULL,
  periode_label text NOT NULL,
  periode_start date NOT NULL,
  periode_eind date NOT NULL,
  btw_ontvangen_21 numeric DEFAULT 0,
  btw_ontvangen_9 numeric DEFAULT 0,
  omzet_0_tarief numeric DEFAULT 0,
  btw_betaald_21 numeric DEFAULT 0,
  btw_betaald_9 numeric DEFAULT 0,
  last_synced_at timestamptz DEFAULT now(),
  UNIQUE(company_id, periode_start, periode_type)
);

ALTER TABLE btw_periodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btw_periodes_company" ON btw_periodes
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
