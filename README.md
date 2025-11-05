# Command Center - AI Consulting Platform

A Palantir-style dark mode interface for managing multiple AI agents that work collaboratively to complete consulting projects.

## 🚀 Features

### Main Dashboard
- **Central Orchestrator**: Oversees all agents and synthesizes their outputs into executive summaries
- **Agent Management**: Create, monitor, and manage multiple specialized agents
- **Real-time Progress Tracking**: Live progress bars, ETAs, and status updates
- **Dark Mode UI**: Palantir-inspired design with professional aesthetics

### Agent Types
1. **Research Agent**: Market research, data gathering, competitive analysis
2. **Financial Agent**: Financial modeling, DCF analysis, projections
3. **Strategy Agent**: Strategic recommendations, synthesis, decision frameworks
4. **Industry Expert**: Domain-specific expertise (Healthcare, FinTech, etc.)
5. **Slide Production**: Presentation deck creation
6. **Meeting Prep**: Client meeting preparation and briefings
7. **Custom**: Create your own specialized agents

### Agent Detail View
Each agent has a three-panel interface:

#### 1. Plan Panel (Left)
- Step-by-step task breakdown
- Progress tracking for each step
- Time estimates and completion status
- Blocker identification

#### 2. Deliverable Panel (Center)
- Live preview of agent output
- Supporting data sources
- Dependency tracking
- Export and sharing options

#### 3. Working Panel (Right)
- Chat interface to communicate with agent
- Natural language commands
- Quick action suggestions
- Real-time agent responses

### Central Orchestrator
- Collects inputs from all agents
- Identifies contradictions and gaps
- Validates strategic logic
- Generates consolidated executive summaries
- Tracks agent contributions

## 🎨 Design System

### Colors
- **Background**: Deep dark blue (#0F1419)
- **Cards**: Dark slate (#1A1F29)
- **Accents**: Blue (#3B82F6), Green (#10B981), Yellow (#F59E0B), Red (#EF4444)
- **Text**: Light gray (#E5E7EB) with hierarchy

### Typography
- **Font**: Inter
- **Sizes**: 11px - 24px
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

## 💻 Usage

### Creating a New Agent
1. Click **"+ New Agent"** button
2. Fill in agent details:
   - Name
   - Type (Research, Financial, Strategy, etc.)
   - Focus area (what the agent should accomplish)
   - Tools & capabilities (APIs, data sources)
   - Priority level
3. Click **"Create Agent"**

### Monitoring Agents
- Dashboard shows all active agents with progress bars
- Click any agent card to view detailed progress
- Status indicators: ✓ On Track, ⚠️ Blocked, ⏳ Waiting

### Agent Interaction
- Open agent detail view
- Use the chat panel to:
  - Ask for status updates
  - Provide additional context
  - Request timeline adjustments
  - Review specific data sources

### Viewing Executive Summary
- Click **"View Summary"** on the orchestrator card
- See consolidated findings from all agents
- Review agent contributions
- Export or send to partner

## 🛠️ Technical Stack

- **HTML5**: Semantic structure
- **CSS3**: Dark mode Palantir theme, Grid/Flexbox layouts
- **Vanilla JavaScript**: No framework dependencies
- **localStorage**: State persistence

## 📱 Responsive Design

- **Desktop** (>1024px): 3-column agent detail view
- **Tablet** (768-1024px): Stacked panels in detail view
- **Mobile** (<768px): Single column layout with tabbed panels

## 🔄 Simulation Features

The current version includes realistic simulations:

- **Auto-generated plans**: Each agent type has realistic task breakdowns
- **Progress simulation**: Agents automatically progress through tasks
- **Sample deliverables**: Pre-populated reports, models, and analyses
- **Chat responses**: Agents respond to user messages
- **Activity logging**: Real-time activity updates

## 🚧 Future Enhancements

### Backend Integration
- Connect to real AI models (GPT-4, Claude)
- API integrations for data sources
- Real-time agent orchestration
- Database for persistence

### Advanced Features
- **Debate Chamber**: Agents debate findings to improve quality
- **Voice Interface**: Hands-free partner interactions
- **Multi-project**: Manage multiple engagements simultaneously
- **Team Collaboration**: Multiple partners working together
- **Learning System**: Agents learn from partner feedback

### Extended Capabilities
- **Calendar Integration**: Auto-schedule meetings and check-ins
- **Document Processing**: Upload and process client materials
- **Data Visualization**: Dynamic charts and dashboards
- **Export Options**: PDF, PowerPoint, Word formats
- **Notification System**: Alerts for blockers and milestones

## 📖 Architecture

### Agent Class
```javascript
- Properties: name, type, focus, tools, progress, status
- Methods: startWork(), simulateProgress(), generatePlan(), generateDeliverable()
- Real-time updates via intervals
```

### Orchestrator Class
```javascript
- Monitors all agents
- Synthesizes findings
- Generates executive summaries
- Tracks dependencies
```

### Application State
```javascript
- Central state management
- View routing (dashboard, detail, orchestrator)
- Event handling
- UI rendering
```

## 🎯 Design Philosophy

1. **Partner-Centric**: Minimize partner time investment to 2 daily check-ins
2. **Transparency**: Full visibility into agent plans, progress, and reasoning
3. **Autonomy**: Agents work independently but collaborate through orchestrator
4. **Quality**: Built-in debate mechanisms and quality checks
5. **Flexibility**: Easily create custom agents for specific needs

## 📝 Notes

This is a **UI prototype** demonstrating the concept. In production:
- Agents would connect to real AI models
- Data would persist in databases
- Real-time collaboration via WebSockets
- Integration with consulting tools (Salesforce, Slack, etc.)

## 🤝 Contributing

To extend this prototype:
1. Add new agent types in `generatePlan()` and `generateDeliverable()` methods
2. Enhance the orchestrator synthesis logic
3. Implement real API connections
4. Add export functionality
5. Create backend services

## 📄 License

Personal project for demonstration purposes.

---

Built with ❤️ for the future of AI-powered consulting.
