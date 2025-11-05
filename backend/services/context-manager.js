/**
 * Context Manager
 * 
 * Manages shared knowledge base across all agents.
 * 
 * Design decisions:
 * - PDFs are processed and stored as chunks
 * - For now: Simple text extraction (can add RAG later)
 * - Shared context is built from all processed documents
 * - Each agent gets relevant context in their system prompt
 * 
 * Context flow:
 * 1. PDF uploaded → Parse to text → Chunk
 * 2. Store chunks with metadata
 * 3. When agent starts → Retrieve relevant chunks
 * 4. Inject into system prompt
 * 
 * Future enhancements:
 * - Vector embeddings for semantic search
 * - RAG with similarity matching
 * - Context windowing for long documents
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

class ContextManager {
    constructor() {
        this.documents = new Map(); // docId -> document data
        this.sharedContext = '';
        this.agentStates = new Map(); // agentId -> agent state
        this.reportedInsights = [];
        this.insightsPath = path.join(__dirname, '../storage/insights.json');
        this.orchestratorStatePath = path.join(__dirname, '../storage/orchestrator-state.json');
        this.orchestratorState = {
            hypotheses: [],
            executiveSummary: []
        };
        this.loadDocuments();
        this.loadInsights();
        this.loadOrchestratorState();
    }

    /**
     * Load previously processed documents
     */
    loadDocuments() {
        const contextPath = path.join(__dirname, '../storage/context.json');
        
        try {
            if (fs.existsSync(contextPath)) {
                const data = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
                this.documents = new Map(Object.entries(data.documents || {}));
                this.sharedContext = data.sharedContext || '';
            }
        } catch (error) {
            console.error('Error loading context:', error);
        }
    }

    /**
     * Save documents to disk
     */
    saveDocuments() {
        const contextPath = path.join(__dirname, '../storage/context.json');
        
        try {
            const data = {
                documents: Object.fromEntries(this.documents),
                sharedContext: this.sharedContext,
                lastUpdated: new Date().toISOString()
            };
            
            fs.writeFileSync(contextPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving context:', error);
        }
    }

    /**
     * Load previously reported insights
     */
    loadInsights() {
        try {
            if (fs.existsSync(this.insightsPath)) {
                const data = JSON.parse(fs.readFileSync(this.insightsPath, 'utf8'));
                if (Array.isArray(data)) {
                    this.reportedInsights = data;
                }
            }
        } catch (error) {
            console.error('Error loading insights:', error);
            this.reportedInsights = [];
        }
    }

    /**
     * Persist reported insights to disk
     */
    saveInsights() {
        try {
            fs.writeFileSync(this.insightsPath, JSON.stringify(this.reportedInsights, null, 2));
        } catch (error) {
            console.error('Error saving insights:', error);
        }
    }

    /**
     * Calculate text similarity using simple word overlap
     * Returns a value between 0 and 1 (1 = identical)
     */
    calculateTextSimilarity(text1, text2) {
        const normalize = (text) => {
            return text.toLowerCase()
                .replace(/[^\w\s]/g, ' ') // Remove punctuation
                .replace(/\s+/g, ' ')      // Normalize whitespace
                .trim()
                .split(' ')
                .filter(word => word.length > 3); // Only words longer than 3 chars
        };

        const words1 = normalize(text1);
        const words2 = normalize(text2);

        if (words1.length === 0 || words2.length === 0) return 0;

        // Calculate Jaccard similarity (intersection / union)
        const set1 = new Set(words1);
        const set2 = new Set(words2);

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
    }

    /**
     * Check if an insight is a duplicate
     */
    isDuplicateInsight(newText, existingInsights, similarityThreshold = 0.7) {
        for (const existing of existingInsights) {
            const similarity = this.calculateTextSimilarity(newText, existing.text);
            if (similarity >= similarityThreshold) {
                console.log(`[DEDUP] Found duplicate insight (similarity: ${(similarity * 100).toFixed(1)}%)`);
                console.log(`  New: "${newText.substring(0, 80)}..."`);
                console.log(`  Existing: "${existing.text.substring(0, 80)}..."`);
                return true;
            }
        }
        return false;
    }

    /**
     * Record insights reported by agents
     */
    reportInsights(agentId, agentName, insights, metadata = {}) {
        console.log(`🔍 [reportInsights] Called with agentId: ${agentId}, agentName: ${agentName}, insights count: ${insights?.length || 0}`);

        if (!insights || insights.length === 0) return [];

        const normalized = insights
            .filter(Boolean)
            .map((insight) => {
                if (typeof insight === 'string') {
                    return { text: insight };
                }
                if (insight && typeof insight === 'object') {
                    return insight;
                }
                return null;
            })
            .filter(Boolean);

        if (normalized.length === 0) return [];

        const reportedAt = new Date().toISOString();
        const candidateEntries = normalized.map((insight, index) => ({
            id: this.generateId(),
            agentId: agentId || 'unknown',
            agentName: agentName || 'Unknown Agent',
            text: insight.text?.trim() || '',
            status: 'reported',
            stepTitle: insight.stepTitle || metadata.stepTitle || null,
            stepIndex: insight.stepIndex ?? metadata.stepIndex ?? null,
            phase: metadata.phase ?? null,
            sequence: metadata.sequence ?? index,
            supportingData: insight.supportingData || null,
            timestamp: insight.timestamp || metadata.timestamp || reportedAt,
            reportedAt
        })).filter(entry => entry.text);

        console.log(`🔍 [reportInsights] Created ${candidateEntries.length} candidate entries with agentId: ${agentId}`);
        if (candidateEntries.length > 0) {
            console.log(`🔍 [reportInsights] First entry:`, JSON.stringify(candidateEntries[0], null, 2));
        }

        if (candidateEntries.length === 0) return [];

        // Filter out duplicates based on text similarity
        const newEntries = candidateEntries.filter(entry => {
            return !this.isDuplicateInsight(entry.text, this.reportedInsights);
        });

        if (newEntries.length === 0) {
            console.log(`[DEDUP] All ${candidateEntries.length} insights were duplicates - skipped`);
            return [];
        }

        if (newEntries.length < candidateEntries.length) {
            console.log(`[DEDUP] Filtered ${candidateEntries.length - newEntries.length} duplicate(s), keeping ${newEntries.length} unique insight(s)`);
        }

        this.reportedInsights.push(...newEntries);
        console.log(`💾 [reportInsights] Saving ${newEntries.length} new insights to insights.json`);
        console.log(`💾 [reportInsights] Total insights in memory: ${this.reportedInsights.length}`);
        this.saveInsights();
        console.log(`✅ [reportInsights] Insights saved successfully`);

        return newEntries;
    }

    /**
     * Return all reported insights
     */
    getReportedInsights() {
        return this.reportedInsights.slice().sort((a, b) => {
            return new Date(b.timestamp || b.reportedAt || 0) - new Date(a.timestamp || a.reportedAt || 0);
        });
    }

    /**
     * Remove an insight by id
     */
    deleteInsight(insightId) {
        const before = this.reportedInsights.length;
        this.reportedInsights = this.reportedInsights.filter(insight => insight.id !== insightId);
        if (this.reportedInsights.length !== before) {
            this.saveInsights();
        }
        return this.reportedInsights;
    }

    /**
     * Load orchestrator state (hypothesis, etc.)
     */
    loadOrchestratorState() {
        try {
            if (fs.existsSync(this.orchestratorStatePath)) {
                const data = JSON.parse(fs.readFileSync(this.orchestratorStatePath, 'utf8'));
                const hypotheses = Array.isArray(data.hypotheses) ? data.hypotheses : [];
                const executiveSummary = Array.isArray(data.executiveSummary) ? data.executiveSummary : [];
                this.orchestratorState = {
                    hypotheses: hypotheses.map(h => ({
                        id: h.id || this.generateId(),
                        text: h.text || '',
                        status: h.status || 'pending',
                        evidence: Array.isArray(h.evidence) ? h.evidence : [],
                        reasoning: h.reasoning || '',
                        confidence: h.confidence || null,
                        createdAt: h.createdAt || new Date().toISOString(),
                        lastEvaluatedAt: h.lastEvaluatedAt || null
                    })),
                    executiveSummary
                };
            }
        } catch (error) {
            console.error('Error loading orchestrator state:', error);
            this.orchestratorState = {
                hypotheses: [],
                executiveSummary: []
            };
        }
    }

    /**
     * Persist orchestrator state
     */
    saveOrchestratorState() {
        try {
            fs.writeFileSync(this.orchestratorStatePath, JSON.stringify(this.orchestratorState, null, 2));
        } catch (error) {
            console.error('Error saving orchestrator state:', error);
        }
    }

    /**
     * Get orchestrator state snapshot
     */
    getOrchestratorState() {
        return {
            hypotheses: (this.orchestratorState.hypotheses || []).map(h => ({ ...h })),
            executiveSummary: (this.orchestratorState.executiveSummary || []).slice()
        };
    }

    getHypotheses() {
        return (this.orchestratorState.hypotheses || []).map(h => ({ ...h }));
    }

    addHypothesis(text) {
        const trimmed = (text || '').trim();
        if (!trimmed) {
            throw new Error('Hypothesis text is required');
        }

        const newHypothesis = {
            id: this.generateId(),
            text: trimmed,
            status: 'pending',
            evidence: [],
            reasoning: '',
            confidence: null,
            createdAt: new Date().toISOString(),
            lastEvaluatedAt: null
        };

        if (!Array.isArray(this.orchestratorState.hypotheses)) {
            this.orchestratorState.hypotheses = [];
        }

        this.orchestratorState.hypotheses.unshift(newHypothesis);
        this.saveOrchestratorState();
        return { ...newHypothesis };
    }

    updateHypothesis(id, updates = {}) {
        if (!Array.isArray(this.orchestratorState.hypotheses)) {
            this.orchestratorState.hypotheses = [];
        }

        const index = this.orchestratorState.hypotheses.findIndex(h => h.id === id);
        if (index === -1) {
            throw new Error('Hypothesis not found');
        }

        const existing = this.orchestratorState.hypotheses[index];
        const updated = {
            ...existing,
            ...updates,
            id: existing.id,
            evidence: Array.isArray(updates.evidence) ? updates.evidence : existing.evidence,
            reasoning: updates.reasoning !== undefined ? updates.reasoning : existing.reasoning,
            status: updates.status || existing.status,
            confidence: updates.confidence !== undefined ? updates.confidence : existing.confidence,
            lastEvaluatedAt: updates.lastEvaluatedAt || existing.lastEvaluatedAt
        };

        this.orchestratorState.hypotheses[index] = updated;
        this.saveOrchestratorState();
        return { ...updated };
    }

    deleteHypothesis(id) {
        if (!Array.isArray(this.orchestratorState.hypotheses)) {
            this.orchestratorState.hypotheses = [];
            return [];
        }

        this.orchestratorState.hypotheses = this.orchestratorState.hypotheses.filter(h => h.id !== id);
        this.saveOrchestratorState();
        return this.getHypotheses();
    }

    /**
     * Get executive summary
     */
    getExecutiveSummary() {
        return (this.orchestratorState.executiveSummary || []).slice();
    }

    /**
     * Save executive summary
     */
    saveExecutiveSummaryBullets(bullets) {
        if (!Array.isArray(bullets)) {
            throw new Error('Executive summary must be an array of bullets');
        }

        this.orchestratorState.executiveSummary = bullets.map(bullet => {
            const trimmed = bullet.trim();
            return trimmed.startsWith('-') ? trimmed : `- ${trimmed}`;
        });

        this.saveOrchestratorState();
        return this.orchestratorState.executiveSummary;
    }

    /**
     * Process PDF file
     */
    /**
     * Save agent state to storage
     */
    saveAgentState(agentId, agentData) {
        try {
            this.agentStates.set(agentId, agentData);
            
            // Also save to disk
            const agentStatesPath = path.join(__dirname, '../storage/agent-states.json');
            const existingData = {};
            
            if (fs.existsSync(agentStatesPath)) {
                try {
                    Object.assign(existingData, JSON.parse(fs.readFileSync(agentStatesPath, 'utf8')));
                } catch (e) {
                    console.error('Error reading existing agent states:', e);
                }
            }
            
            existingData[agentId] = agentData;
            fs.writeFileSync(agentStatesPath, JSON.stringify(existingData, null, 2));
            
            console.log(`Agent state saved for ${agentData.name} (${agentId})`);
        } catch (error) {
            console.error('Error saving agent state:', error);
        }
    }

    /**
     * Get saved agent state
     */
    getAgentState(agentId) {
        // First check memory
        let state = this.agentStates.get(agentId);
        
        // If not in memory, try loading from disk
        if (!state) {
            const agentStatesPath = path.join(__dirname, '../storage/agent-states.json');
            if (fs.existsSync(agentStatesPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(agentStatesPath, 'utf8'));
                    state = data[agentId];
                    if (state) {
                        this.agentStates.set(agentId, state);
                    }
                } catch (e) {
                    console.error('Error loading agent state from disk:', e);
                }
            }
        }
        
        return state;
    }

    /**
     * Add agent context from execution
     */
    addAgentContext(agentId, context) {
        // Store agent execution context for future reference
        try {
            // Get existing agent state
            const agentState = this.getAgentState(agentId) || {};
            
            // Initialize execution context if not present
            if (!agentState.executionContext) {
                agentState.executionContext = [];
            }
            
            // Add new context
            agentState.executionContext.push({
                ...context,
                timestamp: new Date().toISOString()
            });
            
            // Keep only last 20 context entries per agent
            if (agentState.executionContext.length > 20) {
                agentState.executionContext = agentState.executionContext.slice(-20);
            }
            
            // Save updated state
            this.saveAgentState(agentId, agentState);
            
        } catch (error) {
            console.error('Error adding agent context:', error);
        }
    }

    async processDocument(filePath, metadata = {}) {
        try {
            // Read PDF
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(dataBuffer);
            
            const text = pdfData.text;
            const numPages = pdfData.numpages;
            
            // Chunk text
            const chunks = this.chunkText(text, 1000); // 1000 chars per chunk
            
            const docId = metadata.id || this.generateId();
            
            const document = {
                id: docId,
                filename: metadata.filename || path.basename(filePath),
                text,
                chunks,
                numPages,
                processedAt: new Date().toISOString(),
                metadata
            };
            
            this.documents.set(docId, document);
            this.rebuildSharedContext();
            this.saveDocuments();
            
            return document;
            
        } catch (error) {
            console.error('Error processing document:', error);
            throw error;
        }
    }

    /**
     * Chunk text into smaller pieces
     */
    chunkText(text, chunkSize = 1000) {
        const chunks = [];
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        
        let currentChunk = '';
        
        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > chunkSize) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                currentChunk = sentence;
            } else {
                currentChunk += ' ' + sentence;
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks;
    }

    /**
     * Rebuild shared context from all documents
     */
    rebuildSharedContext() {
        const contextParts = [];
        
        for (const [docId, doc] of this.documents) {
            // Use first few chunks as summary
            const summary = doc.chunks.slice(0, 3).join('\n\n');
            contextParts.push(`\n--- ${doc.filename} ---\n${summary}`);
        }
        
        this.sharedContext = contextParts.join('\n\n');
        
        // Limit total context length
        if (this.sharedContext.length > 10000) {
            this.sharedContext = this.sharedContext.substring(0, 10000) + '\n...[truncated]';
        }
    }

    /**
     * Get shared context for all agents
     */
    getSharedContext() {
        return this.sharedContext;
    }

    /**
     * Get relevant context for specific query (simple version)
     * Future: Implement semantic search with embeddings
     */
    getRelevantContext(query, maxChunks = 5) {
        const relevantChunks = [];
        
        for (const [docId, doc] of this.documents) {
            for (const chunk of doc.chunks) {
                // Simple keyword matching (can be improved with embeddings)
                const queryWords = query.toLowerCase().split(' ');
                const chunkLower = chunk.toLowerCase();
                
                let relevanceScore = 0;
                for (const word of queryWords) {
                    if (word.length > 3 && chunkLower.includes(word)) {
                        relevanceScore++;
                    }
                }
                
                if (relevanceScore > 0) {
                    relevantChunks.push({
                        chunk,
                        document: doc.filename,
                        relevance: relevanceScore
                    });
                }
            }
        }
        
        // Sort by relevance and return top chunks
        return relevantChunks
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, maxChunks)
            .map(item => `[${item.document}] ${item.chunk}`)
            .join('\n\n');
    }

    /**
     * Build agent-specific context
     */
    buildAgentContext(agentConfig) {
        // Start with agent focus
        let context = `Focus: ${agentConfig.focus}\n\n`;
        
        // Add shared context from documents
        if (this.sharedContext) {
            context += `Background Information:\n${this.sharedContext}`;
        }
        
        return context;
    }

    /**
     * Get all documents
     */
    getDocuments() {
        return Array.from(this.documents.values());
    }

    /**
     * Get document by ID
     */
    getDocument(docId) {
        return this.documents.get(docId);
    }

    /**
     * Remove document
     */
    removeDocument(docId) {
        this.documents.delete(docId);
        this.rebuildSharedContext();
        this.saveDocuments();
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

module.exports = ContextManager;
