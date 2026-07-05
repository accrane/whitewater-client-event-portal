-- Private Supabase Storage bucket for client portal uploads.
-- The app uploads through server actions with the service-role client, so no public
-- storage object policies are added here. Future admin download/review work should
-- use signed URLs or explicit authenticated policies rather than making this bucket
-- public.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-uploads',
  'event-uploads',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
