CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.templates TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can read templates" ON public.templates;
CREATE POLICY "Anyone can read templates"
  ON public.templates
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert templates" ON public.templates;
CREATE POLICY "Anyone can insert templates"
  ON public.templates
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);