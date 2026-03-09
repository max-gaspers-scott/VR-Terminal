# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./

# Using npm ci for clean installs in CI/CD environments
RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Serve the application from the build folder
FROM node:18-alpine

WORKDIR /app

# Install serve to serve the static files
RUN npm install -g serve

# Copy the build output from the build stage
COPY --from=build /app/build .

# Expose port 3000
EXPOSE 3000

# Start serve to serve the production build
# The -s flag is important for single-page apps
CMD ["serve", "-s", ".", "-l", "3000"]
