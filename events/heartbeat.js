const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');


module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        // Set up a heartbeat signal every 5 minutes
        setInterval(() => {
            const now = new Date();
            
            // Create the heartbeat log directory if it doesn't exist
            const logsDir = path.join(__dirname, '../logs/heartbeat');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            // Create a json log file if it doesn't exist
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const fileName = `${year}-${month}-${day}_heartbeat_log.json`;
            const logFilePath = path.join(logsDir, fileName);
            if (!fs.existsSync(logFilePath)) {
                fs.writeFileSync(logFilePath, JSON.stringify([], null, 2));
            }

            const heartbeatEntry = {
                "date": now.toLocaleDateString(),
                "time": now.toLocaleTimeString(),
                "timestamp": now.getTime()
            };
            const logData = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
            logData.push(heartbeatEntry);
            fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));
            // Use ANSI escape code to overwrite the previous line in the terminal
            //process.stdout.write(`\rAlive at ${heartbeatEntry.time} on ${heartbeatEntry.date}` + ' '.repeat(50)); // Add spaces to clear any longer previous message
        }, 1000); 
    },
};
