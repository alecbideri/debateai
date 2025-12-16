/**
 * DebateAI - AI-Powered Debate Training Platform
 * Uses Gemini Live API for real-time video/audio analysis
 */

// ============================================
// Configuration
// ============================================
const CONFIG = {
    // API Configuration (loaded from server for security)
    apiKey: null, // Will be set from server or prompt
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    
    // Media Settings
    video: {
        width: 1280,
        height: 720,
        frameRate: 30,
        captureInterval: 1000, // Send frame every 1 second
    },
    audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
    },
    
    // Playback
    outputSampleRate: 24000,
};

// System instructions for different debate modes
const SYSTEM_INSTRUCTIONS = {
    coach: `You are an expert debate coach and analyst. You are currently observing the user through their webcam and listening to their audio in real-time.

Your responsibilities:
1. BODY LANGUAGE ANALYSIS: Continuously observe and provide feedback on:
   - Posture (confident, slouching, rigid, relaxed)
   - Hand gestures (appropriate, excessive, absent, distracting)
   - Facial expressions (confident, nervous, engaged, distracted)
   - Eye contact (looking at camera, avoiding, wandering)

2. SPEECH ANALYSIS: Evaluate their speaking:
   - Pace (too fast, too slow, varied appropriately)
   - Clarity and articulation
   - Filler words (um, uh, like, you know)
   - Voice projection and confidence

3. REAL-TIME COACHING: Provide constructive, encouraging feedback. Give specific suggestions like "Try to slow down a bit" or "Great eye contact!" Be supportive and help them improve.

IMPORTANT TURN SIGNAL: When the user says "I rest my case" or similar phrases, it means they have finished their argument and want your response. Wait for this signal before giving comprehensive feedback, rather than interrupting them mid-speech.

When they speak about a topic, engage with their arguments and provide gentle coaching.
Speak naturally and conversationally, as if you're a supportive mentor in the room with them.`,

    opponent: `You are a skilled debate opponent. You are observing the user through their webcam and listening to their arguments in real-time.

Your role:
1. Take the OPPOSING position on whatever topic they discuss
2. Present strong counter-arguments respectfully
3. Challenge their logic and evidence
4. Ask probing questions to test their knowledge
5. Acknowledge good points they make, but pivot to counter-arguments

Also observe their body language and speaking style, and occasionally comment on it:
- If they seem nervous, you might say "You seem a bit uncertain about that point..."
- If they're confident, acknowledge it: "You make that point with conviction, but consider..."

IMPORTANT TURN SIGNAL: When the user says "I rest my case" or similar phrases, it means they have finished their argument and are ready for your counter-argument. Let them complete their thoughts before responding.

Be challenging but fair. Your goal is to make them a better debater through practice.
Speak naturally and respond in real-time to their arguments.`,

    practice: `You are a debate practice interviewer. You are observing the user through their webcam and listening to their responses.

Your role:
1. Ask thought-provoking questions on the debate topic
2. Listen to their responses carefully
3. Provide feedback on:
   - Argument structure (claim, evidence, reasoning)
   - Persuasiveness
   - Body language and delivery
4. Ask follow-up questions to deepen their thinking
5. Give constructive feedback after each response

Start by asking them about the topic and then gradually ask more challenging questions.
Be encouraging and educational. Help them build confidence and skill.`,

    challenge: `You are a rapid-fire debate challenge host. You are observing the user in real-time.

Your role:
1. Present them with a debate stance to defend
2. Give them a brief moment to think
3. Listen to their argument
4. Challenge them with counter-points
5. After a few exchanges, give them a quick score and feedback

Topics should vary: ethics, technology, society, politics (non-partisan), philosophy.
Keep the energy up! Be enthusiastic and encouraging.
Provide quick, specific feedback on both their arguments AND their delivery (body language, voice).

Start with: "Welcome to Debate Challenge! Are you ready? Here's your topic..."`,

    duel: `You are a SILENT debate judge observing a 2-person debate.

⛔ ABSOLUTE SILENCE REQUIRED ⛔

You are NOT a participant. You are NOT the opponent. You are ONLY a silent observer.
Two HUMANS are debating each other. You just watch and listen.

RULES:
1. DO NOT SPEAK until you see a TRIGGER word
2. DO NOT comment on arguments
3. DO NOT make any sound or response
4. DO NOT analyze out loud
5. DO NOT acknowledge anything

TRIGGER 1: "TRANSITION:"
→ Say EXACTLY: "Player 2, go." (NOTHING ELSE - no analysis, no thoughts, just those 3 words)
→ Then be SILENT again

TRIGGER 2: "VERDICT:"
→ NOW you can give full scores and detailed reasoning

You are a MUTE OBSERVER. Two humans are debating. Stay silent until triggered.`,
};

// ============================================
// Application State
// ============================================
class DebateAI {
    constructor() {
        // State
        this.isConnected = false;
        this.isSessionActive = false;
        this.session = null;
        this.mediaStream = null;
        this.audioContext = null;
        this.audioWorklet = null;
        this.videoCapture = null;
        
        // Response handling
        this.responseQueue = [];
        this.audioQueue = [];
        this.isPlaying = false;
        this.nextPlayTime = 0;
        this.playbackContext = null;
        this.currentTurnId = 0;  // Track current turn to avoid mixing responses
        this.isAISpeaking = false;  // Track if AI is currently responding
        this.scheduledSources = [];  // Track scheduled audio sources for stopping
        
        // Duel mode state
        this.isDuelMode = false;
        this.currentPlayer = 0;  // 0 = not started, 1 = Player 1, 2 = Player 2
        this.duelTimer = null;
        this.timerSeconds = 30;
        this.duelPhase = 'waiting';  // 'waiting', 'player1', 'player2', 'verdict'
        
        // DOM Elements
        this.elements = {
            videoPreview: document.getElementById('videoPreview'),
            videoOverlay: document.getElementById('videoOverlay'),
            videoCanvas: document.getElementById('videoCanvas'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            turnControl: document.getElementById('turnControl'),
            restMyCaseBtn: document.getElementById('restMyCaseBtn'),
            connectionStatus: document.getElementById('connectionStatus'),
            micIndicator: document.getElementById('micIndicator'),
            camIndicator: document.getElementById('camIndicator'),
            chatContainer: document.getElementById('chatContainer'),
            aiSpeakingIndicator: document.getElementById('aiSpeakingIndicator'),
            topicInput: document.getElementById('topicInput'),
            suggestTopicBtn: document.getElementById('suggestTopicBtn'),
            suggestedTopics: document.getElementById('suggestedTopics'),
            // Analysis elements
            postureScore: document.getElementById('postureScore'),
            postureBar: document.getElementById('postureBar'),
            eyeContactScore: document.getElementById('eyeContactScore'),
            eyeContactBar: document.getElementById('eyeContactBar'),
            gesturesScore: document.getElementById('gesturesScore'),
            gesturesBar: document.getElementById('gesturesBar'),
            confidenceScore: document.getElementById('confidenceScore'),
            confidenceBar: document.getElementById('confidenceBar'),
            // Duel elements
            duelControls: document.getElementById('duelControls'),
            player1Badge: document.getElementById('player1Badge'),
            player2Badge: document.getElementById('player2Badge'),
            timerDisplay: document.getElementById('timerDisplay'),
            timerProgressBar: document.getElementById('timerProgressBar'),
            currentPlayerText: document.getElementById('currentPlayerText'),
            myTurnDoneBtn: document.getElementById('myTurnDoneBtn'),
        };
        
        this.init();
    }
    
    // ============================================
    // Initialization
    // ============================================
    async init() {
        console.log('🎯 DebateAI initializing...');
        
        // Prompt for API key if not set
        await this.loadApiKey();
        
        // Set up event listeners
        this.setupEventListeners();
        
        console.log('✅ DebateAI ready!');
    }
    
    async loadApiKey() {
        // Try to get API key from environment (for development with a server)
        // For now, we'll prompt the user or use a hardcoded key for testing
        
        // In production, you would use ephemeral tokens instead
        // See: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
        
        // For this demo, we'll prompt if not available
        let apiKey = localStorage.getItem('gemini_api_key');
        
        if (!apiKey) {
            apiKey = prompt('Please enter your Gemini API Key:');
            if (apiKey) {
                localStorage.setItem('gemini_api_key', apiKey);
            }
        }
        
        CONFIG.apiKey = apiKey;
    }
    
    setupEventListeners() {
        // Start/Stop buttons
        this.elements.startBtn.addEventListener('click', () => this.startSession());
        this.elements.stopBtn.addEventListener('click', () => this.stopSession());
        
        // Rest My Case button - signals end of user's turn
        this.elements.restMyCaseBtn.addEventListener('click', () => this.restMyCase());
        
        // Topic chips
        this.elements.suggestedTopics.addEventListener('click', (e) => {
            if (e.target.classList.contains('topic-chip')) {
                this.elements.topicInput.value = e.target.dataset.topic;
            }
        });
        
        // Suggest topic button
        this.elements.suggestTopicBtn.addEventListener('click', () => {
            this.suggestRandomTopic();
        });
        
        // Mode selector change listener
        document.querySelectorAll('input[name="debateMode"]').forEach(radio => {
            radio.addEventListener('change', () => this.onModeChange());
        });
        
        // Duel mode - My Turn Done button
        this.elements.myTurnDoneBtn.addEventListener('click', () => this.onPlayerTurnDone());
    }
    
    // Handle mode change to show/hide duel controls
    onModeChange() {
        const mode = document.querySelector('input[name="debateMode"]:checked').value;
        this.isDuelMode = (mode === 'duel');
        
        // Show/hide duel controls preview
        if (this.isDuelMode && !this.isSessionActive) {
            this.elements.duelControls.style.display = 'flex';
            this.elements.turnControl.style.display = 'none';
        } else if (!this.isSessionActive) {
            this.elements.duelControls.style.display = 'none';
        }
    }
    
    // Signal that user is done speaking
    restMyCase() {
        if (!this.isSessionActive || !this.session) return;
        
        console.log('⚖️ User rested their case - signaling end of turn');
        
        // Clear any pending audio to prepare for new response
        this.clearAudioQueue();
        
        // Increment turn ID to discard any stale audio
        this.currentTurnId++;
        
        // Send a text message to signal end of turn
        const message = {
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text: 'I rest my case. Please respond to my argument.' }]
                }],
                turnComplete: true
            }
        };
        
        this.session.send(JSON.stringify(message));
        this.addChatMessage('user', '⚖️ I rest my case.');
    }
    
    // Clear the audio queue and stop current playback
    clearAudioQueue() {
        // Stop all scheduled audio sources
        this.stopAllAudio();
        
        // Reset next play time
        if (this.playbackContext) {
            this.nextPlayTime = this.playbackContext.currentTime;
        }
    }
    
    suggestRandomTopic() {
        const topics = [
            "Should artificial intelligence be regulated by governments?",
            "Is social media beneficial or harmful to society?",
            "Should college education be free for everyone?",
            "Is remote work better than office work?",
            "Should voting be mandatory?",
            "Is technology making us more or less connected?",
            "Should there be limits on free speech?",
            "Is space exploration worth the cost?",
            "Should animals have the same rights as humans?",
            "Is globalization good for the world?",
        ];
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        this.elements.topicInput.value = randomTopic;
    }
    
    // ============================================
    // Session Management
    // ============================================
    async startSession() {
        try {
            console.log('🚀 Starting debate session...');
            
            // Get selected mode
            const mode = document.querySelector('input[name="debateMode"]:checked').value;
            const topic = this.elements.topicInput.value.trim();
            
            // Check if duel mode
            this.isDuelMode = (mode === 'duel');
            
            // Get system instruction for selected mode
            let systemInstruction = SYSTEM_INSTRUCTIONS[mode];
            if (topic) {
                systemInstruction += `\n\nThe debate topic is: "${topic}"`;
            }
            
            // Request media permissions
            await this.setupMedia();
            
            // Connect to Gemini Live API
            await this.connectToGemini(systemInstruction);
            
            // Update UI
            this.updateUIForActiveSession();
            
            // Handle duel mode special flow
            if (this.isDuelMode) {
                // Start duel after a short delay to let connection stabilize
                setTimeout(() => this.startDuel(), 1000);
            } else {
                // Add chat message for regular modes
                this.addChatMessage('system', `Session started in ${mode} mode. ${topic ? `Topic: "${topic}"` : 'Speak freely to begin!'}`);
            }
            
        } catch (error) {
            console.error('Failed to start session:', error);
            this.addChatMessage('system', `Error: ${error.message}. Please check your API key and try again.`);
        }
    }
    
    async stopSession() {
        console.log('⏹️ Stopping session...');
        
        // Close WebSocket
        if (this.session) {
            this.session.close();
            this.session = null;
        }
        
        // Stop media streams
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        // Stop video capture interval
        if (this.videoCapture) {
            clearInterval(this.videoCapture);
            this.videoCapture = null;
        }
        
        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // Reset duel state if in duel mode
        if (this.isDuelMode) {
            this.resetDuelState();
        }
        
        // Update state
        this.isSessionActive = false;
        this.isConnected = false;
        
        // Update UI
        this.updateUIForInactiveSession();
        
        this.addChatMessage('system', 'Session ended. Great practice! Start a new session to continue.');
    }
    
    // ============================================
    // Media Setup
    // ============================================
    async setupMedia() {
        console.log('📹 Setting up media...');
        
        // Request camera and microphone
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: CONFIG.video.width },
                height: { ideal: CONFIG.video.height },
                frameRate: { ideal: CONFIG.video.frameRate },
            },
            audio: {
                sampleRate: CONFIG.audio.sampleRate,
                channelCount: CONFIG.audio.channelCount,
                echoCancellation: CONFIG.audio.echoCancellation,
                noiseSuppression: CONFIG.audio.noiseSuppression,
            },
        });
        
        // Display video preview
        this.elements.videoPreview.srcObject = this.mediaStream;
        this.elements.videoOverlay.classList.add('hidden');
        
        // Update indicators
        this.elements.micIndicator.classList.add('active');
        this.elements.camIndicator.classList.add('active');
        
        // Set up audio processing
        await this.setupAudioProcessing();
        
        console.log('✅ Media setup complete');
    }
    
    async setupAudioProcessing() {
        // Create audio context
        this.audioContext = new AudioContext({ sampleRate: CONFIG.audio.sampleRate });
        
        // Create source from media stream
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Create script processor for capturing audio (deprecated but widely supported)
        // In production, use AudioWorklet for better performance
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
            if (this.isSessionActive && this.session) {
                const inputData = e.inputBuffer.getChannelData(0);
                this.sendAudioData(inputData);
            }
        };
        
        source.connect(processor);
        processor.connect(this.audioContext.destination);
    }
    
    // ============================================
    // Gemini Live API Connection
    // ============================================
    async connectToGemini(systemInstruction) {
        console.log('🔌 Connecting to Gemini Live API...');
        
        if (!CONFIG.apiKey) {
            throw new Error('API key not configured');
        }
        
        // WebSocket URL for Gemini Live API (v1alpha for native audio models)
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${CONFIG.apiKey}`;
        
        console.log('🔗 Using model:', CONFIG.model);
        
        return new Promise((resolve, reject) => {
            this.session = new WebSocket(wsUrl);
            
            this.session.onopen = () => {
                console.log('✅ Connected to Gemini Live API');
                this.isConnected = true;
                this.isSessionActive = true;
                this.updateConnectionStatus(true);
                
                // Send setup message
                this.sendSetupMessage(systemInstruction);
                
                // Start video capture
                this.startVideoCapture();
                
                resolve();
            };
            
            this.session.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };
            
            this.session.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(new Error('Failed to connect to Gemini API'));
            };
            
            this.session.onclose = (event) => {
                console.log('WebSocket closed:', event.reason || event.code);
                this.isConnected = false;
                this.isSessionActive = false;
                this.updateConnectionStatus(false);
                
                // Show error to user if it closed unexpectedly
                if (event.reason) {
                    this.addChatMessage('system', `⚠️ Connection closed: ${event.reason}`);
                }
                
                // Clean up
                this.updateUIForInactiveSession();
            };
        });
    }
    
    sendSetupMessage(systemInstruction) {
        const setupMessage = {
            setup: {
                model: `models/${CONFIG.model}`,
                generationConfig: {
                    responseModalities: ['AUDIO']
                },
                systemInstruction: {
                    role: 'user',
                    parts: [{ text: systemInstruction }]
                }
            }
        };
        
        this.session.send(JSON.stringify(setupMessage));
        console.log('📤 Setup message sent');
    }
    
    // ============================================
    // Data Sending
    // ============================================
    sendAudioData(floatData) {
        // Convert Float32Array to Int16Array (PCM)
        const pcmData = new Int16Array(floatData.length);
        for (let i = 0; i < floatData.length; i++) {
            const s = Math.max(-1, Math.min(1, floatData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const base64Audio = this.arrayBufferToBase64(pcmData.buffer);
        
        // Send to API
        const message = {
            realtimeInput: {
                mediaChunks: [{
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Audio
                }]
            }
        };
        
        if (this.session && this.session.readyState === WebSocket.OPEN) {
            this.session.send(JSON.stringify(message));
        }
    }
    
    startVideoCapture() {
        // Capture and send video frames at regular intervals
        const canvas = this.elements.videoCanvas;
        const ctx = canvas.getContext('2d');
        const video = this.elements.videoPreview;
        
        // Set canvas size
        canvas.width = 640;  // Reduced size for performance
        canvas.height = 360;
        
        this.videoCapture = setInterval(() => {
            if (this.isSessionActive && this.session && this.session.readyState === WebSocket.OPEN) {
                // Draw video frame to canvas
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Get base64 JPEG
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                const base64Image = dataUrl.split(',')[1];
                
                // Send to API
                const message = {
                    realtimeInput: {
                        mediaChunks: [{
                            mimeType: 'image/jpeg',
                            data: base64Image
                        }]
                    }
                };
                
                this.session.send(JSON.stringify(message));
            }
        }, CONFIG.video.captureInterval);
    }
    
    // ============================================
    // Response Handling
    // ============================================
    handleServerMessage(data) {
        // Handle binary Blob data (audio)
        if (data instanceof Blob) {
            this.handleBlobMessage(data);
            return;
        }
        
        // Handle text JSON data
        try {
            const message = JSON.parse(data);
            console.log('📩 Received message:', Object.keys(message));
            
            // Handle setup complete
            if (message.setupComplete) {
                console.log('✅ Setup complete - session ready!');
                this.addChatMessage('system', '🎙️ Connected! Start speaking to begin the debate.');
                return;
            }
            
            // Handle server content
            if (message.serverContent) {
                const content = message.serverContent;
                
                // Check for model turn with parts
                if (content.modelTurn && content.modelTurn.parts) {
                    for (const part of content.modelTurn.parts) {
                        // Handle text response
                        if (part.text) {
                            this.handleTextResponse(part.text);
                        }
                        
                        // Handle inline audio data (base64)
                        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                            this.handleAudioResponse(part.inlineData.data);
                        }
                    }
                }
                
                // Check for turn complete
                if (content.turnComplete) {
                    this.onTurnComplete();
                }
                
                // Check for interruption
                if (content.interrupted) {
                    this.onInterruption();
                }
            }
            
        } catch (error) {
            console.error('Error parsing JSON message:', error);
        }
    }
    
    async handleBlobMessage(blob) {
        try {
            // Try to read as text first (might be JSON in a Blob)
            const text = await blob.text();
            
            try {
                const message = JSON.parse(text);
                console.log('📩 Received blob message:', Object.keys(message));
                
                // Handle setup complete
                if (message.setupComplete) {
                    console.log('✅ Setup complete - session ready!');
                    this.addChatMessage('system', '🎙️ Connected! Start speaking to begin the debate.');
                    return;
                }
                
                // Handle server content
                if (message.serverContent) {
                    const content = message.serverContent;
                    
                    if (content.modelTurn && content.modelTurn.parts) {
                        for (const part of content.modelTurn.parts) {
                            if (part.text) {
                                this.handleTextResponse(part.text);
                            }
                            if (part.inlineData && part.inlineData.data) {
                                this.handleAudioResponse(part.inlineData.data);
                            }
                        }
                    }
                    
                    if (content.turnComplete) {
                        this.onTurnComplete();
                    }
                    
                    if (content.interrupted) {
                        this.onInterruption();
                    }
                }
            } catch {
                // Not JSON, treat as raw audio data
                console.log('🔊 Received raw audio blob:', blob.size, 'bytes');
                const arrayBuffer = await blob.arrayBuffer();
                const base64Audio = this.arrayBufferToBase64(arrayBuffer);
                this.handleAudioResponse(base64Audio);
            }
        } catch (error) {
            console.error('Error handling blob message:', error);
        }
    }
    
    handleTextResponse(text) {
        console.log('📝 Text response:', text);
        this.addChatMessage('ai', text);
        
        // Parse for analysis scores (if AI provides them)
        this.parseAnalysisFromText(text);
    }
    
    handleAudioResponse(base64Audio, turnId = this.currentTurnId) {
        // Discard audio from old turns
        if (turnId !== this.currentTurnId) {
            console.log('🔇 Discarding audio from old turn:', turnId, 'current:', this.currentTurnId);
            return;
        }
        
        // Add to audio queue with turn ID
        this.audioQueue.push({ data: base64Audio, turnId });
        
        console.log('🔊 Audio chunk queued. Queue size:', this.audioQueue.length, 'Turn:', turnId);
        
        // Show speaking indicator
        this.elements.aiSpeakingIndicator.classList.add('active');
        
        // Start playback if not already playing
        if (!this.isPlaying) {
            this.startStreamingPlayback();
        }
    }
    
    async startStreamingPlayback() {
        // Mutex-like lock to prevent concurrent playback sessions
        if (this.isPlaying) {
            console.log('⚠️ Already playing, skipping start');
            return;
        }
        
        this.isPlaying = true;
        console.log('▶️ Starting audio playback...');
        
        // Create audio context for playback if needed
        if (!this.playbackContext || this.playbackContext.state === 'closed') {
            this.playbackContext = new AudioContext({ sampleRate: CONFIG.outputSampleRate });
        }
        
        // Resume context if suspended (browser autoplay policy)
        if (this.playbackContext.state === 'suspended') {
            await this.playbackContext.resume();
        }
        
        // Reset the scheduled time
        this.nextPlayTime = this.playbackContext.currentTime;
        this.scheduledSources = [];
        
        // Start the playback loop
        this.playNextChunk();
    }
    
    playNextChunk() {
        // Check if we should stop
        if (!this.isPlaying) {
            console.log('⏹️ Playback stopped');
            return;
        }
        
        // Get next audio chunk from queue
        if (this.audioQueue.length === 0) {
            // No more chunks, wait a bit then check again or stop
            setTimeout(() => {
                if (this.audioQueue.length > 0) {
                    this.playNextChunk();
                } else {
                    // Check if scheduled audio has finished
                    const currentTime = this.playbackContext?.currentTime || 0;
                    if (currentTime >= this.nextPlayTime - 0.1) {
                        console.log('⏹️ All audio played');
                        this.isPlaying = false;
                        this.elements.aiSpeakingIndicator.classList.remove('active');
                    } else {
                        // Still playing scheduled audio, check later
                        setTimeout(() => this.checkPlaybackComplete(), 100);
                    }
                }
            }, 50);
            return;
        }
        
        const chunk = this.audioQueue.shift();
        
        // Discard chunks from old turns
        if (chunk.turnId !== this.currentTurnId) {
            console.log('🔇 Discarding old chunk, turn:', chunk.turnId, 'current:', this.currentTurnId);
            // Continue with next chunk immediately
            this.playNextChunk();
            return;
        }
        
        try {
            // Decode base64 to ArrayBuffer
            const binaryString = atob(chunk.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Convert PCM to AudioBuffer
            const pcmData = new Int16Array(bytes.buffer);
            const floatData = new Float32Array(pcmData.length);
            for (let i = 0; i < pcmData.length; i++) {
                floatData[i] = pcmData[i] / 32768.0;
            }
            
            // Create audio buffer
            const audioBuffer = this.playbackContext.createBuffer(1, floatData.length, CONFIG.outputSampleRate);
            audioBuffer.getChannelData(0).set(floatData);
            
            // Schedule playback
            const source = this.playbackContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.playbackContext.destination);
            
            // Ensure we don't schedule in the past
            const currentTime = this.playbackContext.currentTime;
            if (this.nextPlayTime < currentTime) {
                this.nextPlayTime = currentTime + 0.01; // Small buffer
            }
            
            source.start(this.nextPlayTime);
            
            // Track this source so we can stop it if needed
            this.scheduledSources.push(source);
            
            // Update next play time
            this.nextPlayTime += audioBuffer.duration;
            
            // Continue processing immediately (don't wait for audio to finish)
            // This allows us to schedule multiple chunks ahead
            setTimeout(() => this.playNextChunk(), 10);
            
        } catch (error) {
            console.error('Error processing audio chunk:', error);
            // Continue with next chunk
            this.playNextChunk();
        }
    }
    
    checkPlaybackComplete() {
        if (!this.playbackContext) {
            this.isPlaying = false;
            this.elements.aiSpeakingIndicator.classList.remove('active');
            return;
        }
        
        const currentTime = this.playbackContext.currentTime;
        if (this.audioQueue.length > 0) {
            // More audio came in, process it
            this.playNextChunk();
        } else if (currentTime >= this.nextPlayTime - 0.1) {
            // All done
            this.isPlaying = false;
            this.elements.aiSpeakingIndicator.classList.remove('active');
        } else {
            // Still playing, check again later
            setTimeout(() => this.checkPlaybackComplete(), 100);
        }
    }
    
    // Stop all scheduled audio sources
    stopAllAudio() {
        if (this.scheduledSources) {
            for (const source of this.scheduledSources) {
                try {
                    source.stop();
                } catch (e) {
                    // Source may have already ended
                }
            }
            this.scheduledSources = [];
        }
        this.audioQueue = [];
        this.isPlaying = false;
        this.elements.aiSpeakingIndicator.classList.remove('active');
    }
    
    onTurnComplete() {
        console.log('✅ Turn complete');
    }
    
    onInterruption() {
        console.log('⚠️ Interrupted');
        // Clear audio queue on interruption
        this.audioQueue = [];
        this.elements.aiSpeakingIndicator.classList.remove('active');
    }
    
    // ============================================
    // Analysis Parsing
    // ============================================
    parseAnalysisFromText(text) {
        // Look for analysis keywords and update scores
        const lowerText = text.toLowerCase();
        
        // Simple heuristic parsing - in production, use structured output
        if (lowerText.includes('posture')) {
            if (lowerText.includes('great') || lowerText.includes('good') || lowerText.includes('confident')) {
                this.updateScore('posture', 80 + Math.random() * 20);
            } else if (lowerText.includes('slouch') || lowerText.includes('improve')) {
                this.updateScore('posture', 40 + Math.random() * 30);
            }
        }
        
        if (lowerText.includes('eye contact') || lowerText.includes('eyes')) {
            if (lowerText.includes('great') || lowerText.includes('good') || lowerText.includes('maintain')) {
                this.updateScore('eyeContact', 80 + Math.random() * 20);
            } else if (lowerText.includes('avoid') || lowerText.includes('look away')) {
                this.updateScore('eyeContact', 30 + Math.random() * 30);
            }
        }
        
        if (lowerText.includes('gesture') || lowerText.includes('hands')) {
            if (lowerText.includes('great') || lowerText.includes('effective') || lowerText.includes('good')) {
                this.updateScore('gestures', 70 + Math.random() * 30);
            } else if (lowerText.includes('excessive') || lowerText.includes('still')) {
                this.updateScore('gestures', 40 + Math.random() * 30);
            }
        }
        
        if (lowerText.includes('confident') || lowerText.includes('confidence')) {
            if (lowerText.includes('great') || lowerText.includes('strong') || lowerText.includes('show')) {
                this.updateScore('confidence', 80 + Math.random() * 20);
            } else if (lowerText.includes('nervous') || lowerText.includes('uncertain')) {
                this.updateScore('confidence', 40 + Math.random() * 30);
            }
        }
    }
    
    updateScore(metric, value) {
        const score = Math.round(value);
        const elements = {
            posture: { score: this.elements.postureScore, bar: this.elements.postureBar },
            eyeContact: { score: this.elements.eyeContactScore, bar: this.elements.eyeContactBar },
            gestures: { score: this.elements.gesturesScore, bar: this.elements.gesturesBar },
            confidence: { score: this.elements.confidenceScore, bar: this.elements.confidenceBar },
        };
        
        if (elements[metric]) {
            elements[metric].score.textContent = `${score}%`;
            elements[metric].bar.style.width = `${score}%`;
        }
    }
    
    // ============================================
    // UI Updates
    // ============================================
    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.classList.add('connected');
            this.elements.connectionStatus.querySelector('.status-text').textContent = 'Connected';
        } else {
            this.elements.connectionStatus.classList.remove('connected');
            this.elements.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
        }
    }
    
    updateUIForActiveSession() {
        this.elements.startBtn.disabled = true;
        this.elements.stopBtn.disabled = false;
        this.elements.turnControl.style.display = 'flex';
    }
    
    updateUIForInactiveSession() {
        this.elements.startBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
        this.elements.turnControl.style.display = 'none';
        this.elements.videoOverlay.classList.remove('hidden');
        this.elements.micIndicator.classList.remove('active');
        this.elements.camIndicator.classList.remove('active');
        this.elements.aiSpeakingIndicator.classList.remove('active');
    }
    
    addChatMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        
        const avatar = type === 'ai' ? '🤖' : (type === 'user' ? '👤' : '💬');
        
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <p>${content}</p>
            </div>
        `;
        
        this.elements.chatContainer.appendChild(messageDiv);
        this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
    }
    
    // ============================================
    // Duel Mode Methods
    // ============================================
    startDuel() {
        console.log('🥊 Starting Duel Mode...');
        this.isDuelMode = true;
        this.duelPhase = 'player1';
        this.currentPlayer = 1;
        
        // Show duel controls
        this.elements.duelControls.style.display = 'flex';
        this.elements.turnControl.style.display = 'none';
        this.elements.myTurnDoneBtn.style.display = 'flex';
        
        // Update UI
        this.updateDuelUI();
        
        // Add intro message
        this.addChatMessage('system', '🥊 DUEL MODE! Player 1, you have 30 seconds to make your argument. Click "I\'m Done Speaking" when finished or wait for the timer.');
        
        // Start Player 1's timer
        this.startPlayerTimer();
    }
    
    startPlayerTimer() {
        this.timerSeconds = 30;
        this.updateTimerDisplay();
        
        // Clear any existing timer
        if (this.duelTimer) {
            clearInterval(this.duelTimer);
        }
        
        // Start countdown
        this.duelTimer = setInterval(() => {
            this.timerSeconds--;
            this.updateTimerDisplay();
            
            if (this.timerSeconds <= 0) {
                clearInterval(this.duelTimer);
                this.onTimerComplete();
            }
        }, 1000);
    }
    
    updateTimerDisplay() {
        this.elements.timerDisplay.textContent = this.timerSeconds;
        
        // Update progress bar
        const progress = (this.timerSeconds / 30) * 100;
        this.elements.timerProgressBar.style.width = `${progress}%`;
        
        // Add warning class when under 10 seconds
        if (this.timerSeconds <= 10) {
            this.elements.timerDisplay.classList.add('warning');
            this.elements.timerProgressBar.classList.add('warning');
        } else {
            this.elements.timerDisplay.classList.remove('warning');
            this.elements.timerProgressBar.classList.remove('warning');
        }
    }
    
    updateDuelUI() {
        // Update player badges
        this.elements.player1Badge.classList.remove('active');
        this.elements.player2Badge.classList.remove('active');
        
        if (this.currentPlayer === 1) {
            this.elements.player1Badge.classList.add('active');
            this.elements.currentPlayerText.textContent = '🔵 Player 1 is speaking...';
        } else if (this.currentPlayer === 2) {
            this.elements.player2Badge.classList.add('active');
            this.elements.currentPlayerText.textContent = '🔴 Player 2 is speaking...';
        } else {
            this.elements.currentPlayerText.textContent = 'Waiting for verdict...';
        }
    }
    
    onTimerComplete() {
        console.log('⏰ Timer complete for Player', this.currentPlayer);
        this.onPlayerTurnDone();
    }
    
    onPlayerTurnDone() {
        if (!this.isDuelMode) return;
        
        // Stop timer
        if (this.duelTimer) {
            clearInterval(this.duelTimer);
            this.duelTimer = null;
        }
        
        // Clear audio queue
        this.clearAudioQueue();
        this.currentTurnId++;
        
        if (this.duelPhase === 'player1') {
            // Player 1 finished, switch to Player 2
            this.duelPhase = 'player2';
            this.currentPlayer = 2;
            
            this.addChatMessage('system', '⏰ Player 1\'s time is up! Waiting for AI to announce Player 2...');
            
            // Notify AI with EXACT trigger phrase - wait before starting timer
            this.sendTextMessage('TRANSITION: Player 1 finished, announce Player 2');
            
            // Update UI and start Player 2's timer after AI response
            this.updateDuelUI();
            setTimeout(() => this.startPlayerTimer(), 4000); // Give 4 seconds for AI announcement
            
        } else if (this.duelPhase === 'player2') {
            // Player 2 finished, request verdict
            this.duelPhase = 'verdict';
            this.currentPlayer = 0;
            
            this.addChatMessage('system', '⏰ Player 2\'s time is up! The judge is deliberating...');
            
            // Hide the done button during verdict
            this.elements.myTurnDoneBtn.style.display = 'none';
            this.updateDuelUI();
            
            // Request verdict from AI
            this.requestVerdict();
        }
    }
    
    requestVerdict() {
        console.log('⚖️ Requesting verdict from AI judge...');
        
        const verdictRequest = {
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text: 'VERDICT: Deliver your judgment. For EACH player, give scores out of 10 for: argument strength, persuasiveness, delivery, and rebuttals. Then explain IN DETAIL why you chose the winner - what specific arguments, moments, or techniques made the difference. Be thorough in your reasoning.' }]
                }],
                turnComplete: true
            }
        };
        
        if (this.session && this.session.readyState === WebSocket.OPEN) {
            this.session.send(JSON.stringify(verdictRequest));
        }
    }
    
    sendTextMessage(text) {
        const message = {
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                turnComplete: true
            }
        };
        
        if (this.session && this.session.readyState === WebSocket.OPEN) {
            this.session.send(JSON.stringify(message));
        }
    }
    
    resetDuelState() {
        this.isDuelMode = false;
        this.currentPlayer = 0;
        this.duelPhase = 'waiting';
        if (this.duelTimer) {
            clearInterval(this.duelTimer);
            this.duelTimer = null;
        }
        this.elements.duelControls.style.display = 'none';
        this.elements.myTurnDoneBtn.style.display = 'none';
    }
    
    // ============================================
    // Utility Functions
    // ============================================
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

// ============================================
// Initialize Application
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    window.debateAI = new DebateAI();
});
