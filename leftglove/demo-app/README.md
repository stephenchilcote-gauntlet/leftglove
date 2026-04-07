# DemoApp

Target web application for ShiftLefter sieve testing and the capstone demo.
This is a deliberately simple app with clean, semantic HTML that the sieve
can inventory reliably. It is designed to be modified by an agent during
demos — the HTML templates are the important part.

## Quick Start

```bash
npm install
npm start       # http://localhost:3000
npm run dev     # hot-reload via nodemon
PORT=3001 npm start   # custom port
```

## Credentials

| Email | Password | Name |
|---|---|---|
| alice@example.com | password1 | Alice |
| bob@example.com | password2 | Bob |

Configured in `config.js`. Sessions are cookie-based — different browsers
get independent sessions (multi-user works automatically).

## Pages

- **`/login`** — The primary demo page. 10 sieveable elements.
- **`/dashboard`** — Post-login landing. Shows logged-in user name and email.
- **`/logout`** — Clears session, redirects to login.
- **`/`** — Redirects to `/dashboard` if logged in, `/login` if not.

## Modifying the App

The HTML lives in `views/*.ejs`. EJS templates are plain HTML with minimal
`<%= value %>` tags for dynamic content. The login page (`views/login.ejs`)
has zero dynamic content except the error message — it's effectively a
static HTML file.

### The "Remember Me" Demo Diff

The capstone demo moment: add a checkbox to the login form. Insert these
3 lines before the submit button in `views/login.ejs` (look for the
`REMEMBER ME INSERTION POINT` comment):

```html
<div class="form-group">
  <label for="remember-me"><input type="checkbox" id="remember-me" name="remember-me" data-testid="remember-me"> Remember me</label>
</div>
```

No server-side changes needed — the form handler ignores unknown fields.
The sieve detects +1 clickable element. The glossary diff shows
`Login.remember-me` appeared.

### Adding a New Page

1. Create `views/mypage.ejs` (full HTML document)
2. Create `routes/mypage.js` (Express router, export it)
3. Mount in `server.js`: `app.use('/', require('./routes/mypage'))`

Use `requireAuth` middleware from `middleware/auth.js` for protected pages.

## Sieve Element Inventory (Login Page)

| Element | Sieve Class | data-testid |
|---|---|---|
| `a` "DemoApp" | clickable | nav-home |
| `a` "Login" | clickable | nav-login |
| `h1` "Sign In" | readable | — |
| `p[role=status]` status message | readable | status-msg |
| `input[type=email]` "Email address" | typable | email-input |
| `input[type=password]` "Password" | typable | password-input |
| `button[type=submit]` "Sign In" | clickable | login-submit |
| `a` "Forgot your password?" | clickable | forgot-password |
| `nav` | chrome | — |
| `footer` | chrome | — |

Intentional noise (empty wrapper divs, spacers, hidden elements) is present
and should be filtered by the sieve.

## Architecture Notes

- **Express** with **EJS** templates and **cookie-session**
- Config centralized in `config.js` — users, behaviors, port
- Route-per-page modules in `routes/`
- No build step — `node server.js` runs it directly
- Designed for future extension: iframes, collections, dynamic elements,
  scenario configs (see plan notes in the repo)
