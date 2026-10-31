# tests/playwright — partner public-route a11y checks

Playwright is **not** declared by this app. The runner resolves from the
workspace root (`C:\Users\DELL\Desktop\Burgonomics\node_modules`), so run the
command **from this app's directory**. Do not add a Playwright dependency here
without the repo owner's decision.

```powershell
$env:UI_BASE_URL = "http://localhost:4321"
npx --no-install playwright test -c tests/playwright/ui-a11y-gestures.config.ts
Remove-Item Env:\UI_BASE_URL
```

The suite needs an already-served build. It creates no session and submits no
credentials: it checks labels, focus rings, tab order and the `/admin/login`
redirect. Without `UI_BASE_URL` every test skips (a skip is not a pass), and the
spec throws in CI if the variable is unset.

Covered routes: `/login`, `/admin/login` (redirect only). The authenticated
drawer/KDS/orders surfaces need a real session and are out of scope here.

`test-results/` and `playwright-report/` are generated and not currently
ignored by this repo's `.gitignore`; stage `tests/playwright` explicitly.
