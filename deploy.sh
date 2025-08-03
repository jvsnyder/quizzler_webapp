#!/bin/bash

# Quizzler Deployment Script for AWS EC2

echo "🚀 Starting Quizzler deployment..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt update

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
fi

# Create logs directory
mkdir -p logs

# Install dependencies
echo "📦 Installing server dependencies..."
npm install

echo "📦 Installing client dependencies..."
npm run install-client

# Build React app for production
echo "🏗️ Building React application..."
npm run build

# Start/restart application with PM2
echo "🚀 Starting application with PM2..."
pm2 delete quizzler 2>/dev/null || true
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your application should be accessible at:"
echo "   Admin Dashboard: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "   Backend API: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3001"
echo ""
echo "📊 Check application status: pm2 status"
echo "📋 View logs: pm2 logs quizzler"