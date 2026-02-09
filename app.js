/* ============================================
   CLARITY — AI Chief of Staff
   Application Logic + Gemini 3 API Integration
   ============================================ */

const GEMINI_API_KEY = 'AIzaSyC6mfs0Sny9M5WcFKBTSZKUPdKjJGc7MC8';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_API_URL_V3 = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// ============================================
// STATE
// ============================================
const state = {
    uploadedFiles: [],        // { file, base64, mimeType, name }
    analysisResult: null,
    chatHistory: [],
    crossrefFiles: { a: null, b: null },
    documentContext: '',      // accumulated context from all analyses
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initUploadZone();
    initAnalyzeButton();
    initTranslateTab();
    initCrossRefTab();
    initChatTab();
});

// ============================================
// TAB NAVIGATION
// ============================================
function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${tabId}`).classList.add('active');
        });
    });
}

// ============================================
// FILE UPLOAD
// ============================================
function initUploadZone() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', (e) => handleFiles(e.target.files));
}

async function handleFiles(fileList) {
    const files = Array.from(fileList);
    for (const file of files) {
        const base64 = await fileToBase64(file);
        state.uploadedFiles.push({
            file,
            base64,
            mimeType: file.type || 'application/octet-stream',
            name: file.name
        });
    }
    renderFilesList();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderFilesList() {
    const preview = document.getElementById('files-preview');
    const list = document.getElementById('files-list');

    if (state.uploadedFiles.length === 0) {
        preview.style.display = 'none';
        return;
    }

    preview.style.display = 'block';
    list.innerHTML = state.uploadedFiles.map((f, i) => `
        <div class="file-chip">
            <span class="file-icon">📄</span>
            <span>${f.name}</span>
            <span class="file-size">${formatFileSize(f.file.size)}</span>
            <button class="file-remove" onclick="removeFile(${i})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    `).join('');
}

function removeFile(index) {
    state.uploadedFiles.splice(index, 1);
    renderFilesList();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================
// ANALYZE
// ============================================
function initAnalyzeButton() {
    document.getElementById('btn-analyze').addEventListener('click', runAnalysis);
}

async function runAnalysis() {
    if (state.uploadedFiles.length === 0) {
        showToast('Please upload at least one file first.', 'error');
        return;
    }

    showLoading('loading-analyze', true);
    document.getElementById('analysis-results').style.display = 'none';

    try {
        const parts = [];

        // Add system prompt
        parts.push({
            text: `You are Clarity, an AI Chief of Staff powered by Gemini 3. You are analyzing corporate documents to extract actionable intelligence.

Analyze the uploaded document(s) and return a JSON response with exactly these 6 sections. Each section should have a "title", "icon" (emoji), "iconClass" (one of: summary, risks, actions, insights, questions, data), and "content" (array of strings, each a concise bullet point).

The 6 sections:
1. Executive Summary (icon: 📊, iconClass: summary) - 3-5 key takeaway bullets
2. Risks & Red Flags (icon: ⚠️, iconClass: risks) - Any risks, concerns, or red flags
3. Action Items (icon: ✅, iconClass: actions) - Specific actionable next steps
4. Key Insights (icon: 💡, iconClass: insights) - Non-obvious insights and patterns
5. Open Questions (icon: ❓, iconClass: questions) - Things that need clarification
6. Key Data Points (icon: 📈, iconClass: data) - Important numbers, dates, metrics

Return ONLY valid JSON, no markdown formatting, no code blocks. Format:
{"sections": [{"title": "...", "icon": "...", "iconClass": "...", "content": ["...", "..."]}]}`
        });

        // Add file contents
        for (const f of state.uploadedFiles) {
            if (f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf') {
                parts.push({
                    inlineData: {
                        mimeType: f.mimeType,
                        data: f.base64
                    }
                });
            } else {
                // For text files, decode and send as text
                const textContent = atob(f.base64);
                parts.push({ text: `\n\n--- FILE: ${f.name} ---\n${textContent}` });
            }
        }

        const response = await callGeminiAPI(parts);
        const analysisData = parseJSONResponse(response);

        state.analysisResult = analysisData;
        state.documentContext = response; // Store for chat context
        renderAnalysisResults(analysisData);

    } catch (error) {
        console.error('Analysis error:', error);
        showToast('Analysis failed: ' + error.message, 'error');
    } finally {
        showLoading('loading-analyze', false);
    }
}

function renderAnalysisResults(data) {
    const container = document.getElementById('analysis-results');
    const grid = document.getElementById('results-grid');
    const meta = document.getElementById('results-meta');

    container.style.display = 'block';

    meta.textContent = `Analyzed ${state.uploadedFiles.length} file(s) · ${new Date().toLocaleTimeString()}`;

    if (data && data.sections) {
        grid.innerHTML = data.sections.map((section, i) => `
            <div class="result-card" style="animation-delay: ${i * 0.1}s">
                <div class="result-card-header">
                    <div class="result-card-icon ${section.iconClass}">${section.icon}</div>
                    <div class="result-card-title">${section.title}</div>
                </div>
                <div class="result-card-content">
                    <ul>${section.content.map(item => `<li>${item}</li>`).join('')}</ul>
                </div>
            </div>
        `).join('');
    } else {
        // Fallback: display raw text
        grid.innerHTML = `
            <div class="result-card full-width">
                <div class="result-card-header">
                    <div class="result-card-icon summary">📊</div>
                    <div class="result-card-title">Analysis</div>
                </div>
                <div class="result-card-content">
                    <p>${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}</p>
                </div>
            </div>
        `;
    }

    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// AUDIENCE TRANSLATOR
// ============================================
function initTranslateTab() {
    const textarea = document.getElementById('translate-input');
    const charCount = document.getElementById('char-count');

    textarea.addEventListener('input', () => {
        charCount.textContent = textarea.value.length + ' chars';
    });

    // Audience chips
    document.querySelectorAll('.audience-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('selected');
        });
    });

    document.getElementById('btn-translate').addEventListener('click', runTranslate);
}

async function runTranslate() {
    const input = document.getElementById('translate-input').value.trim();
    if (!input) {
        showToast('Please paste some content to translate.', 'error');
        return;
    }

    const selectedAudiences = Array.from(document.querySelectorAll('.audience-chip.selected'))
        .map(c => c.dataset.audience);

    if (selectedAudiences.length === 0) {
        showToast('Please select at least one target audience.', 'error');
        return;
    }

    showLoading('loading-translate', true);
    document.getElementById('translate-results').style.display = 'none';

    const audienceLabels = {
        'csuite': { label: 'C-Suite Executives', icon: '👔', desc: 'Strategic, concise, focused on business impact and ROI' },
        'engineering': { label: 'Engineering Team', icon: '⚙️', desc: 'Technical details, implementation specifics, system implications' },
        'legal': { label: 'Legal Department', icon: '⚖️', desc: 'Compliance, risk, liability, contractual implications' },
        'clients': { label: 'External Clients', icon: '🤝', desc: 'Clear, professional, no internal jargon, benefit-focused' },
        'hr': { label: 'Human Resources', icon: '💼', desc: 'People impact, policy implications, organizational changes' },
        'marketing': { label: 'Marketing Team', icon: '📢', desc: 'Market positioning, messaging opportunities, brand implications' }
    };

    try {
        const audienceList = selectedAudiences.map(a =>
            `- ${audienceLabels[a].label}: ${audienceLabels[a].desc}`
        ).join('\n');

        const prompt = `You are Clarity, an AI Chief of Staff. You specialize in translating corporate communications for different audiences.

Given the following content, rewrite it tailored for EACH of these audiences:
${audienceList}

CRITICAL RULES:
- Same facts, different framing for each audience
- Adjust vocabulary, detail level, and emphasis
- Highlight what matters MOST to each audience
- Keep each version concise but complete

Content to translate:
"""
${input}
"""

Return ONLY valid JSON (no markdown, no code blocks):
{"translations": [{"audience": "audience_key", "label": "Audience Label", "icon": "emoji", "content": "translated version here"}]}`;

        const response = await callGeminiAPI([{ text: prompt }]);
        const data = parseJSONResponse(response);
        renderTranslateResults(data);

    } catch (error) {
        console.error('Translation error:', error);
        showToast('Translation failed: ' + error.message, 'error');
    } finally {
        showLoading('loading-translate', false);
    }
}

function renderTranslateResults(data) {
    const container = document.getElementById('translate-results');
    container.style.display = 'grid';

    if (data && data.translations) {
        container.innerHTML = data.translations.map((t, i) => `
            <div class="translate-card" style="animation-delay: ${i * 0.15}s">
                <div class="translate-card-header">
                    <span class="chip-icon">${t.icon}</span>
                    ${t.label}
                </div>
                <div class="translate-card-body">${t.content}</div>
            </div>
        `).join('');
    } else {
        container.innerHTML = `
            <div class="translate-card">
                <div class="translate-card-header">📝 Translation</div>
                <div class="translate-card-body">${typeof data === 'string' ? data : JSON.stringify(data)}</div>
            </div>
        `;
    }
}

// ============================================
// CROSS-DOCUMENT INTEL
// ============================================
function initCrossRefTab() {
    document.querySelectorAll('.crossref-zone').forEach(zone => {
        const input = zone.querySelector('.crossref-input');
        const slot = input?.dataset.slot;
        if (!input || !slot) return;

        zone.querySelector('.crossref-zone-inner').addEventListener('click', () => input.click());
        zone.querySelector('.crossref-zone-inner').addEventListener('dragover', (e) => e.preventDefault());
        zone.querySelector('.crossref-zone-inner').addEventListener('drop', (e) => {
            e.preventDefault();
            handleCrossRefFile(slot, e.dataTransfer.files[0]);
        });
        input.addEventListener('change', (e) => {
            if (e.target.files[0]) handleCrossRefFile(slot, e.target.files[0]);
        });
    });

    document.getElementById('btn-crossref').addEventListener('click', runCrossRef);
}

async function handleCrossRefFile(slot, file) {
    const base64 = await fileToBase64(file);
    state.crossrefFiles[slot] = {
        file,
        base64,
        mimeType: file.type || 'application/octet-stream',
        name: file.name
    };

    const zone = document.getElementById(`crossref-zone-${slot}`);
    zone.classList.add('has-file');
    document.getElementById(`crossref-name-${slot}`).textContent = file.name;

    // Enable button if both uploaded
    if (state.crossrefFiles.a && state.crossrefFiles.b) {
        document.getElementById('btn-crossref').disabled = false;
    }
}

async function runCrossRef() {
    if (!state.crossrefFiles.a || !state.crossrefFiles.b) {
        showToast('Please upload both documents.', 'error');
        return;
    }

    showLoading('loading-crossref', true);
    document.getElementById('crossref-results').style.display = 'none';

    try {
        const parts = [];

        parts.push({
            text: `You are Clarity, an AI Chief of Staff. You specialize in cross-document intelligence analysis.

You are given TWO documents (Document A: "${state.crossrefFiles.a.name}" and Document B: "${state.crossrefFiles.b.name}"). Perform a deep cross-reference analysis.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "sections": [
    {"title": "Contradictions & Conflicts", "icon": "⚔️", "content": "detailed findings"},
    {"title": "Gaps & Missing Information", "icon": "🕳️", "content": "what one doc covers that the other doesn't"},
    {"title": "Connected Insights", "icon": "🔗", "content": "how the documents relate and reinforce each other"},
    {"title": "Hidden Risks", "icon": "🚨", "content": "risks revealed by reading both together"},
    {"title": "Recommended Actions", "icon": "🎯", "content": "what to do based on the cross-analysis"},
    {"title": "Summary Verdict", "icon": "⚖️", "content": "overall assessment of alignment between documents"}
  ]
}`
        });

        // Add Document A
        const a = state.crossrefFiles.a;
        if (a.mimeType.startsWith('image/') || a.mimeType === 'application/pdf') {
            parts.push({ text: '\n--- DOCUMENT A ---\n' });
            parts.push({ inlineData: { mimeType: a.mimeType, data: a.base64 } });
        } else {
            parts.push({ text: `\n--- DOCUMENT A: ${a.name} ---\n${atob(a.base64)}` });
        }

        // Add Document B
        const b = state.crossrefFiles.b;
        if (b.mimeType.startsWith('image/') || b.mimeType === 'application/pdf') {
            parts.push({ text: '\n--- DOCUMENT B ---\n' });
            parts.push({ inlineData: { mimeType: b.mimeType, data: b.base64 } });
        } else {
            parts.push({ text: `\n--- DOCUMENT B: ${b.name} ---\n${atob(b.base64)}` });
        }

        const response = await callGeminiAPI(parts);
        const data = parseJSONResponse(response);
        renderCrossRefResults(data);
        state.documentContext += '\n\nCross-reference analysis:\n' + response;

    } catch (error) {
        console.error('Cross-ref error:', error);
        showToast('Cross-reference analysis failed: ' + error.message, 'error');
    } finally {
        showLoading('loading-crossref', false);
    }
}

function renderCrossRefResults(data) {
    const container = document.getElementById('crossref-results');
    container.style.display = 'block';

    if (data && data.sections) {
        container.innerHTML = data.sections.map((section, i) => `
            <div class="crossref-section" style="animation-delay: ${i * 0.12}s">
                <div class="crossref-section-header">
                    <span class="icon">${section.icon}</span>
                    ${section.title}
                </div>
                <div class="crossref-section-content">${section.content}</div>
            </div>
        `).join('');
    } else {
        container.innerHTML = `
            <div class="crossref-section">
                <div class="crossref-section-header">
                    <span class="icon">📊</span>
                    Analysis
                </div>
                <div class="crossref-section-content">${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}</div>
            </div>
        `;
    }
}

// ============================================
// CHAT
// ============================================
function initChatTab() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-chat-send');

    sendBtn.addEventListener('click', () => sendChatMessage());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
}

function askSuggestion(btn) {
    document.getElementById('chat-input').value = btn.textContent;
    sendChatMessage();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    input.style.height = 'auto';

    // Remove welcome screen
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    // Add user message
    appendChatMessage('user', message);
    state.chatHistory.push({ role: 'user', parts: [{ text: message }] });

    // Show typing indicator
    const typingId = appendChatMessage('assistant', '<div class="loading-spinner" style="width:24px;height:24px;margin:0;"></div>');

    try {
        // Build context-aware prompt
        const systemPrompt = `You are Clarity, an AI Chief of Staff powered by Gemini 3. You help corporate professionals make sense of their documents and communications.

You have context from previously analyzed documents:
${state.documentContext || '(No documents uploaded yet. You can still answer general questions about corporate productivity, communication, and document analysis.)'}

Be concise, actionable, and insightful. Use bullet points and bold text when helpful. Always focus on actionable intelligence.`;

        const contents = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I am Clarity, your AI Chief of Staff. I have context from your documents and I\'m ready to provide actionable intelligence. How can I help?' }] },
            ...state.chatHistory
        ];

        const response = await callGeminiAPIChat(contents);

        // Remove typing indicator & add response
        removeChatMessage(typingId);
        appendChatMessage('assistant', formatChatResponse(response));
        state.chatHistory.push({ role: 'model', parts: [{ text: response }] });

    } catch (error) {
        console.error('Chat error:', error);
        removeChatMessage(typingId);
        appendChatMessage('assistant', 'I encountered an error. Please try again.');
    }
}

let messageIdCounter = 0;
function appendChatMessage(role, content) {
    const container = document.getElementById('chat-messages');
    const id = 'msg-' + (++messageIdCounter);

    const avatar = role === 'assistant' ? 'C' : 'You';
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    div.id = id;
    div.innerHTML = `
        <div class="chat-avatar">${avatar}</div>
        <div class="chat-bubble">${content}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeChatMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function formatChatResponse(text) {
    // Basic markdown-to-HTML
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)/gm, '<li>$1</li>')
        .replace(/^(\d+)\. (.*)/gm, '<li>$2</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap orphan LIs in UL
    html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');

    return '<p>' + html + '</p>';
}

// ============================================
// GEMINI API
// ============================================
async function callGeminiAPI(parts) {
    // Try Gemini 3 first, then fallback to Gemini 2
    const urls = [GEMINI_API_URL_V3, GEMINI_API_URL];
    let lastError = null;

    for (const url of urls) {
        try {
            const response = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4096,
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                lastError = new Error(errData?.error?.message || `API error ${response.status}`);
                console.warn(`Model failed, trying next...`, lastError.message);
                continue;
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (e) {
            lastError = e;
            continue;
        }
    }
    throw lastError || new Error('All models failed');
}

async function callGeminiAPIChat(contents) {
    // Try Gemini 3 first, then fallback to Gemini 2
    const urls = [GEMINI_API_URL_V3, GEMINI_API_URL];
    let lastError = null;

    for (const url of urls) {
        try {
            const response = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                lastError = new Error(errData?.error?.message || `API error ${response.status}`);
                console.warn(`Model failed, trying next...`, lastError.message);
                continue;
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (e) {
            lastError = e;
            continue;
        }
    }
    throw lastError || new Error('All models failed');
}

function parseJSONResponse(text) {
    // Try direct parse first
    try {
        return JSON.parse(text);
    } catch (e) { }

    // Try extracting JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[1].trim());
        } catch (e) { }
    }

    // Try finding JSON in the text
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
        try {
            return JSON.parse(braceMatch[0]);
        } catch (e) { }
    }

    // Return raw text as fallback
    return text;
}

// ============================================
// UTILITIES
// ============================================
function showLoading(id, show) {
    document.getElementById(id).style.display = show ? 'block' : 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
