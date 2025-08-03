# AWS EC2 Deployment Guide - Free Tier

## Prerequisites
- AWS Account with free tier eligibility
- Git repository (GitHub, GitLab, etc.)

## Step 1: Prepare Code for Production

### 1.1 Create Production Configuration
```bash
# Update package.json to build for production
npm run build
```

### 1.2 Update server for production mode
The server is already configured to serve the React build files in production.

## Step 2: Push Code to Git Repository

```bash
# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial Quizzler application deployment"

# Add remote repository (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/quizzler.git

# Push to repository
git push -u origin main
```

## Step 3: Launch EC2 Instance

### 3.1 AWS Console Setup
1. Login to AWS Console
2. Go to EC2 Dashboard
3. Click "Launch Instance"

### 3.2 Instance Configuration
- **Name**: `quizzler-app`
- **AMI**: Ubuntu Server 22.04 LTS (Free tier eligible)
- **Instance Type**: t2.micro (Free tier eligible)
- **Key Pair**: Create new or use existing
- **Security Group**: Create new with these rules:
  - SSH (22): Your IP only
  - HTTP (80): 0.0.0.0/0
  - Custom TCP (3001): 0.0.0.0/0 (for backend API)
  - Custom TCP (3000): 0.0.0.0/0 (for frontend)

### 3.3 Launch Instance
- Review and launch
- Download key pair file (.pem)

## Step 4: Connect to EC2 Instance

```bash
# Make key file secure
chmod 400 your-key.pem

# Connect via SSH
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

## Step 5: Setup Server Environment

### 5.1 Update System
```bash
sudo apt update
sudo apt upgrade -y
```

### 5.2 Install Node.js
```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 5.3 Install Git
```bash
sudo apt install git -y
```

### 5.4 Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

## Step 6: Deploy Application

### 6.1 Clone Repository
```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/quizzler.git
cd quizzler
```

### 6.2 Install Dependencies
```bash
# Install server dependencies
npm install

# Install client dependencies
npm run install-client
```

### 6.3 Build React App
```bash
npm run build
```

### 6.4 Create PM2 Configuration
```bash
# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'quizzler',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
  }]
}
EOF
```

### 6.5 Start Application
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

## Step 7: Configure Nginx (Optional but Recommended)

### 7.1 Install Nginx
```bash
sudo apt install nginx -y
```

### 7.2 Configure Nginx
```bash
sudo tee /etc/nginx/sites-available/quizzler << 'EOF'
server {
    listen 80;
    server_name YOUR_EC2_PUBLIC_IP;

    # Serve React app
    location / {
        root /home/ubuntu/quizzler/client/build;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy Socket.io requests
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/quizzler /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## Step 8: Access Your Application

### URLs:
- **Admin Dashboard**: `http://YOUR_EC2_PUBLIC_IP`
- **Student Interface**: `http://YOUR_EC2_PUBLIC_IP/student/SESSION_ID`
- **Direct Backend**: `http://YOUR_EC2_PUBLIC_IP:3001` (if not using Nginx)

## Step 9: Useful Commands

### Check Application Status
```bash
pm2 status
pm2 logs quizzler
```

### Update Application
```bash
cd /home/ubuntu/quizzler
git pull origin main
npm install
npm run build
pm2 restart quizzler
```

### Monitor Resources
```bash
htop
pm2 monit
```

## Security Notes

1. **Firewall**: Only open necessary ports
2. **SSH Keys**: Keep your .pem file secure
3. **Updates**: Regularly update system packages
4. **Backup**: Consider backing up your data

## Cost Optimization

- **Free Tier**: 750 hours/month of t2.micro
- **Storage**: 30GB EBS storage free
- **Data Transfer**: 15GB/month free
- **Monitoring**: Basic CloudWatch included

This setup should cost $0/month within free tier limits!