# Rayfirmations Slack Bot

A Cloudflare Worker that provides inspirational quotes from Ray via Slack slash commands. Share the positivity and motivation that Ray brings to the team!

## Features

- **Slash Command**: `/rayfirmation` - Get a random inspirational quote from Ray
- **Stats Command**: `/rayfirmation stats` - View usage statistics and available quotes
- **Add Quote Command**: `/rayfirmation add "quote"` - Add a new rayfirmation to the database
- **Interactive Buttons**:
  - 🎲 **Shuffle** - Get a different rayfirmation
  - 💫 **Rayfirm** - Share the rayfirmation with the entire channel
- **Usage Tracking**: Persistent storage of total rayfirmations shared using Cloudflare KV
- **Database Storage**: All rayfirmations stored in Cloudflare D1 database for scalability
- **Ephemeral Responses**: Private interactions with public sharing option

## Setup

### Prerequisites

- Cloudflare account with Workers enabled
- Slack workspace with admin permissions
- Wrangler CLI installed (`npm install -g wrangler`)

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd rayfirmations
```

### 2. Configure Cloudflare Workers

1. **Login to Wrangler**:

   ```bash
   wrangler login
   ```

2. **Create KV Namespace**:

   ```bash
   wrangler kv namespace create "TOTAL_COUNT"
   ```

   Copy output to wrangler.toml

3. **Create D1 Database**:

   ```bash
   wrangler d1 create CUSTOMER_AFFIRMATIONS_DB
   ```

   Copy output to wrangler.toml

4. **Apply Database Schema**:

   ```bash
   wrangler d1 execute CUSTOMER_AFFIRMATIONS_DB --file=./schema.sql
   ```

5. **Configure wrangler.toml** (update the file with your IDs):

   ```toml
   name = "customer-affirmations"
   main = "worker.js"
   compatibility_date = "2024-01-01"

   [[kv_namespaces]]
   binding = "TOTAL_COUNT"
   id = "your-kv-namespace-id"
   preview_id = "your-preview-kv-namespace-id"

   [[d1_databases]]
   binding = "RAYDB"
   database_name = "rayfirmations-db"
   database_id = "your-d1-database-id"
   ```

### 3. Deploy to Cloudflare

```bash
wrangler deploy
```

### 4. Configure Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app
3. Add the following OAuth scopes:

   - `commands` - For slash commands
   - `chat:write` - For posting messages
   - `users:read` - For user information

4. **Create Slash Command**:

   - Command: `/rayfirmation`
   - Request URL: `https://your-worker.your-subdomain.workers.dev`
   - Short Description: "Get an inspirational quote from Ray"
   - Usage Hint: "Just type /rayfirmation, /rayfirmation stats, or /rayfirmation new"

5. **Configure Interactive Components**:

   - Request URL: `https://your-worker.your-subdomain.workers.dev`

6. **Add Required Scopes** (in OAuth & Permissions):

   - `commands` - For slash commands
   - `chat:write` - For posting messages
   - `users:read` - For user information

7. **Install App to Workspace**

## Usage

### Basic Usage

1. Type `/rayfirmation` in any Slack channel
2. You'll receive a private message with a random rayfirmation
3. Use the buttons to:
   - **Shuffle**: Get a different quote
   - **Rayfirm**: Share the quote with everyone in the channel

### Statistics

1. Type `/rayfirmation stats` to view usage statistics
2. You'll see:
   - Total number of rayfirmations shared
   - Total number of available quotes in the database
   - Formatted display with emojis and proper formatting

### Adding New Quotes

1. Type `/rayfirmation new` to see instructions
2. Use the format: `/rayfirmation add "Your new quote here"`
3. Example: `/rayfirmation add "You are absolutely amazing!"`
4. The quote will be added to the database if it's unique
5. You'll receive a confirmation message

**Requirements for new quotes:**

- Must be enclosed in quotes
- Cannot be empty
- Must be under 500 characters
- Must be unique (not already in database)

### Response Types

- **Ephemeral**: Initial responses are private to the user
- **In-Channel**: When "Rayfirm" is clicked, the message is shared publicly with italic formatting

## Architecture

- **Cloudflare Workers**: Serverless edge computing
- **Cloudflare KV**: Persistent storage for usage tracking
- **Cloudflare D1**: SQLite database for storing rayfirmations
- **Slack API**: Interactive components and slash commands

## Database Schema

The D1 database contains a single table:

```sql
CREATE TABLE quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL UNIQUE,
    added_by_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

The `added_by_id` field tracks who added each quote:

- `"system"` for the original quotes loaded from the schema
- User ID for quotes added by users via the `/rayfirmation add` command

## Development

### Local Development

```bash
# Install dependencies (if any)
npm install

# Run locally
wrangler dev
```

### Database Management

```bash
# View database contents
wrangler d1 execute rayfirmations-db --command="SELECT * FROM quotes LIMIT 5;"

# View quotes with contributors
wrangler d1 execute rayfirmations-db --command="SELECT text, added_by_id, created_at FROM quotes ORDER BY created_at DESC LIMIT 10;"

# Add new rayfirmation
wrangler d1 execute rayfirmations-db --command="INSERT INTO quotes (text, added_by_id) VALUES ('Your new rayfirmation here!', 'your-user-id');"

# Get total count
wrangler d1 execute rayfirmations-db --command="SELECT COUNT(*) as total FROM quotes;"

# Get count by contributor
wrangler d1 execute rayfirmations-db --command="SELECT added_by_id, COUNT(*) as count FROM quotes GROUP BY added_by_id ORDER BY count DESC;"
```

### Testing

The bot can be tested using tools like:

- [ngrok](https://ngrok.com/) for local development
- Slack's built-in testing interface

## Environment Variables

- `TOTAL_COUNT` - KV namespace for tracking usage statistics
- `RAYDB` - D1 database for storing rayfirmations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please open an issue in the repository.
