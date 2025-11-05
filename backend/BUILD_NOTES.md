# Command Center Backend - Build Notes

## 🏗️ Implementation Progress

### ✅ Completed Components

#### 1. **Config Management** (`config.js`)
- File-based settings storage
- API key management for OpenAI, Anthropic, Exa
- MCP configuration support
- RAG settings
- Auto-saves on updates

**Key Design Decision:** File-based for simplicity. Can migrate to database later without changing API.

---

#### 2. **Agent Class** (`agents/Agent.js`)
- Full agent lifecycle management
- Async task execution
- Event-driven architecture
- Context injection from focus area + PDFs
- Step-by-step plan execution
- Chat interface
- Deliverable generation

**Key Features:**
- System prompt built from: Agent type → Focus area → Shared context
- Each step calls AI service with conversation history
- Progress tracked and emitted via events
- Deliverables include extracted data points for orchestrator

**Context Flow:**
```
Agent Type (research/financial/etc.)
    ↓
Base System Prompt
    ↓
+ Focus Area (user-defined)
    ↓
+ Shared Context (from PDFs)
    ↓
+ Tools List
    ↓
Final System Prompt → AI Service
```

---

#### 3. **Context Manager** (`services/context-manager.js`)
- PDF processing and text extraction
- Text chunking (1000 chars default)
- Shared context building
- Document storage and retrieval
- Simple relevance search (can upgrade to RAG)

**Processing Flow:**
```
PDF Upload
    ↓
Parse with pdf-parse
    ↓
Extract text
    ↓
Chunk into manageable pieces
    ↓
Store with metadata
    ↓
Rebuild shared context
    ↓
Inject into agent system prompts
```

**Future Enhancement:** Add vector embeddings for semantic search (RAG).

---

#### 4. **OpenAI Service** (`services/openai-service.js`)
- Wrapper for OpenAI API
- Chat completions
- Error handling and retry logic
- Token usage tracking
- Configuration test endpoint

**Key Features:**
- Centralized error handling (rate limits, auth errors)
- Configurable model and parameters
- Test function to validate API key

---

#### 5. **Agent Manager** (`agents/AgentManager.js`)
- Central orchestrator for all agents
- Agent registry (Map-based)
- Event-driven coordination
- Lifecycle management (create, start, stop, delete)
- Message routing
- Orchestrator integration

**Event Flow:**
```
Agent Manager
    ↓
Creates Agent
    ↓
Sets up event listeners
    ↓
Agent emits events (progress, completed, error, etc.)
    ↓
Agent Manager re-emits for WebSocket
    ↓
Frontend receives real-time updates
```

**Key Methods:**
- `createAgent()` - Creates and registers new agent
- `startAgent()` - Begins execution
- `stopAgent()` - Graceful shutdown
- `chatWithAgent()` - Send messages
- `getOrchestratorStatus()` - Get synthesis status

---

#### 6. **Orchestrator** (`agents/Orchestrator.js`)
- Central synthesis agent
- Collects deliverables from all agents
- Detects contradictions
- Generates executive summaries
- Coordinates debates (future)

**Synthesis Process:**
```
Agent 1 completes → Sends deliverable
Agent 2 completes → Sends deliverable
Agent N completes → Sends deliverable
    ↓
Orchestrator collects all
    ↓
Builds synthesis prompt
    ↓
Calls AI service for summary
    ↓
Detects contradictions
    ↓
Extracts key findings
    ↓
Generates executive summary
    ↓
Emits event → Frontend updates
```

**Key Capabilities:**
- Auto-synthesizes when 2+ agents complete
- Cross-references findings
- Identifies conflicts in data
- Structures output for executives

---

### 🚧 In Progress

#### 7. **Express Server** (`server.js`)
- REST API endpoints
- WebSocket for real-time updates
- CORS configuration
- Error handling middleware

#### 8. **API Routes** 
- `/api/agents` - Agent CRUD + execution
- `/api/settings` - Settings management
- `/api/documents` - PDF upload/retrieval
- `/api/orchestrator` - Orchestrator endpoints

---

## 📡 API Design

### Agent Endpoints

```javascript
POST   /api/agents              // Create agent
GET    /api/agents              // List all agents
GET    /api/agents/:id          // Get agent details
POST   /api/agents/:id/start    // Start agent
POST   /api/agents/:id/stop     // Stop agent
POST   /api/agents/:id/chat     // Send chat message
DELETE /api/agents/:id          // Delete agent
```

### Settings Endpoints

```javascript
GET    /api/settings            // Get all settings
PUT    /api/settings            // Update settings
POST   /api/settings/test/:service  // Test API connection
```

### Document Endpoints

```javascript
POST   /api/documents/upload    // Upload PDF
GET    /api/documents           // List documents
GET    /api/documents/:id       // Get document
DELETE /api/documents/:id       // Delete document
```

### Orchestrator Endpoints

```javascript
GET    /api/orchestrator/status // Get status
POST   /api/orchestrator/synthesize  // Trigger synthesis
POST   /api/orchestrator/reset  // Reset orchestrator
```

---

## 🔄 WebSocket Events

### Server → Client

```javascript
'agent:created'         // Agent created
'agent:started'         // Agent started execution
'agent:progress'        // Progress update
'agent:stepStarted'     // Step began
'agent:stepCompleted'   // Step finished
'agent:completed'       // Agent finished
'agent:error'           // Error occurred
'agent:chatResponse'    // Chat response
'orchestrator:update'   // Synthesis updated
'document:processed'    // PDF processed
```

### Client → Server

```javascript
'subscribe'             // Subscribe to updates
'unsubscribe'           // Unsubscribe
```

---

## 💾 Storage Structure

```
storage/
├── settings.json          # API keys and configuration
├── agents.json            # Agent configurations
├── context.json           # Processed documents and shared context
└── documents/             # Uploaded PDF files
    ├── doc1.pdf
    └── doc2.pdf
```

---

## 🔑 Key Design Patterns

### 1. **Event-Driven Architecture**
All components use EventEmitter for loose coupling:
- Agent emits events → Agent Manager listens
- Agent Manager re-emits → WebSocket broadcasts
- Frontend receives → UI updates

### 2. **Service Layer Pattern**
AI services (OpenAI, Anthropic) wrapped in service classes:
- Centralized error handling
- Easy to swap implementations
- Testable

### 3. **Context Injection**
Context flows from multiple sources:
- Agent type → Base prompt
- Focus area → Specific instructions
- PDFs → Background knowledge
- Chat history → Conversation continuity

### 4. **Async/Non-Blocking**
All agent execution is asynchronous:
- Uses async/await throughout
- Event loop handles concurrency
- 10+ agents can run simultaneously

---

## 🎯 Next Steps

### Immediate:
1. ✅ Complete Express server setup
2. ✅ Create API routes
3. ✅ Setup WebSocket
4. ✅ Create settings page UI
5. ✅ Update frontend API client
6. ✅ Test end-to-end flow

### Future Enhancements:
1. **RAG Implementation**
   - Add vector embeddings (OpenAI embeddings API)
   - Semantic search for document chunks
   - Pinecone or Chroma integration

2. **Advanced Features**
   - Debate system between agents
   - Learning from partner feedback
   - Multi-project management
   - Export to PDF/PowerPoint

3. **Scalability**
   - Worker threads for heavy processing
   - Redis for state management
   - PostgreSQL for structured data
   - Message queue (Bull/RabbitMQ)

4. **Security**
   - Encrypted API key storage
   - Authentication system
   - Rate limiting
   - Input validation

---

## 📝 Notes for Future Development

### Scaling Considerations:
- **Current**: Handles 10-20 agents in single process
- **Next**: Worker pool for 50+ agents
- **Future**: Distributed system with queue

### Context Management:
- **Current**: Simple text extraction and chunking
- **Next**: Vector embeddings for semantic search
- **Future**: Hierarchical summarization for long docs

### Agent Coordination:
- **Current**: Sequential synthesis
- **Next**: Parallel synthesis with conflict resolution
- **Future**: Multi-round debates with voting

---

This backend provides a solid foundation that starts simple but can scale as needed!
