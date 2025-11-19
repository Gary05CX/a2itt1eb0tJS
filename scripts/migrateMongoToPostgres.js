/**
 * One-time migration script to move Discord bot logs from MongoDB to PostgreSQL.
 *
 * Usage:
 *   # Ensure .env contains mongodb, dbName, and pgConnection (or PG_CONNECTION_STRING)
 *   node scripts/migrateMongoToPostgres.js
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { Client: PgClient } = require('pg');
const { DateTime } = require('luxon');
require('dotenv').config();

const mongoUri = process.env.mongodb || process.env.MONGODB_URI;
const mongoDbName = process.env.dbName || process.env.MONGODB_DB;
const pgConnection =
	process.env.pgConnection ||
	process.env.PG_CONNECTION_STRING ||
	process.env.DATABASE_URL;

if (!mongoUri) {
	throw new Error('Missing MongoDB connection string (mongodb / MONGODB_URI).');
}

if (!mongoDbName) {
	throw new Error('Missing MongoDB database name (dbName / MONGODB_DB).');
}

if (!pgConnection) {
	throw new Error('Missing PostgreSQL connection string (pgConnection / PG_CONNECTION_STRING / DATABASE_URL).');
}

const migrationTimeZone = process.env.timeZone || process.env.TIMEZONE || 'UTC';

const timeFormats = [
	'M/d/yyyy, h:mm:ss a',
	'M/d/yyyy, h:mm:ss a', // handles non-breaking space (some environments)
	'M/d/yy, h:mm:ss a',
];

function asMongoIdString(value) {
	if (!value) return null;
	if (typeof value === 'string') return value;
	if (value.toHexString) return value.toHexString();
	if (value.toString) return value.toString();
	return null;
}

function serializationFallback(value) {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string') return value;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'number') return new Date(value).toISOString();
	return value.toString();
}

function parseTimestamp(rawValue) {
	if (!rawValue && rawValue !== 0) {
		return null;
	}

	if (rawValue instanceof Date) {
		return rawValue;
	}

	if (typeof rawValue?.toDate === 'function') {
		return rawValue.toDate();
	}

	if (typeof rawValue === 'number') {
		const date = new Date(rawValue);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	if (typeof rawValue === 'string') {
		const iso = DateTime.fromISO(rawValue, { zone: 'utc' });
		if (iso.isValid) {
			return iso.toUTC().toJSDate();
		}

		for (const format of timeFormats) {
			const attempt = DateTime.fromFormat(rawValue, format, { zone: migrationTimeZone });
			if (attempt.isValid) {
				return attempt.toUTC().toJSDate();
			}
		}

		const jsDate = new Date(rawValue);
		if (!Number.isNaN(jsDate.getTime())) {
			return jsDate;
		}
	}

	return null;
}

function resolveTimestamp(rawValue, fallback, contextMessage) {
	const parsed = parseTimestamp(rawValue);
	if (parsed) {
		return parsed;
	}

	if (fallback) {
		return fallback;
	}

	throw new Error(`Unable to derive timestamp for ${contextMessage}`);
}

async function ensureSchema(pgClient) {
	const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
	const ddl = fs.readFileSync(schemaPath, 'utf8');
	await pgClient.query(ddl);
}

async function migrateHeartbeat(db, pgClient) {
	const cursor = db.collection('heartbeat').find().sort({ _id: 1 });
	let count = 0;

	await pgClient.query('BEGIN');
	try {
		for await (const doc of cursor) {
			const mongoId = asMongoIdString(doc._id);
			const fallback = doc._id?.getTimestamp?.();
			const aliveAt = resolveTimestamp(doc.aliveAt, fallback, `heartbeat document ${mongoId}`);
			await pgClient.query(
				`INSERT INTO heartbeat_logs (mongo_document_id, alive_at, original_alive_at_text)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (mongo_document_id) DO UPDATE
				 SET alive_at = excluded.alive_at,
				     original_alive_at_text = excluded.original_alive_at_text`,
				[mongoId, aliveAt, serializationFallback(doc.aliveAt)]
			);
			count += 1;
		}
		await pgClient.query('COMMIT');
	} catch (error) {
		await pgClient.query('ROLLBACK');
		throw error;
	}

	return count;
}

async function migrateReady(db, pgClient) {
	const cursor = db.collection('ready').find().sort({ _id: 1 });
	let count = 0;

	await pgClient.query('BEGIN');
	try {
		for await (const doc of cursor) {
			const mongoId = asMongoIdString(doc._id);
			const fallback = doc._id?.getTimestamp?.();
			const readyAt = resolveTimestamp(doc.readyAt, fallback, `ready document ${mongoId}`);
			await pgClient.query(
				`INSERT INTO ready_events (mongo_document_id, ready_at, original_ready_at_text)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (mongo_document_id) DO UPDATE
				 SET ready_at = excluded.ready_at,
				     original_ready_at_text = excluded.original_ready_at_text`,
				[mongoId, readyAt, serializationFallback(doc.readyAt)]
			);
			count += 1;
		}
		await pgClient.query('COMMIT');
	} catch (error) {
		await pgClient.query('ROLLBACK');
		throw error;
	}

	return count;
}

function mapVoiceDocument(doc, type) {
	const serverId = doc.Server || doc.server || doc.guildId || null;
	const userId = doc.User || doc.user || doc.userId || null;

	let fromChannel = null;
	let toChannel = null;

	if (type === 'join') {
		toChannel = doc.Channel || doc.channel || null;
	} else if (type === 'leave') {
		fromChannel = doc.Channel || doc.channel || null;
	} else if (type === 'move') {
		fromChannel = doc.oldChannel || doc.fromChannel || doc.from_channel || null;
		toChannel = doc.newChannel || doc.toChannel || doc.to_channel || null;
	}

	const timestampSource = doc.joinAt || doc.leaveAt || doc.moveAt || doc.occurredAt || doc.timestamp;

	return {
		serverId,
		userId,
		fromChannel,
		toChannel,
		timestampSource,
	};
}

async function migrateVoiceCollection(db, pgClient, collectionName, type) {
	const cursor = db.collection(collectionName).find().sort({ _id: 1 });
	let count = 0;

	await pgClient.query('BEGIN');
	try {
		for await (const doc of cursor) {
			const mongoId = asMongoIdString(doc._id);
			const fallback = doc._id?.getTimestamp?.();
			const mapped = mapVoiceDocument(doc, type);
			const occurredAt = resolveTimestamp(
				mapped.timestampSource,
				fallback,
				`${type} voice document ${mongoId}`
			);

			if (!mapped.serverId || !mapped.userId) {
				throw new Error(
					`Missing server or user id for ${type} voice document ${mongoId} (server=${mapped.serverId}, user=${mapped.userId})`
				);
			}

			await pgClient.query(
				`INSERT INTO voice_channel_events (
					mongo_document_id,
					event_type,
					server_id,
					user_id,
					from_channel_id,
					to_channel_id,
					occurred_at,
					original_event_time_text
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT (mongo_document_id) DO UPDATE
				SET event_type = excluded.event_type,
				    server_id = excluded.server_id,
				    user_id = excluded.user_id,
				    from_channel_id = excluded.from_channel_id,
				    to_channel_id = excluded.to_channel_id,
				    occurred_at = excluded.occurred_at,
				    original_event_time_text = excluded.original_event_time_text`,
				[
					mongoId,
					type,
					mapped.serverId,
					mapped.userId,
					mapped.fromChannel,
					mapped.toChannel,
					occurredAt,
					serializationFallback(mapped.timestampSource),
				]
			);
			count += 1;
		}
		await pgClient.query('COMMIT');
	} catch (error) {
		await pgClient.query('ROLLBACK');
		throw error;
	}

	return count;
}

async function migrate() {
	const mongoClient = new MongoClient(mongoUri);
	const pgClient = new PgClient({ connectionString: pgConnection });

	await mongoClient.connect();
	await pgClient.connect();

	try {
		await ensureSchema(pgClient);
		const mongoDb = mongoClient.db(mongoDbName);

		const heartbeatCount = await migrateHeartbeat(mongoDb, pgClient);
		const readyCount = await migrateReady(mongoDb, pgClient);
		const joinCount = await migrateVoiceCollection(mongoDb, pgClient, 'joinVoiceChannel', 'join');
		const leaveCount = await migrateVoiceCollection(mongoDb, pgClient, 'leaveVoiceChannel', 'leave');
		const moveCount = await migrateVoiceCollection(mongoDb, pgClient, 'moveVoiceChannel', 'move');

		console.log('Migration complete ✨', {
			heartbeatCount,
			readyCount,
			joinCount,
			leaveCount,
			moveCount,
		});
	} finally {
		await mongoClient.close();
		await pgClient.end();
	}
}

migrate().catch((error) => {
	console.error('Migration failed:', error);
	process.exitCode = 1;
});
