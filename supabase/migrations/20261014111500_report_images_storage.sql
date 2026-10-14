-- =============================================================================
-- LostLink — Migration: Secure Supabase Storage for Report Images
-- Migration Timestamp: 20261014111500
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create or configure the dedicated private storage bucket: report-images
-- -----------------------------------------------------------------------------
-- Enforces a 5MB maximum file size limit and restricts formats to JPEG, PNG, and WebP.
-- Set to private (public = false) so that direct unauthenticated requests are blocked.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-images',
  'report-images',
  false,
  5242880, -- 5 MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- -----------------------------------------------------------------------------
-- 2. Storage Row-Level Security (RLS) Policies on storage.objects
-- -----------------------------------------------------------------------------

-- Read Policy: Authenticated campus students can view report images
-- Subject to LostLink's shared visibility model where authenticated users can view campus reports
DROP POLICY IF EXISTS "Authenticated students can view report images" ON storage.objects;
CREATE POLICY "Authenticated students can view report images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'report-images');

-- Upload Policy: Authenticated students can upload images only into their own folder: {userId}/*
-- Enforces folder ownership via verified auth.uid(); never trusts client-supplied user parameters
DROP POLICY IF EXISTS "Students can upload images to own folder" ON storage.objects;
CREATE POLICY "Students can upload images to own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update Policy: Students can only modify or replace images in their own folder
DROP POLICY IF EXISTS "Students can update own images" ON storage.objects;
CREATE POLICY "Students can update own images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'report-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'report-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete Policy: Students can only delete images in their own folder
DROP POLICY IF EXISTS "Students can delete own images" ON storage.objects;
CREATE POLICY "Students can delete own images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
