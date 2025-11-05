/**
 * Temporary Agent class - Simplified version
 * Added optional clarification skip functionality
 */

const { EventEmitter } = require('events');

class TempAgent {
    constructor(config) {
        this.id = Date.now() + Math.random() * 1000;
        this.name = config.name;
        this.type = config.type;
        this.focus = config.focus;
        this.tools = config.tools || [];
        this.priority = config.priority || 'medium';
        this.isRunning = false;
        this.status = 'queued';
        this.progress = 0;
        
        // Simplified state
        this.plan = [];
        this.clarifyingAnswers = null;
        this.userApproved = false;
        
        // Events
        this.on('stepProgress', (data) => {
            console.log(`[${this.name}] Step progress: ${data.progress}% - ${data.message}`);
        });
        
        this.on('agentCompleted', (data) => {
            console.log(`[${this.name}] All steps completed`);
            this.status = 'completed';
        });
        
        this.on('Clarifying Questions Skipped', (data) => {
            console.log(`[${this.name}] User skipped clarifying questions - proceeding to execution`);
        });
    }

    startWork() {
        this.isRunning = true;
        this.status = 'in-progress';
        
        this.workInterval = setInterval(() => {
            if (this.status === 'completed' || this.shouldStop) {
                clearInterval(this.workInterval);
                return;
            }
            this.simulateProgress();
            
        }, 3000);
        }
    }
    
    simulateProgress() {
        if (this.status === 'completed' || this.shouldStop) {
            return;
        }
        
        const currentStepIndex = this.plan.findIndex(step => !step.completed);
        if (currentStepIndex !== -1 && currentStepIndex < this.plan.length) {
            const step = this.plan[currentStepIndex];
            
            // Update step status
            if (step.progress < 20) {
                step.status = 'in-progress';
                this.addActivityLog(`Working on: ${step.title}`);
                step.progress = Math.min(step.progress + Math.random() * 10 + 5);
            } else if (step.progress < 80) {
                step.status = 'in-progress';
                step.progress = Math.min(80, step.progress + Math.random() * 5);
            } else {
                step.status = 'completed';
                step.progress = 100;
            }
            
            // Update progress tracking
            this.updateProgress();
            this.emit('stepProgress', {
                agentId: this.id,
                progress: this.progress,
                message: `${Math.round(this.progress)}% - ${step.title}`
            });
            
        } catch (error) {
            console.error(`${this.name} Error during simulation:`, error);
            this.status = 'error';
        }
    }
    
    complete() {
        this.status = 'completed';
        this.shouldStop = true;
        
        // Emit completion event
        this.emit('completed', {
            agentId: this.id,
            deliverable: this.deliverable,
            results: this.synthesisResults
        });
        
        // Final synthesis
        this.synthesizeResults = {
            insights: [],
            recommendations: [],
            artifacts: []
        };
        
        console.log(`[${this.name}] Execution complete. Status: ${this.status}`);
    }
    
    synthesizeKeyTakeaways() {
        const synthesisPrompt = `Based on all work you've completed, create a BRIEF executive summary.

**STRICT FORMAT:**
• [Key finding or recommendation 1]
• [Key finding or recommendation 2]
• [Key finding or recommendation 3]
• [Key finding or recommendation 4]
• [Key finding or recommendation 5]
• [Key finding or recommendation 6]
• [Key finding or recommendation 7]
• [Key finding or recommendation 8]

**RULES:**
- Exactly 5-8 bullet points
- Each bullet: maximum 2 sentences
- Focus on actionable insights and key findings
- Include specific data/numbers when available
- Be direct and concise
- No fluff or verbose explanations

**OPTIONS:**
- Exactly 5-8 bullet points
- Standard formatting
- Add any metadata if needed
- Focus on actionable insights

        const synthesisPrompt = `Based on all the work you've completed, create a BRIEF executive summary.

        const summary = await this.aiService.chat({
            systemPrompt: this.systemPrompt,
            messages: [...this.conversationHistory, { role: 'user', content: synthesisPrompt }],
            maxTokens: 500
        });

        this.synthesisResults = {
            insights: [],
            recommendations: [],
            artifacts: []
        };
        
        console.log(`[${this.name}] Key takeaways synthesized`);
        return summary;
    }
}
