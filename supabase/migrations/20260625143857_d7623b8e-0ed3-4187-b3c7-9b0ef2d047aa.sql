CREATE POLICY "trip covers read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'trip-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "trip covers insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trip-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "trip covers update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'trip-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "trip covers delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'trip-covers' AND auth.uid()::text = (storage.foldername(name))[1]);