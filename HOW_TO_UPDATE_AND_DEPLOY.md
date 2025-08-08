# How to update items/images and deploy to Vercel (Windows PowerShell)

Follow these steps every time you add new items or images. You do NOT run `git init` again; that was only needed once.

## 0) Prerequisites
- Git is installed (`git --version`).
- Your repo remote is set to `https://github.com/zach11110/master-cake.git`.
- Your project folder is: `D:\My work\Master_cake_menu`.

## 1) Open PowerShell and go to the project
```powershell
Start-Process powershell
cd "D:\My work\Master_cake_menu"
```

## 2) Get latest from GitHub (good habit)
```powershell
git status
# Make sure you are on main
git checkout main
# Pull latest changes from GitHub
git pull --rebase
```

If you see “There is no tracking information for the current branch”, set upstream once:
```powershell
git branch -u origin/main
```

## 3) Add your images and items
- Place images in the correct section folder:
  - Cold → `menu/cold_drinks/`
  - Hot → `menu/hot_drinks/`
  - Sweets → `menu/sweets/`
  - Argillies → `menu/argillies/`
  - Ice cream → `menu/ice_cream/`
- Update `menu/manifest.js`:
  - Add or edit the item object
  - Put the image file names (exactly) in the `images: []` array

Example (add Iced Spanish Latte):
```js
{
  id: 'iced-spanish-latte',
  arName: 'ايسد سبانيش لاتيه',
  enName: 'Iced Spanish Latte',
  descriptionAr: 'حليب مكثف محلى مع اسبريسو وثلج.',
  descriptionEn: 'Sweetened condensed milk, espresso, and ice.',
  images: ['iced-spanish-latte-1.jpg', 'iced-spanish-latte-2.jpg']
}
```

Tips:
- Use `.jpg` (recommended). Case-sensitive on Vercel.
- Filenames in `manifest.js` must match files in the folder exactly.
- For multiple photos, add more names in the `images` array.

Bulk rename `.jfif` to `.jpg` (if needed):
```powershell
cd "D:\My work\Master_cake_menu\menu\cold_drinks"
Get-ChildItem -Filter *.jfif | Rename-Item -NewName { $_.Name -replace '\.jfif$', '.jpg' }
```

## 4) Test locally
- Double-click `index.html` (we use JS manifest; no CORS issue)
- Click an item → gallery opens
- Toggle AR/EN → layout flips; meta updates

## 5) Stage, commit, push (deploy)
```powershell
cd "D:\My work\Master_cake_menu"
git status
git add -A
# Write a clear message describing your change
git commit -m "feat(menu): add iced spanish latte images and item"
# Push to GitHub → Vercel auto-deploys
git push
```

Vercel redeploys automatically in ~30–60s. Open your site to confirm.

## 6) Verify share previews (optional)
- Facebook: https://developers.facebook.com/tools/debug/
- Twitter: https://cards-dev.twitter.com/validator
- WhatsApp may cache a few mins; try sharing the root URL.

## 7) Optional: work in a feature branch with a Preview URL
```powershell
git checkout -b feature/new-items
git add -A
git commit -m "feat: add 5 new cold drinks"
git push -u origin feature/new-items
```
Create a Pull Request on GitHub. Vercel will post a Preview link. Merge to `main` when happy.

## 8) Troubleshooting
- Remote not set? (first push on a new machine)
```powershell
git remote -v
# If empty, set it:
git remote add origin https://github.com/zach11110/master-cake.git
git branch -M main
git push -u origin main
```
- Merge conflicts when pulling:
```powershell
git pull --rebase
# If conflicts appear, open the files, fix, then:
git add -A
git rebase --continue
```
- Wrong filename case (works locally, fails on Vercel):
  - Ensure the case in `manifest.js` matches the actual file name 1:1.
- Rollback:
  - On Vercel, promote a previous deployment; or in Git:
```powershell
git revert <commit-sha>
git push
```

You’re all set. Add items, commit, push → live.