# Admin panel (Decap CMS + GitHub) — Setup Guide for Vercel

This lets you edit the menu and upload images via a secure admin UI. No database. Changes are saved to GitHub; Vercel auto‑deploys.

Important: a “static password in JS” is not secure (anyone can view it). Decap CMS uses GitHub login, so only permitted GitHub users can edit.

## Overview
- Host: Vercel (your current site)
- Storage: GitHub repo `zach11110/master-cake`
- Admin UI: Decap CMS at `/admin/`
- Auth: GitHub OAuth (tiny OAuth proxy needed)
- Files edited: `menu/manifest.json` (images in `menu/uploads/`)

Note: The website currently reads `menu/manifest.js`. When you are ready to use the CMS, we’ll flip the loader back to prefer `menu/manifest.json` on HTTP and fallback to JS locally. This is a 1‑line change I can do when you say “go”.

---

## 1) Create the OAuth app on GitHub (one‑time)
1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Application name: Master Cake CMS
3. Homepage URL: `https://master-cake.vercel.app`
4. Authorization callback URL: `https://YOUR-OAUTH-APP.vercel.app/callback`
   - This points to the OAuth proxy you’ll deploy in step 2.
5. Create → note the Client ID and Client Secret.

## 2) Deploy the OAuth proxy on Vercel (one‑time)
You need a tiny OAuth server that exchanges the GitHub code for a token securely.

Option A (recommended): Use the official Decap OAuth client
- Repo: decap-cms-oauth-client (formerly netlify-cms-oauth-client)
- Deploy to Vercel from that repo (as its own project)
- Set the following Environment Variables in that Vercel project:
  - `OAUTH_CLIENT_ID`: your GitHub OAuth Client ID
  - `OAUTH_CLIENT_SECRET`: your GitHub OAuth Client Secret
  - `GITHUB_REPO`: `zach11110/master-cake`
  - `GITHUB_SCOPE`: `public_repo`
  - `ALLOWED_ORIGINS`: `https://master-cake.vercel.app`
- After deployment, you will have a domain like `https://YOUR-OAUTH-APP.vercel.app`

Option B: Run the same OAuth proxy inside this project under `api/` (serverless functions). If you prefer this route, tell me and I’ll wire the minimal functions for you.

## 3) Add the admin UI to your site
This repo already includes the site. We’ll add:
- `admin/index.html` (loads Decap CMS UI)
- `admin/config.yml` (tells CMS where data lives)

I can add these files for you. For reference, the config will look like:

```yaml
backend:
  name: github
  repo: zach11110/master-cake
  branch: main
  base_url: https://YOUR-OAUTH-APP.vercel.app  # the OAuth proxy
  auth_endpoint: auth                           # endpoint provided by the proxy

publish_mode: editorial_workflow
media_folder: menu/uploads
public_folder: /menu/uploads

collections:
  - name: settings
    label: Menu Settings
    files:
      - file: menu/manifest.json
        label: Master Menu
        name: master_menu
        format: json
        fields:
          - label: Brand
            name: brand
            widget: object
            fields:
              - { label: Arabic Name, name: arName, widget: string }
              - { label: English Name, name: enName, widget: string }
              - { label: Arabic Tagline, name: tagAr, widget: string }
              - { label: English Tagline, name: tagEn, widget: string }

          - label: Sections
            name: sections
            widget: object
            fields:
              - label: Cold Drinks
                name: cold_drinks
                widget: object
                fields:
                  - { label: Arabic Label, name: ar, widget: string }
                  - { label: English Label, name: en, widget: string }
                  - label: Items
                    name: items
                    widget: list
                    fields:
                      - { label: ID, name: id, widget: string }
                      - { label: Arabic Name, name: arName, widget: string }
                      - { label: English Name, name: enName, widget: string }
                      - { label: Arabic Description, name: descriptionAr, widget: text, required: false }
                      - { label: English Description, name: descriptionEn, widget: text, required: false }
                      - label: Images
                        name: images
                        widget: list
                        field: { label: Image filename, name: image, widget: string }
              # Repeat a similar block for hot_drinks, sweets, argillies, ice_cream
```

Images uploaded in the media library will go to `menu/uploads/` and be committed to GitHub.

## 4) Flip the website to read JSON in production
When CMS is ready, we’ll change the loader to:
- Try `menu/manifest.json` over HTTP (on Vercel)
- Fallback to `menu/manifest.js` for local `file://` testing

I can make this change in `script.js` on your signal.

## 5) Grant access
- In your OAuth proxy settings, restrict allowed origins to your site
- In the repo, control who can push (GitHub collaborators). Only those with GitHub access can use the CMS.

## 6) Use the CMS
- Visit `https://master-cake.vercel.app/admin/`
- Log in with GitHub
- Edit the Manifest → Save → CMS opens a PR or commits to `main` (depending on `publish_mode`)
- Vercel auto‑deploys the changes

## Complexity & reliability
- Setup time: ~20–40 minutes (most of it is GitHub OAuth + Vercel env vars)
- Ongoing use: very easy (log in, edit fields, upload images, publish)
- Cost: free (GitHub + Vercel + Decap CMS)
- Works great for static content like your menu

## Want me to install it now?
Say “install CMS now”, and I’ll:
1) Add `admin/index.html` and `admin/config.yml` with your repo prefilled
2) Re‑introduce `menu/manifest.json` and update the site to read JSON first on production, keep JS fallback locally
3) Provide exact steps to create the GitHub OAuth app and the Vercel OAuth proxy