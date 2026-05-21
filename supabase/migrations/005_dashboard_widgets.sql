-- dashboard_widgets: per-user widget layout stored in Supabase
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  widget_type text        NOT NULL,
  title       text,
  position    integer     NOT NULL DEFAULT 0,
  size        text        NOT NULL DEFAULT 'medium'
              CHECK (size IN ('small', 'medium', 'large', 'full')),
  settings    jsonb       NOT NULL DEFAULT '{}',
  is_visible  boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dw_select" ON dashboard_widgets FOR SELECT
  USING (
    user_id = auth.uid()
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "dw_insert" ON dashboard_widgets FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "dw_update" ON dashboard_widgets FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "dw_delete" ON dashboard_widgets FOR DELETE
  USING (user_id = auth.uid());
-- Keep updated_at in sync automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'dashboard_widgets_updated_at'
  ) THEN
    CREATE TRIGGER dashboard_widgets_updated_at
      BEFORE UPDATE ON dashboard_widgets
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
