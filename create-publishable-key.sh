#!/bin/bash

# Script to create a Medusa Publishable API Key via Admin API

echo "🔑 Creating Medusa Publishable API Key..."

# Medusa backend URL
MEDUSA_URL="http://localhost:9000"

# Admin credentials (update these if different)
ADMIN_EMAIL="admin@medusa-test.com"
ADMIN_PASSWORD="supersecret"

# Step 1: Login to get admin token
echo "📝 Logging in as admin..."
LOGIN_RESPONSE=$(curl -s -X POST "${MEDUSA_URL}/admin/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")

# Extract token from response
ADMIN_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Failed to login. Response: $LOGIN_RESPONSE"
  echo ""
  echo "Please create a publishable API key manually:"
  echo "1. Navigate to http://localhost:9000/app"
  echo "2. Login with admin credentials"
  echo "3. Go to Settings → Publishable API Keys"
  echo "4. Create a new key named 'Partner Store Frontend'"
  echo "5. Copy the key and add it to .env as VITE_MEDUSA_PUBLISHABLE_KEY"
  exit 1
fi

echo "✅ Admin login successful!"

# Step 2: Create publishable API key
echo "🔨 Creating publishable API key..."
CREATE_RESPONSE=$(curl -s -X POST "${MEDUSA_URL}/admin/publishable-api-keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"title":"Partner Store Frontend"}')

# Extract the publishable key
PUB_KEY=$(echo $CREATE_RESPONSE | grep -o '"id":"pk_[^"]*' | cut -d'"' -f4)

if [ -z "$PUB_KEY" ]; then
  echo "⚠️  Could not create new key. Trying to fetch existing keys..."

  # Try to get existing keys
  KEYS_RESPONSE=$(curl -s -X GET "${MEDUSA_URL}/admin/publishable-api-keys" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}")

  PUB_KEY=$(echo $KEYS_RESPONSE | grep -o '"id":"pk_[^"]*' | head -1 | cut -d'"' -f4)

  if [ -z "$PUB_KEY" ]; then
    echo "❌ No publishable keys found. Response: $KEYS_RESPONSE"
    exit 1
  fi

  echo "✅ Found existing publishable API key!"
else
  echo "✅ Publishable API key created successfully!"
fi

echo ""
echo "🎉 Your Publishable API Key:"
echo "   $PUB_KEY"
echo ""
echo "📝 Next steps:"
echo "1. Add this to your .env file:"
echo "   VITE_MEDUSA_PUBLISHABLE_KEY=\"$PUB_KEY\""
echo ""
echo "2. Restart your dev server:"
echo "   pnpm dev"
echo ""

# Optionally update .env file automatically
read -p "Would you like to automatically update the .env file? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd ..
  if grep -q "VITE_MEDUSA_PUBLISHABLE_KEY" .env; then
    sed -i "s/VITE_MEDUSA_PUBLISHABLE_KEY=.*/VITE_MEDUSA_PUBLISHABLE_KEY=\"$PUB_KEY\"/" .env
    echo "✅ Updated existing VITE_MEDUSA_PUBLISHABLE_KEY in .env"
  else
    echo "VITE_MEDUSA_PUBLISHABLE_KEY=\"$PUB_KEY\"" >> .env
    echo "✅ Added VITE_MEDUSA_PUBLISHABLE_KEY to .env"
  fi
  echo ""
  echo "🚀 Please restart your dev server for changes to take effect!"
fi
