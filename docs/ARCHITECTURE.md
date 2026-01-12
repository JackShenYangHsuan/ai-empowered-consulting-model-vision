# Command Center - Backend Architecture

## 🎯 Core Requirements

1. **Manage 10+ concurrent agents** with independent execution
2. **Settings management** for API keys (OpenAI, Exa, MCPs)
3. **Context system** - Focus areas feed into agent prompts
4. **PDF upload/processing** - RAG or direct context injection
5. **Central orchestrator** - Synthesis and coordination
6. **Real-time updates** - WebSocket communication

---

## 🏗️ System Architecture

### High-Level Overview
```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Browser)                       │
│  Dashboard | Agent Detail | Settings | Document Upload      │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket + REST API
┌────────────────────────┴────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Agent Manager (Orchestrator)             │  │
│  │  - Spawns/manages agents                             │  │
│  │  - Routes messages                                    │  │
│  │  - Collects outputs for synthesis                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │
│  │ Agent 1 │  │ Agent 2 │  │ Agent N │  │ Orchestrator │  │
│  │ Worker  │  │ Worker  │  │ Worker  │  │   Agent      │  │
│  └─────────┘  └─────────┘  └─────────┘  └──────────────┘  │
│       ↓            ↓            ↓               ↓           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Context Manager                          │  │
│  │  - Shared knowledge base                             │  │
│  │  - PDF documents (processed)                         │  │
│  │  - Agent focus areas                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Service Layer                            │  │
│  │  - OpenAI API    - Exa AI       - PDF Parser        │  │
│  │  - Anthropic     - MCPs         - Vector DB         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Storage Layer                            │  │
│  │  - Agent configs  - API keys    - Documents          │  │
│  │  - Chat history   - Deliverables - Vector store      │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
command-center/
├── frontend/
│   ├── index.html              # Main dashboard
│   ├── settings.html           # Settings page
│   ├── styles.css              # Existing styles
│   ├── app.js                  # Updated with backend integration
│   ├── settings.js             # Settings management
│   └── api-client.js           # Backend API wrapper
│
├── backend/
│   ├── server.js               # Express server + WebSocket
│   ├── config.js               # Configuration management
│   │
│   ├── agents/
│   │   ├── AgentManager.js     # Manages all agents
│   │   ├── Agent.js            # Individual agent executor
│   │   └── Orchestrator.js     # Central orchestrator agent
│   │
│   ├── services/
│   │   ├── openai-service.js   # OpenAI API wrapper
│   │   ├── exa-service.js      # Exa AI API wrapper
│   │   ├── anthropic-service.js # Claude API wrapper
│   │   ├── pdf-processor.js    # PDF parsing/chunking
│   │   ├── vector-store.js     # RAG implementation
│   │   └── mcp-connector.js    # MCP protocol handler
│   │
│   ├── routes/
│   │   ├── agents.js           # Agent CRUD + execution
│   │   ├── settings.js         # API settings management
│   │   ├── documents.js        # PDF upload/retrieval
│   │   └── orchestrator.js     # Orchestrator endpoints
│   │
│   ├── middleware/
│   │   ├── auth.js             # API key validation
│   │   └── error-handler.js    # Error handling
│   │
│   └── storage/
│       ├── settings.json       # Encrypted API keys
│       ├── agents.json         # Agent configurations
│       ├── context.json        # Shared context store
│       └── documents/          # Uploaded PDFs
│
└── package.json
```

---

## 🔄 Data Flow

### 1. Agent Creation Flow
```
User creates agent in UI
    ↓
POST /api/agents
    ↓
AgentManager.createAgent()
    ↓
- Store agent config
- Initialize context (focus area)
- Return agent ID
    ↓
WebSocket: agent.created event
    ↓
UI updates dashboard
```

### 2. Agent Execution Flow
```
AgentManager.startAgent(agentId)
    ↓
Load agent config + context
    ↓
Initialize AI service (OpenAI/Claude)
    ↓
Build system prompt:
  - Agent type/role
  - Focus area
  - Shared context from PDFs
  - Previous conversation history
    ↓
Execute task steps in loop:
  1. Agent reasons about next action
  2. Agent uses tools (search, analyze, etc.)
  3. Agent updates progress
  4. Send progress via WebSocket
    ↓
Generate deliverable
    ↓
Send to Orchestrator
    ↓
Update agent status: completed
```

### 3. Context Management Flow
```
PDF Upload
    ↓
POST /api/documents/upload
    ↓
- Parse PDF to text
- Chunk text (1000 tokens)
- Generate embeddings (optional)
- Store in vector DB or JSON
    ↓
When agent starts:
  - Load relevant document chunks
  - Add to system prompt
  - Agent has full context
```

### 4. Orchestrator Synthesis Flow
```
Agent completes task
    ↓
Send deliverable to Orchestrator
    ↓
Orchestrator receives input:
  - Agent name
  - Agent type
  - Key findings
  - Data points
    ↓
When all agents ready:
  1. Collect all deliverables
  2. Identify contradictions
  3. Cross-reference findings
  4. Generate executive summary
    ↓
WebSocket: orchestrator.updated
    ↓
UI updates summary view
```

---

## 🔧 Key Components

### 1. Agent Manager
**Responsibilities:**
- Create/start/stop agents
- Maintain agent registry
- Route messages between agents
- Monitor agent health
- Coordinate with orchestrator

**Methods:**
```javascript
class AgentManager {
  createAgent(config)           // Create new agent
  startAgent(agentId)            // Start agent execution
  stopAgent(agentId)             // Stop agent
  getAgentStatus(agentId)        // Get current status
  sendMessageToAgent(id, msg)    // Send message to agent
  broadcastToAllAgents(msg)      // Broadcast message
  getAgentDeliverable(id)        // Get agent output
}
```

### 2. Individual Agent
**Responsibilities:**
- Execute assigned tasks
- Use appropriate tools/APIs
- Update progress in real-time
- Generate deliverables
- Respond to chat messages

**Properties:**
```javascript
class Agent {
  id, name, type, focus
  systemPrompt                   // Built from focus + context
  conversationHistory            // Chat messages
  currentStep                    // Current task step
  progress                       // 0-100
  status                         // queued/running/completed/error
  deliverable                    // Final output
  tools                          // Available APIs
}
```

**Methods:**
```javascript
async start()                    // Begin execution
async executeStep()              // Execute one task step
async chat(message)              // Handle user message
async stop()                     // Gracefully stop
getProgress()                    // Return current progress
```

### 3. Context Manager
**Responsibilities:**
- Store shared knowledge base
- Manage PDF documents
- Build context for each agent
- Handle RAG queries

**Methods:**
```javascript
class ContextManager {
  addDocument(pdf)               // Add processed PDF
  getRelevantContext(query)      // RAG query
  buildAgentContext(agentConfig) // Build system prompt
  getSharedContext()             // Get global context
  updateSharedContext(data)      // Add to shared knowledge
}
```

### 4. Central Orchestrator
**Responsibilities:**
- Collect agent outputs
- Synthesize findings
- Detect contradictions
- Generate executive summary
- Coordinate debates

**Methods:**
```javascript
class Orchestrator {
  receiveDeliverable(agentId, data)  // Receive from agent
  synthesize()                        // Create summary
  detectContradictions()              // Find conflicts
  scheduleDebate(agentIds, topic)     // Trigger debate
  generateExecutiveSummary()          // Final output
}
```

---

## 🔐 Settings Management

### Settings Structure
```json
{
  "apis": {
    "openai": {
      "apiKey": "sk-...",
      "model": "gpt-4o-mini",
      "enabled": true
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "model": "claude-3-opus",
      "enabled": false
    },
    "exa": {
      "apiKey": "exa_...",
      "enabled": true
    }
  },
  "mcps": [
    {
      "name": "Reducto MCP",
      "endpoint": "https://reducto-mcp-server.vercel.app",
      "enabled": true
    }
  ],
  "rag": {
    "enabled": true,
    "chunkSize": 1000,
    "vectorStore": "in-memory"
  }
}
```

### Settings Page UI
- API key input fields (masked)
- Enable/disable toggles
- Test connection buttons
- MCP endpoint configuration
- RAG settings

---

## 📡 WebSocket Events

### Client → Server
```javascript
'agent.create'        // Create new agent
'agent.start'         // Start agent
'agent.stop'          // Stop agent
'agent.chat'          // Send chat message
'document.upload'     // Upload PDF
'settings.update'     // Update API keys
```

### Server → Client
```javascript
'agent.created'       // Agent created
'agent.progress'      // Progress update
'agent.message'       // Chat response
'agent.completed'     // Task completed
'agent.error'         // Error occurred
'orchestrator.update' // Orchestrator status
'document.processed'  // PDF processed
```

---

## 💾 Storage Strategy

### Phase 1: File-Based (Current)
- JSON files for configs
- File system for PDFs
- In-memory for active agents

### Phase 2: Database (Future)
- PostgreSQL for structured data
- Redis for real-time state
- Pinecone/Chroma for vectors
- S3 for document storage

---

## 🚀 Implementation Approach

### Phase 1: Core Backend
1. ✅ Express server setup
2. ✅ WebSocket integration
3. ✅ Agent Manager skeleton
4. ✅ Basic agent execution

### Phase 2: Service Integration
1. ✅ OpenAI service wrapper
2. ✅ Settings management
3. ✅ API key validation
4. ✅ Error handling

### Phase 3: Context System
1. ✅ PDF upload endpoint
2. ✅ Text extraction
3. ✅ Context builder
4. ✅ Agent prompt construction

### Phase 4: Orchestrator
1. ✅ Deliverable collection
2. ✅ Synthesis logic
3. ✅ Contradiction detection
4. ✅ Executive summary generation

### Phase 5: Frontend Integration
1. ✅ API client wrapper
2. ✅ Settings page
3. ✅ WebSocket connection
4. ✅ Real-time updates

---

## 🎯 Design Decisions

### 1. **Why Node.js/Express?**
- Easy to integrate with existing frontend
- Great WebSocket support
- Fast for I/O operations
- Can scale with clustering

### 2. **Why WebSockets?**
- Real-time progress updates
- Bidirectional communication
- Lower latency than polling
- Better UX for live agents

### 3. **Context Strategy: RAG vs Direct Injection**
- **Small docs (<10 pages)**: Direct context injection
- **Large docs (>10 pages)**: RAG with embeddings
- **Configurable**: Let user choose in settings

### 4. **Agent Execution Model**
- Each agent runs in event loop (not separate process)
- Uses async/await for non-blocking execution
- Can scale to worker threads if needed

### 5. **State Management**
- Active agents: In-memory (fast)
- Configurations: JSON files (simple)
- Deliverables: File system (persistent)
- Can migrate to DB later

---

## 🔄 Scalability Considerations

### Current (Prototype)
- Handles 10-20 agents
- Single Node.js process
- File-based storage
- In-memory state

### Future (Production)
- Handles 100+ agents
- Worker pool / clustering
- PostgreSQL + Redis
- Distributed queue (Bull/RabbitMQ)

---

This architecture provides a solid foundation that can start simple and scale as needed!
