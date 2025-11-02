# a2itt1eb0t (Go Edition)

This project is a Discord bot implemented in Go. It exposes a set of slash commands, logs voice channel activity, and stores operational events in PostgreSQL.

## Configuration

Create a `.env` file (or provide environment variables) with the following values:

```.env
TOKEN=<discord bot token>
APPLICATION_ID=<discord application id>
DATABASE_URL=postgresql://a2itt1eb0t:botadm1n@localhost:5432/a2itt1eb0t
TIMEZONE=Asia/Taipei # optional, defaults to UTC
```

The provided PostgreSQL connection string matches the database credentials:

- URL: `postgresql://a2itt1eb0t:botadm1n@localhost:5432/a2itt1eb0t`
- User: `a2itt1eb0t`
- Password: `botadm1n`
- Database: `a2itt1eb0t`

## Running locally

```bash
go run .
```

Ensure PostgreSQL is accessible via the `DATABASE_URL` and the bot token/application ID are valid.

## Running with Docker Compose

```bash
docker compose up --build
```

The compose stack starts both the Discord bot and a PostgreSQL 16 instance configured with the credentials listed above. The bot uses global slash commands and automatically registers them on startup.