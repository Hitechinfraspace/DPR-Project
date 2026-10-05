# Daily Progress Report

This is a static web app. Daily reports are saved in browser localStorage; reusable templates are stored in Supabase. GitHub Pages serves the frontend directly, so it does not need the Express/MySQL server.

## Configure Supabase

1. Create a Supabase project.
2. In `assets/js/app.js`, replace `SUPABASE_URL` with the project's Project URL and `SUPABASE_ANON_KEY` with its anon/publishable key. Never put a `service_role` key in frontend code.
3. Open the Supabase **SQL Editor** and run the contents of `schema.sql`. This creates `public.templates`, enables RLS, and grants anonymous read and insert access.

The public policies mean anyone who can access the site can read all templates and insert new ones. Do not store sensitive information in template content.

The existing manager also has update and delete actions. If you want those actions available to every site visitor, add these broader policies and grants in the SQL Editor. Anyone will then be able to update or delete any template:

```sql
GRANT UPDATE, DELETE ON TABLE public.templates TO anon, authenticated;

CREATE POLICY "Anyone can update templates"
  ON public.templates FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete templates"
  ON public.templates FOR DELETE TO anon, authenticated
  USING (true);
```

## Deploy to GitHub Pages

Push the project to GitHub, then open **Settings → Pages** for the repository. Select the branch and folder containing `index.html` (usually the root), and save. The app uses the Supabase JavaScript SDK from its CDN and has no frontend build step.

`schema.sql` contains the Supabase table and required public SELECT/INSERT setup. The Node/MySQL files in this repository are not used by GitHub Pages.