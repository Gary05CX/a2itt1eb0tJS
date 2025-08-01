const { Events } = require('discord.js');

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
        
        // Format current time for logging
        const now = new Date();
        const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        let logEntry = null;

        // Detect voice channel join event
        if (oldChannel === null && newChannel !== null) {
            console.log(`<join> ${user.tag} ${serverName} ${newChannel.name} ${formattedTime}`);
            logEntry = {
                "Join": {
                    "User": user.id,
                    "Time": formattedTime,
                    "Channel": newChannel.id
                }
            };
        // Detect voice channel leave event
        } else if (oldChannel !== null && newChannel === null) {
            console.log(`<leave> ${user.tag} ${serverName} ${oldChannel.name} ${formattedTime}`);
            logEntry = {
                "Leave": {
                    "User": user.id,
                    "Time": formattedTime,
                    "Channel": oldChannel.id
                }
            };
        // Detect voice channel move event (switching channels)
        } else if (oldChannel !== null && newChannel !== null && oldChannel.id !== newChannel.id) {
            console.log(`<move> ${user.tag} ${serverName} ${oldChannel.name} -> ${newChannel.name} ${formattedTime}`);
            logEntry = {
                "Move": {
                    "User": user.id,
                    "Time": formattedTime,
                    "Channel": {
                        "from": oldChannel.id,
                        "to": newChannel.id
                    }
                }
            };
        }

        // If an event was detected, log it to a file
        if (logEntry) {
            // Create a unique filename based on date
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const year = now.getFullYear();
            const month = months[now.getMonth()];
            const day = String(now.getDate()).padStart(2, '0');
            const serverID = newState.guild.id || 'UnknownServer';
            const fileName = `${year}_${month}_${day}.json`;
            
            // Create server-specific directory
            const baseLogDir = path.join(__dirname, '..', 'log', 'voice', 'join_leave_move');
            const serverLogDir = path.join(baseLogDir, serverID);
            const logFilePath = path.join(serverLogDir, fileName);
            let logData = [];

            // Ensure log directories and file exist, and load existing logs if any
            try {
                if (!fs.existsSync(baseLogDir)) {
                    fs.mkdirSync(baseLogDir, { recursive: true });
                    console.log('Created base log directory:', baseLogDir);
                }
                
                if (!fs.existsSync(serverLogDir)) {
                    fs.mkdirSync(serverLogDir, { recursive: true });
                    console.log('Created server log directory:', serverLogDir);
                }

                if (!fs.existsSync(logFilePath)) {
                    fs.writeFileSync(logFilePath, JSON.stringify([], null, 2), 'utf8');
                    console.log(`Created new log file: ${fileName} in server ${serverID}`);
                } else {
                    const fileContent = fs.readFileSync(logFilePath, 'utf8');
                    if (fileContent) {
                        logData = JSON.parse(fileContent);
                        if (!Array.isArray(logData)) {
                            logData = [];
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling log file, starting with empty array:', error.message);
                logData = [];
            }

            // Append new log entry to existing data
            logData.push(logEntry);

            // Write updated log data back to file
            try {
                fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2), 'utf8');
            } catch (error) {
                console.error('Error writing to log file:', error.message);
            }
        }
    },
};
