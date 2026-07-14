// Client Supabase (backend KVT). La clé "anon" ci-dessous est publique par
// conception (elle est faite pour tourner côté navigateur) — toute la
// protection des données vient des règles RLS définies côté serveur, pas
// du secret de cette clé.
window.sb = supabase.createClient(
  'https://gkwvzfflayktnuhtkoyb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdrd3Z6ZmZsYXlrdG51aHRrb3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NjQyMzgsImV4cCI6MjA5OTQ0MDIzOH0.iLYO9GSYTX14hrDOtLSvA92OFiJd-raTypq4-SjZm1g'
);
