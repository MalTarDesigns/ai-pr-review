FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src ./src
COPY *.ts ./

# Build the application
RUN npm install -g typescript && \
    npm run build

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "dist/server.js"]