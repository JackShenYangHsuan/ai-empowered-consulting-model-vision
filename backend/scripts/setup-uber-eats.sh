#!/bin/bash

# Uber Eats MCP Server Setup Script
# This script sets up the Python environment and dependencies for the Uber Eats MCP server

set -e  # Exit on error

echo "🚀 Setting up Uber Eats MCP Server..."
echo ""

# Check Python version
echo "📌 Checking Python version..."
if ! command -v python3.11 &> /dev/null; then
    echo "❌ Python 3.11 is not installed. Please install Python 3.11 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3.11 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✅ Python $PYTHON_VERSION detected"

# Navigate to uber-eats directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UBER_EATS_DIR="$SCRIPT_DIR/../mcp-servers/uber-eats"

cd "$UBER_EATS_DIR"
echo "📁 Working directory: $UBER_EATS_DIR"
echo ""

# Create virtual environment
echo "📦 Creating Python virtual environment..."
if [ -d "venv" ]; then
    echo "   Virtual environment already exists, removing it to recreate with Python 3.11..."
    rm -rf venv
fi
python3.11 -m venv venv
echo "✅ Virtual environment created"

# Activate virtual environment
echo ""
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "⬆️  Upgrading pip..."
pip install --upgrade pip --quiet

# Install dependencies
echo ""
echo "📥 Installing Python dependencies..."
pip install -r requirements.txt --quiet

# Install Playwright browsers
echo ""
echo "🌐 Installing Playwright browsers (this may take a few minutes)..."
venv/bin/playwright install chromium

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Copy .env.example to .env: cp .env.example .env"
echo "   2. Add your Anthropic API key to .env"
echo "   3. Test the server: source venv/bin/activate && python server.py"
echo ""
echo "🎯 To activate the virtual environment later:"
echo "   cd $UBER_EATS_DIR"
echo "   source venv/bin/activate"
