const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		// Message to log when the bot is ready
		console.log(`Ready! Logged in as ${client.user.tag}`);


		// Set the ready log in /logs/ready/ by creating a new directory if it doesn't exist
		const logsDir = path.join(__dirname, '../logs/ready');
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}

		// Create a log json file if it doesn't exist
		const logFilePath = path.join(logsDir, 'ready_log.json');
		if (!fs.existsSync(logFilePath)) {
			fs.writeFileSync(logFilePath, JSON.stringify({ ready: [] }, null, 2));
		}

		// Append the ready log with the current Date and Time
		const now = new Date();
		const logEntry = {
			"date": now.toLocaleDateString(),
			"time": now.toLocaleTimeString(),
			"timestamp": now.getTime()
		};

		const logData = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
		logData.ready.push(logEntry);
		fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2), 'utf8');
	},
};