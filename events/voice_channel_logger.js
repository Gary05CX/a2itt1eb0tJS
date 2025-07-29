const { Events } = require('discord.js');

const fs = require('fs');
const path = require('path');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const oldChannel = oldState.channel;
        const newChannel = newState.channel;
        const user = newState.member.user;
        const serverName = newState.guild.name || 'UnknownServer';
        const now = new Date();
        const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        let logEntry = null;

        if (oldChannel === null && newChannel !== null) {
            console.log(`<join> ${user.tag} ${serverName} ${newChannel.name} ${formattedTime}`);
            logEntry = {
                "Join": {
                    "User": {
                        "ID": user.id,
                        "Name": user.tag
                    },
                    "Time": formattedTime,
                    "Channel": {
                        "ID": newChannel.id,
                        "Name": newChannel.name
                    }
                }
            };
        } else if (oldChannel !== null && newChannel === null) {
            console.log(`<leave> ${user.tag} ${serverName} ${oldChannel.name} ${formattedTime}`);
            logEntry = {
                "Leave": {
                    "User": {
                        "ID": user.id,
                        "Name": user.tag
                    },
                    "Time": formattedTime,
                    "Channel": {
                        "ID": oldChannel.id,
                        "Name": oldChannel.name
                    }
                }
            };
        } else if (oldChannel !== null && newChannel !== null && oldChannel.id !== newChannel.id) {
            console.log(`<move> ${user.tag} ${serverName} ${oldChannel.name} -> ${newChannel.name} ${formattedTime}`);
            logEntry = {
                "Move": {
                    "User": {
                        "ID": user.id,
                        "Name": user.tag
                    },
                    "Time": formattedTime,
                    "Channel": {
                        "from": {
                            "id": oldChannel.id,
                            "name": oldChannel.name
                        },
                        "to": {
                            "id": newChannel.id,
                            "name": newChannel.name
                        }
                    }
                }
            };
        }

        if (logEntry) {
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const year = now.getFullYear();
            const month = months[now.getMonth()];
            const day = String(now.getDate()).padStart(2, '0');
            const serverName = newState.guild.name || 'UnknownServer';
            const fileName = `${serverName}_${year}_${month}_${day}_voice_channel_log.json`;
            const logDir = path.join(__dirname, '..', 'log', 'voice', 'join_leave_move');
            const logFilePath = path.join(logDir, fileName);
            let logData = [];

            try {
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                    console.log('Created log directory:', logDir);
                }

                if (!fs.existsSync(logFilePath)) {
                    fs.writeFileSync(logFilePath, JSON.stringify([], null, 2), 'utf8');
                    console.log(`Created new log file: ${fileName}`);
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

            logData.push(logEntry);

            try {
                fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2), 'utf8');
            } catch (error) {
                console.error('Error writing to log file:', error.message);
            }
        }
    },
};