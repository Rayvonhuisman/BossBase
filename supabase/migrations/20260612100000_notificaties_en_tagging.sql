-- ── NOTIFICATIES TABEL ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  type        text        NOT NULL,
  -- 'mention' | 'toewijzing_activiteit' | 'toewijzing_deal' | 'toewijzing_werkbon' | 'toewijzing_project'
  title       text        NOT NULL,
  body        text,
  link        text,
  related_type text,      -- 'klant' | 'werkbon' | 'project' | 'activiteit' | 'deal'
  related_id  uuid,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_user_select" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_user_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notifications_company_insert" ON notifications
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- ── ASSIGNED_TO OP ACTIVITEITEN (bestaat wellicht al) ────────────────────────
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ── ASSIGNED_TO OP DEALS ─────────────────────────────────────────────────────
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;
