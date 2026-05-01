# Password Keychain 🛡️

A secure, minimalist password vault for managing digital credentials. Built with speed, security, and portability in mind.

## Features

- **Secure Identity Management**: Token-based authentication verifying every request.
- **Minimalist Interface**: Clean, distraction-free UI with responsive design and dark mode support.
- **Supabase Powered**: High-performance backend using Supabase Edge Functions for secure data handling.
- **Smart Search & Filter**: Find your credentials instantly with real-time filtering.
- **Role-Based Access**: Built-in support for multiple user roles (User/Admin).
- **Clipboard Integration**: One-click password and username copying.
- **Privacy First**: Optional "hidden" entries and auto-masking of sensitive fields.

## Tech Stack

- **Frontend**: Vite + React (Standard JS/TS implementation)
- **Styling**: Tailwind CSS 4.0
- **Backend**: Supabase Edge Functions (Deno Runtime)
- **Database**: PostgreSQL (Supabase)

## Implementation Details

### Security Pattern
The application follows a **"Bouncer Pattern"** for security:
1. **Login**: Users authenticate with a username/password to receive a session token.
2. **Verification**: Every subsequent request carries this token in the `Authorization` header.
3. **Identity Resolution**: The backend resolves the token to a verified `username` in the database.
4. **Ownership Enforcement**: Data is queried strictly by the verified username, ignoring any client-provided identity fields in the request body to prevent spoofing.

### Schema Requirements
The application expects the following tables in Supabase:

#### `vault_users`
- `username`: (Primary Key/Text)
- `password`: (Text)
- `role`: (Text, e.g., 'user', 'admin')
- `token`: (Text, Unique)

#### `vault_entries`
- `owner`: (Text, References `vault_users.username`)
- `domain`: (Text)
- `username`: (Text)
- `password`: (Text)
- `category`: (Text)
- `notes`: (Text)
- `is_hidden`: (Boolean)
- `updated_at`: (Timestamp)
- *Unique Constraint*: `(owner, domain)`

## Development

### Prerequisites
- Node.js & npm
- A Supabase Project with the required tables
- Environment variables configured in Supabase

### Local Setup
1. Clone the repository.
2. Install dependencies: `npm install`
3. Configure your API URL in the frontend.
4. Run the dev server: `npm run dev`

### Deployment
The frontend is built via `npm run build` as a static SPA. The backend should be deployed as a Supabase Edge Function.

---
*Created with ❤️ by Kinetic Logic Labs*
