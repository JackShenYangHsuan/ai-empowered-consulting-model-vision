# Command Center

AI consulting platform with multi-agent orchestration.

## Demo

[![Command Center Demo](https://img.youtube.com/vi/BGmVL73kLDM/maxresdefault.jpg)](https://www.youtube.com/watch?v=BGmVL73kLDM)

## What It Does

- **Multi-agent system**: Research, Financial, Strategy, and custom agents work in parallel
- **Central orchestrator**: Synthesizes outputs into executive summaries
- **Real-time tracking**: Progress bars, status updates, blockers

## Agent Types

| Agent | Purpose |
|-------|---------|
| Research | Market research, competitive analysis |
| Financial | DCF models, projections |
| Strategy | Recommendations, decision frameworks |
| Industry Expert | Domain-specific insights |
| Custom | Build your own |

## Setup

```bash
# 1. Clone and install
git clone https://github.com/JackShenYangHsuan/command-center.git
cd command-center/backend
npm install

# 2. Configure API keys
cp .env.example .env
# Edit .env and add your OpenAI API key (required)
# Anthropic and Exa keys are optional

# 3. Start the server
npm start
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

> **Demo mode**: To test the UI without API keys, just open `index.html` directly in your browser. Agents will run with simulated responses.
