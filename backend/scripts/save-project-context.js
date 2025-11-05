#!/usr/bin/env node

/**
 * Script to save project context to Firebase
 * This syncs the CLAUDE.md content to Firebase Firestore
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../backend/firebase-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'command-center-e0e8b'
});

const db = admin.firestore();

// Project context data
const projectContext = {
    keyQuestion: "What problem does Command Center solve? Command Center enables consultants to delegate complex, multi-faceted projects to AI agents that work autonomously and collaboratively, reducing partner time investment to just 2 daily check-ins while maintaining full transparency and quality control through an orchestrator system.",

    constraints: `
- Must support 10+ concurrent agents without performance degradation
- All API keys must be stored securely (encrypted in settings.json or .env)
- Real-time updates required for all agent progress
- Mobile-responsive design required
- Must work offline for cached data (localStorage fallback)
    `.trim(),

    otherContext: `
# Command Center - AI Consulting Platform

## Overview
A Palantir-style dark mode interface for managing multiple AI agents that work collaboratively to complete consulting projects.

## Key Features
- Multi-agent orchestration system
- Real-time progress tracking with WebSockets
- Firebase integration for data persistence
- Settings management for API keys (OpenAI, Anthropic, Exa AI)
- PDF upload and processing for context injection
- Central orchestrator that synthesizes agent outputs
- MCP (Model Context Protocol) server support

## Architecture
- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (Palantir-inspired dark theme)
- **Backend:** Node.js/Express with WebSocket support
- **Database:** Firebase Firestore
- **Services:** OpenAI, Anthropic (Claude), Exa AI integrations

## Agent Types
1. Research Agent - Market research, data gathering, competitive analysis
2. Financial Agent - Financial modeling, DCF analysis, projections
3. Strategy Agent - Strategic recommendations, synthesis
4. Industry Expert - Domain-specific expertise
5. Slide Production - Presentation deck creation
6. Meeting Prep - Client meeting preparation
7. Custom - User-defined specialized agents

## Technical Stack
- Node.js/Express backend (port 3003)
- Firebase Firestore for persistence
- WebSocket for real-time updates
- OpenAI GPT-4, Anthropic Claude APIs
- Exa AI for research
- PDF processing with RAG

## Design System
- Background: #0F1419 (Deep dark blue)
- Cards: #1A1F29 (Dark slate)
- Accents: Blue (#3B82F6), Green (#10B981), Yellow (#F59E0B), Red (#EF4444)
- Font: Inter

## Key Files
- server.js - Express server + WebSocket + agent management
- firebase-config.js - Firebase/Firestore configuration
- agent-create.html/js - Agent creation interface
- settings.html/js - API key management
- /backend/agents/ - Agent execution logic
- /backend/services/ - External API wrappers

## Current Development Focus
- Enhancing agent execution with better context management
- Improving real-time WebSocket updates
- Integrating MCP servers for extended capabilities
- Building agent creation UI with better UX
    `.trim(),

    updatedAt: admin.firestore.FieldValue.serverTimestamp()
};

async function saveContext() {
    try {
        console.log('📝 Saving project context to Firebase...');

        await db.collection('projectContext').doc('global').set(projectContext, { merge: true });

        console.log('✅ Project context saved successfully to Firebase!');
        console.log('\nSaved data:');
        console.log('- Key Question:', projectContext.keyQuestion.substring(0, 100) + '...');
        console.log('- Constraints:', projectContext.constraints.split('\n').length, 'items');
        console.log('- Other Context:', projectContext.otherContext.length, 'characters');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error saving project context:', error);
        process.exit(1);
    }
}

saveContext();
