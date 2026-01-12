# Command Center - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Set Up API Keys (Required for Real AI)

Edit the `.env` file in the `backend` folder:

```bash
cd /Users/jackshen/Desktop/personal-website/command-center/backend
nano .env  # or open in your text editor
```

Replace `your_openai_key_here` with your actual OpenAI API key:
```env
OPENAI_API_KEY=sk-...your-actual-key...
```

**Don't have an OpenAI API key?**
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Paste it in the `.env` file

---

### Step 2: Start the Backend Server

```bash
cd /Users/jackshen/Desktop/personal-website/command-center/backend
npm start
```

You should see:
```
╔══════════════════════════════════════════════════════════════════════╗
║               Command Center Backend Started                         ║
╚══════════════════════════════════════════════════════════════════════╝

Server running on: http://localhost:3001
WebSocket: ws://localhost:3001
OpenAI configured: true
Ready to orchestrate agents!
```

---

### Step 3: Open the Frontend

Open in your browser:
```
/Users/jackshen/Desktop/personal-website/command-center/index.html
```

OR 

If you have a local server running, navigate to:
```
http://localhost:3001/index.html
```

---

## ✅ You Can Now Create Real Agents!

### Quick Test:

1. **Click "+ New Agent"**
2. **Fill in**:
   - Name: "Market Research Agent"
   - Type: Research
   - Focus: "Analyze the AI agent market size"
3. **Click "Create Agent"**
4. **Click the agent card** to see it work!
5. **Watch it execute** in real-time

---

## 🎯 Current Status

**✅ What Works Now:**
- ✅ Backend fully built and ready
- ✅ Agent execution engine
- ✅ OpenAI integration
- ✅ Real-time WebSocket updates
- ✅ PDF upload and processing
- ✅ Central orchestrator
- ✅ Context management

**🚧 What Needs Setup:**
- 🔑 Your OpenAI API key (in `.env`)
- 🔌 Frontend connected to backend (I can help!)

---

## 🔧 Current Mode

Right now you're running in **DEMO MODE**:
- ✅ Agents create and show progress
- ✅ UI fully functional
- ❌ Agents use simulated responses (not real AI)

Once you set up your API key and start the backend:
- ✅ Real OpenAI GPT-4 agents
- ✅ Actual research and analysis
- ✅ True multi-agent orchestration

---

## 💡 Want to Skip Setup?

You can keep using **DEMO MODE** to test the UI:
- Just open `/command-center/index.html` directly
- All UI features work with simulated agents
- Great for testing and demonstrations

---

## 🆘 Troubleshooting

**"Can't create agents"**
- Make sure backend is running (`npm start`)
- Check console for errors

**"Agent not responding"**
- Check your API key in `.env`
- Make sure you have OpenAI credits

**"WebSocket connection failed"**
- Backend needs to be running on port 3001
- Check if another app is using that port

---

## 📚 Next Steps

Once you have agents running:

1. **Upload PDFs**: Add context documents for all agents
2. **Create Multiple Agents**: Research + Financial + Strategy
3. **Watch Orchestrator**: See synthesis in action
4. **Chat with Agents**: Ask questions in the working panel
5. **View Summary**: Click "View Summary" to see orchestrator output

---

**Ready to start?** 

1. Set your OpenAI API key in `backend/.env`
2. Run `npm start` in the `backend` folder
3. Open the frontend and create your first agent!
