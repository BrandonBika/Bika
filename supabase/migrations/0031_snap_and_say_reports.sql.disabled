CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_url text,
  image_url text,
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  device_timestamp timestamptz,
  original_transcription text,
  detected_language text,
  english_translation text,
  visual_evidence_summary text,
  photo_matches_report boolean DEFAULT true,
  issue_category text NOT NULL DEFAULT 'Unclear report',
  urgency text NOT NULL DEFAULT 'MEDIUM',
  requires_immediate_dispatch boolean NOT NULL DEFAULT false,
  extracted_location text,
  recommended_organization jsonb,
  alternative_organizations jsonb NOT NULL DEFAULT '[]'::jsonb,
  classification_confidence double precision NOT NULL DEFAULT 0,
  routing_confidence double precision NOT NULL DEFAULT 0,
  needs_human_review boolean NOT NULL DEFAULT false,
  review_reason text,
  gps_status text NOT NULL DEFAULT 'no_gps',
  status text NOT NULL DEFAULT 'Pending Dispatch',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS resident_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS detected_language text,
  ADD COLUMN IF NOT EXISTS photo_matches_report boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_immediate_dispatch boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS alternative_organizations jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS classification_confidence double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS routing_confidence double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_human_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS location_accuracy double precision,
  ADD COLUMN IF NOT EXISTS device_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS original_transcription text,
  ADD COLUMN IF NOT EXISTS english_translation text,
  ADD COLUMN IF NOT EXISTS visual_evidence_summary text,
  ADD COLUMN IF NOT EXISTS issue_category text DEFAULT 'Unclear report',
  ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS extracted_location text,
  ADD COLUMN IF NOT EXISTS recommended_organization jsonb,
  ADD COLUMN IF NOT EXISTS gps_status text DEFAULT 'no_gps',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Pending Dispatch',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Residents can insert their own reports" ON public.reports;
CREATE POLICY "Residents can insert their own reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = resident_id);

DROP POLICY IF EXISTS "Residents can view their own reports" ON public.reports;
CREATE POLICY "Residents can view their own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = resident_id);

DROP POLICY IF EXISTS "Residents can update their own reports" ON public.reports;
CREATE POLICY "Residents can update their own reports"
  ON public.reports FOR UPDATE
  USING (auth.uid() = resident_id)
  WITH CHECK (auth.uid() = resident_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-reports', 'audio-reports', false),
       ('image-reports', 'image-reports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Residents can view their Snap and Say audio" ON storage.objects;
CREATE POLICY "Residents can view their Snap and Say audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Residents can view their Snap and Say images" ON storage.objects;
CREATE POLICY "Residents can view their Snap and Say images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'image-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
