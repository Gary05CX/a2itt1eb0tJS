const { Events } = require('discord.js');
const writeToMongoDB = require('../writeToMongoDB');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);
		writeToMongoDB("ready", { readyAt: new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})});
	},
};