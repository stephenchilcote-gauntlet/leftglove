# DemoApp

Target web application for ShiftLefter sieve testing and the capstone demo.
A deliberately simple app with clean, semantic HTML that the sieve can
inventory reliably.

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
get independent sessions.

## Pages

- **`/login`** — Login page. 10 sieveable elements. The primary demo entry point.
- **`/fundraiser`** — Post-login landing. Crowdfunding page with donate form,
  social actions, supporter comments. The recurring donation toggle is the
  demo diff moment.
- **`/logout`** — Clears session, redirects to login.
- **`/`** — Redirects to `/fundraiser` if logged in, `/login` if not.

## Modifying the App

The HTML lives in `views/*.ejs`. EJS templates are plain HTML with minimal
`<%= value %>` tags for dynamic content.

### The "Recurring Donation" Demo Diff

The capstone demo moment: toggle the recurring donation checkbox on the
fundraiser page. Use the toggle API:

```bash
# Enable
curl -X POST http://localhost:3000/set-recurring -H 'Content-Type: application/json' -d '{"enabled": true}'

# Disable
curl -X POST http://localhost:3000/set-recurring -H 'Content-Type: application/json' -d '{"enabled": false}'
```

The sieve detects +1 clickable element. The glossary diff shows
`Fundraiser.recurring-checkbox` appeared.

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

## Architecture Notes

- **Express** with **EJS** templates and **cookie-session**
- Config centralized in `config.js` — users, session secret, port
- Routes defined inline in `server.js`
- No build step — `node server.js` runs it directly
