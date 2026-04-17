# Eon Chat

A mobile-first chat interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), running entirely on your machine.

Eon Chat connects to Claude Code CLI on your local computer, giving you a polished mobile/web chat experience with:

- **Real-time streaming** — see Claude's responses as they're generated
- **Tool activity log** — watch Claude read files, edit code, run commands
- **Persistent sessions** — conversations saved locally in SQLite
- **Multi-session tabs** — work on multiple conversations at once
- **Cost tracking** — see API cost and duration per message
- **Dark theme** — designed for long coding sessions

## Architecture

```
┌─────────────────────┐
│   Eon Chat App      │  React Native (iOS/Android/Web)
└────────┬────────────┘
         │ HTTP + SSE (localhost)
┌────────▼────────────┐
│  eon-chat-server    │  Express.js (runs on your machine)
└────────┬────────────┘
         │ Claude Code CLI
┌────────▼────────────┐
│  Claude Code        │  Your authenticated Claude session
└─────────────────────┘
```

Everything runs locally. Your data stays on your machine. Authentication uses your existing Claude Code login (Anthropic account).

## Requirements

- **Node.js 18+**
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **Anthropic account** — authenticated via `claude login`

## Quick Start

```bash
# Clone the repo
git clone https://github.com/eontech/eon-chat.git
cd eon-chat

# Run setup (checks dependencies, installs packages)
./setup.sh

# Start the server (terminal 1)
cd server && npm start

# Start the app (terminal 2)
npm start
```

Open the Expo URL in your browser or scan the QR code with Expo Go on your phone.

## Configuration

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `EON_PORT` | `3777` | Server port |
| `EON_DATA_DIR` | `~/.eon-chat` | SQLite database location |
| `EON_CWD` | `$HOME` | Working directory for Claude |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3777` | Server URL for the app |

## How It Works

1. You run `claude login` once to authenticate with your Anthropic account
2. The server wraps the Claude Code CLI, providing a REST + SSE API
3. The React Native app connects to the local server
4. Messages are streamed in real-time via Server-Sent Events
5. Sessions and messages are persisted in a local SQLite database

## Project Structure

```
eon-chat/
├── App.tsx              # Main app component
├── src/
│   ├── api.ts           # API client (HTTP + SSE)
│   ├── types.ts         # TypeScript types
│   ├── theme.ts         # Color palette
│   └── components/      # UI components
├── server/
│   ├── index.js         # Express server + SSE endpoints
│   ├── claude.js        # Claude Code CLI wrapper
│   ├── auth.js          # Auth status via CLI
│   └── db.js            # SQLite persistence
├── setup.sh             # Setup script
└── .env.example         # Configuration template
```

## License

MIT — see [LICENSE](LICENSE)
