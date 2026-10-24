# CivicNeuro Platform Dashboard

Static HTML, CSS and vanilla JavaScript app for Platform Admin and Platform
Employee accounts.

## Run locally

From `apps/platform-admin`, run:

```sh
npm run dev
```

Open <http://localhost:4173/platform-admin/>. The static server serves the
`apps` folder so the dashboard can read the existing public resident runtime
configuration without copying or changing it. ES modules require HTTP; do not
open `index.html` using `file://`.

## Staff account setup

1. In the Supabase SQL Editor for the dashboard project, review and run
   [`../../supabase/manual/platform_dashboard.sql`](../../supabase/manual/platform_dashboard.sql).
2. Create Platform Admin and Platform Employee accounts in Supabase Auth.
3. Insert each Auth user UUID into `public.platform_staff`, assigning
   `platform_admin` or `platform_employee` and setting `full_name`.
4. Ensure the dashboard URL is included in Supabase Auth's allowed redirect
   URLs for password recovery. For local development, add this exact URL under
   **Authentication > URL Configuration > Redirect URLs**:
   `http://localhost:4173/platform-admin/?page=reset-password`

The browser uses only the configured Supabase URL and public anon key. Never
put a service-role key in this app.