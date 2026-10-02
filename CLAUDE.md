# Project Instructions for Claude Code

## פריסה ל-Cloudflare ודומיין (כללי — לכל אפליקציה, חדשה או קיימת)

השיטה הקבועה לכל האפליקציות. נבדקה ועובדת (EasyPen על תת-דומיין, vplus-studio על הדומיין הראשי — 1.10.2026). כשמבקשים "תעלה ל-Cloudflare" או "תחבר ל-xxx.vplusstudio.app" — פועלים לפי הסעיף הזה.

**עובדות קבועות**
- חשבון Cloudflare אחד. Account ID (לא סודי): `1c9c1dd0e8a1d80f324b974ae6a617fb`.
- כתובת ברירת מחדל: `<name>.ronmailx.workers.dev`. כתובת קבועה/מסחרית: `<app>.vplusstudio.app` (הדומיין נקנה באותו חשבון).
- הפריסה רק דרך **GitHub Actions + wrangler + API Token** ל-Cloudflare **Workers** (static assets).
- **לא** לחבר את GitHub דרך לוח הבקרה של Cloudflare (Pages → Import Git / Workers → Connect GitHub) ולא להשתמש ב-Cloudflare Pages — בנייד זה נתקע בלולאה.
- הכתובת ב-Cloudflare ממשיכה לעבוד גם אם הריפו הופך לפרטי (GitHub Pages בחינם — לא).

**לפני שמתחילים (באפליקציה קיימת)**
- לבדוק איך היא מתארחת היום (GitHub Pages / Vercel / Render) ואם יש שלב build. Cloudflare נוסף **במקביל** — לא מוחקים אירוח קיים בלי אישור.
- Cloudflare כאן מגיש קבצים סטטיים בלבד. Backend וסודות נשארים במקומם.
- לוודא שאין כבר Worker באותו `name` בחשבון (למשל `workers_list` אם יש חיבור Cloudflare) — אחרת הפריסה תדרוס אותו.

**שלושה קבצים בריפו**
1. `wrangler.jsonc`:
   ```jsonc
   // Cloudflare Workers: serves the app as static assets (no Worker script).
   {
     "name": "<app>",
     "compatibility_date": "<today YYYY-MM-DD>",
     "assets": { "directory": "." },
     "workers_dev": true,
     "routes": [{ "pattern": "<app>.vplusstudio.app", "custom_domain": true }]
   }
   ```
   - `name`: אותיות קטנות, ספרות ומקפים; קובע את כתובת ה-workers.dev.
   - אתר עם build (Vite/React וכו'): `directory` = תיקיית הפלט (`dist`/`build`). SPA עם ניתוב בצד-לקוח: להוסיף ל-`assets` את `"not_found_handling": "single-page-application"`.
   - **`"workers_dev": true` חובה כשיש `routes`** — בלי זה wrangler מכבה את הכתובת החינמית `<name>.ronmailx.workers.dev` (קרה ב-EasyPen). כך שתי הכתובות עובדות במקביל.
   - בלי דומיין עדיין: להשמיט את `routes`.
   - **אתר ראשי של העסק** (כמו vplus-studio) עולה על הדומיין עצמו ולא על תת-דומיין, יחד עם `www`, כדי שמי שמקליד www לא יקבל שגיאה:
     ```jsonc
     "routes": [
       { "pattern": "vplusstudio.app", "custom_domain": true },
       { "pattern": "www.vplusstudio.app", "custom_domain": true }
     ]
     ```
     רק אתר אחד יכול לתפוס את הדומיין הראשי (`vplusstudio.app` כבר תפוס ע"י vplus-studio); כל אפליקציה מקבלת תת-דומיין `<app>.vplusstudio.app`.
2. `.assetsignore` (רק כש-`directory` הוא `"."`) — מה **לא** עולה לאתר. להתאים לקבצים של הפרויקט, ולוודא שלא עולה שום דבר פרטי (`.env`, תיעוד פנימי):
   ```
   .git
   .github
   .claude
   .wrangler
   node_modules
   tests
   package.json
   package-lock.json
   wrangler.jsonc
   .assetsignore
   .gitignore
   CLAUDE.md
   PROJECT_STATE.md
   README.md
   ```
3. `.github/workflows/deploy-cloudflare.yml`:
   ```yaml
   # Deploys to Cloudflare Workers (see wrangler.jsonc) on every push to main.
   # Needs the repository secret CLOUDFLARE_API_TOKEN (template "Edit Cloudflare Workers").
   name: Deploy to Cloudflare
   on:
     push:
       branches: [main]
     workflow_dispatch:
   concurrency:
     group: deploy-cloudflare
     cancel-in-progress: true
   jobs:
     deploy:
       runs-on: ubuntu-latest
       permissions:
         contents: read
       env:
         CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
         CLOUDFLARE_ACCOUNT_ID: 1c9c1dd0e8a1d80f324b974ae6a617fb
       steps:
         - name: Check for API token
           id: token
           run: |
             if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
               echo "::notice::CLOUDFLARE_API_TOKEN secret is not set - skipping deploy."
               echo "present=false" >> "$GITHUB_OUTPUT"
             else
               echo "present=true" >> "$GITHUB_OUTPUT"
             fi
         - uses: actions/checkout@v4
           if: steps.token.outputs.present == 'true'
         - uses: actions/setup-node@v4
           if: steps.token.outputs.present == 'true'
           with:
             node-version: 22
         # Only for apps with a build step:
         # - run: npm ci && npm run build
         #   if: steps.token.outputs.present == 'true'
         - name: Deploy
           if: steps.token.outputs.present == 'true'
           run: npx --yes wrangler@4 deploy
   ```

**מה רק המשתמש עושה (פעם אחת לכל ריפו)** — Claude לא יכול להגדיר Secrets:
1. Cloudflare → My Profile → API Tokens → Create Token → תבנית **Edit Cloudflare Workers** → Account Resources: Include + החשבון → Zone Resources: Include + **Specific zone** → `vplusstudio.app` (אם האפליקציה בדומיין אחר — את הדומיין שלה; נבדק ב-vplus-studio: מספיק גם לדומיין הראשי וגם ל-www, בלי הרשאות נוספות) → שם לפי הפרויקט (`<app>-deploy`) → Create Token → Copy.
2. GitHub → הריפו → Settings → Secrets and variables → Actions → New repository secret → שם `CLOUDFLARE_API_TOKEN`.
- **מפתח נפרד לכל פרויקט** — ההמלצה המקובלת (מפתח לכל מטרה, לא מפתח-על אחד). זה לא מגביל הרשאות: כל מפתח מהתבנית יכול לשנות כל Worker בחשבון (Cloudflare לא מגביל מפתח ל-Worker אחד). היתרון: מבטלים/מחליפים מפתח שדלף בלי לשבור את הפריסה בריפו אחרים, ולפי השם יודעים מאיפה דלף. מפתחות ישנים עם All zones ממשיכים לעבוד — לא חובה להחליף.
- **החלפה (Roll)** לפחות פעם בשנה, ומיד בחשד לדליפה: Cloudflare → My Profile → API Tokens → המפתח → Roll → להעתיק → לעדכן את ה-Secret `CLOUDFLARE_API_TOKEN` באותו ריפו.
- לעולם לא לבקש להדביק אותו בצ'אט, ולא לשמור בקוד או בקובץ — רק כ-Secret.
- בלי ה-Secret ה-workflow מדלג (לא נכשל) — אפשר למזג את הקבצים לפני שהמשתמש מוסיף אותו.

**אחרי המיזוג — אימות**
- להפעיל/לחכות ל-workflow "Deploy to Cloudflare" ולקרוא את לוג ה-job: צריכות להופיע כתובת ה-workers.dev והשורה `<app>.vplusstudio.app (custom domain)`. ה-DNS ותעודת ה-HTTPS נוצרים לבד — **לא נוגעים בלוח הבקרה**.
- סביבת Claude בענן לא מגיעה לכתובות האלה (curl מחזיר 000) — המשתמש בודק בטלפון. תעודה חדשה יכולה לקחת 5–15 דקות. אסור `sleep` — לחכות ללוג עם לולאת until.
- נכשל על הרשאה → להוסיף הרשאה **למפתח הקיים** של הפרויקט, לא ליצור מפתח חדש.
- דומיין `.app` מחייב HTTPS (HSTS); Cloudflare מטפל בזה.

**כיבוי הכתובת החינמית `workers.dev`** (נבדק בפועל על flydeal, 2.10.2026)

ברירת המחדל (`workers_dev: true`) משאירה את שתי הכתובות פעילות
במקביל. אם רוצים **רק** את הדומיין המותאם:

1. ב-`wrangler.toml`/`wrangler.jsonc`: `workers_dev: false`.
2. **חובה גרסת Wrangler 4 ומעלה.** עם Wrangler 3 (גם עם כל ההרשאות
   הנכונות בטוקן) הפריסה נכשלת באופן עקבי עם
   `A request to the Cloudflare API (/zones/.../workers/routes) failed.
   No access to the specified resource.` - זה באג/מגבלה אמיתית
   בגרסה הישנה בשילוב `custom_domain` + `workers_dev: false`, **לא**
   בעיית הרשאות (נבדק: 5 טוקנים שונים עם הרשאות מלאות, כולם נכשלו
   זהה; הבעיה נפתרה מיידית אחרי שדרוג ל-v4). ב-`cloudflare/wrangler-action`:
   `wranglerVersion: "4"`. בקריאה ישירה (`npx --yes wrangler@4 deploy`,
   התבנית הסטנדרטית למעלה) - זה כבר תקין.
3. (לפי תיעוד Cloudflare הרשמי, ליתר ביטחון): לוודא שלטוקן יש גם
   **Zone → Workers Routes → Edit** (בנוסף ל-Workers Scripts:Edit) -
   My Profile → API Tokens → הטוקן → Edit → Permissions → Add more.
4. Push. הלוג אחרי דיפלוי מוצלח יראה **רק** את שורת ה-Custom Domain,
   בלי שורת workers.dev.

**כיבוי דרך הדשבורד** (ידני, בלי דיפלוי): Worker → Settings →
Domains & Routes → ליד `workers.dev` → Disable. **אזהרה:** בלי
`workers_dev: false` גם בקובץ - הדיפלוי הבא יחזיר את workers.dev
אוטומטית.


**אפליקציה עם Service Worker / PWA / אחסון מקומי**
- Cloudflare מפנה `page.html` → `/page`, ודפדפן מסרב להגיש מהמטמון תגובה מופנית לניווט → האופליין נשבר. כל תגובה לפני `cache.put` עוברת דרך `unredirect`, ובחיפוש ניווט במטמון מנסים גם את גרסת ה-`.html`:
  ```js
  async function unredirect(response) {
    if (!response.redirected) return response;
    return new Response(await response.blob(), {
      status: response.status, statusText: response.statusText, headers: response.headers
    });
  }
  // /legal → /legal.html, / → /index.html
  function prettyToHtml(href) {
    const u = new URL(href);
    u.search = '';
    if (u.pathname.endsWith('/')) u.pathname += 'index.html';
    else if (!/\.[a-z0-9]+$/i.test(u.pathname)) u.pathname += '.html';
    return u.href;
  }
  ```
- כתובת חדשה = origin חדש: נתונים מקומיים (localStorage / IndexedDB) והתקנת PWA **לא עוברים**. לחבר את הדומיין לפני שמשווקים; באפליקציה קיימת עם משתמשים — להזהיר את המשתמש לפני שמפנים אליה.
- Firebase Auth / OAuth: להוסיף את הדומיין החדש ל-Authorized domains (אחרת ההתחברות תיכשל בכתובת החדשה).
- לעדכן את הכתובת ב-README, ב-PROJECT_STATE.md, וב-manifest / מסמכים משפטיים אם היא מופיעה בהם.
