const { Events } = require('discord.js');
const writeToMongoDB = require('../writeToMongoDB');

// File system and path modules for logging to files
const fs = require('fs');
const path = require('path');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        // Extract previous and current voice channel states
        const oldChannel = oldState.channel;
        const newChannel = newState.channel;
        const user = newState.member.user;
        const serverName = newState.guild.name || 'UnknownServer';
        const serverID = newState.guild.id || 'UnknownServer';
        
        // Detect voice channel join event
        if (oldChannel === null && newChannel !== null) {
            console.log(`<join> ${user.tag} ${serverName} ${newChannel.name} ${new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})}`);
            writeToMongoDB("joinVoiceChannel", {"Server": serverID, "Channel": newChannel.id, "User": user.id, "joinAt": new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})});
        // Detect voice channel leave event
        } else if (oldChannel !== null && newChannel === null) {
            console.log(`<leave> ${user.tag} ${serverName} ${oldChannel.name} ${new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})}`);
            writeToMongoDB("leaveVoiceChannel", {"Server": serverID, "Channel": oldChannel.id, "User": user.id, "joinAt": new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})});
        // Detect voice channel move event (switching channels)
        } else if (oldChannel !== null && newChannel !== null && oldChannel.id !== newChannel.id) {
            console.log(`<move> ${user.tag} ${serverName} ${oldChannel.name} -> ${newChannel.name} ${new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})}`);
            writeToMongoDB("moveVoiceChannel", {"Server": serverID, "oldChannel": oldChannel.id, "newChannel": newChannel.id, "User": user.id, "joinAt": new Date().toLocaleString("en-US", {timeZone: process.env.timeZone})});
        }
    },
};
