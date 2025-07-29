# Use official Node.js image (replace version as needed)
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN yarn install --production

# Copy application source code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Deploy the commands
RUN node deploy-commands.js

# Start the app
CMD ["node", "index.js"]
