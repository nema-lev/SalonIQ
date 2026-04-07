#!/bin/bash
# SalonIQ — Автоматичен деплой скрипт
# Изпълнява се на Oracle VM след pull на нов код
# Използване: bash deploy.sh

set -e  # Спри при грешка

echo "🚀 SalonIQ Deploy — $(date)"
cd /opt/saloniq

# ─── 1. Pull последния код ────────────────────────────────────────────
echo "📥 Pulling latest code..."
git pull origin main

# ─── 2. Backend ───────────────────────────────────────────────────────
echo "🔧 Building backend..."
cd backend
npm ci --only=production
npx prisma generate
npx prisma migrate deploy
npm run build
cd ..

# ─── 3. Frontend ──────────────────────────────────────────────────────
echo "🎨 Building frontend..."
cd frontend
npm ci
npm run build
cd ..

# ─── 4. Създай лог директория ────────────────────────────────────────
sudo mkdir -p /var/log/saloniq
sudo chown ubuntu:ubuntu /var/log/saloniq

# ─── 5. Рестартирай процесите ─────────────────────────────────────────
echo "♻️  Restarting services..."
pm2 reload ecosystem.config.js --update-env

echo ""
echo "✅ Deploy complete!"
echo "📊 Status:"
pm2 status
