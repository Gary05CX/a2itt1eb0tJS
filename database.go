package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const createEventsTableSQL = `
CREATE TABLE IF NOT EXISTS bot_events (
    id SERIAL PRIMARY KEY,
    collection_name TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`

// Database wraps a PostgreSQL connection used by the bot.
type Database struct {
	db *sql.DB
}

// NewDatabase creates a new Database instance and ensures the schema exists.
func NewDatabase(ctx context.Context, url string) (*Database, error) {
	if url == "" {
		return nil, errors.New("DATABASE_URL is not set")
	}

	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	if _, err := db.ExecContext(ctx, createEventsTableSQL); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("prepare schema: %w", err)
	}

	return &Database{db: db}, nil
}

// InsertEvent writes a new event row to the database.
func (d *Database) InsertEvent(ctx context.Context, collection string, payload map[string]any) error {
	if d == nil {
		return errors.New("database is not initialized")
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	_, err = d.db.ExecContext(ctx,
		"INSERT INTO bot_events (collection_name, data) VALUES ($1, $2)",
		collection,
		jsonPayload,
	)
	if err != nil {
		return fmt.Errorf("insert event: %w", err)
	}

	return nil
}

// Close shuts down the underlying database connection.
func (d *Database) Close() error {
	if d == nil {
		return nil
	}

	return d.db.Close()
}
