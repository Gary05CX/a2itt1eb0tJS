const { Events } = require('discord.js');
const writeToMongoDB = require('../writeToMongoDB');
const fs = require('fs');
const path = require('path');

require('dotenv').config();


module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        setInterval(() => {
            writeToMongoDB("heartbeat", { aliveAt: new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})});
        }, 10000); 
    },
};
