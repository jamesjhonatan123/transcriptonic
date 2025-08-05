// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlForm = document.querySelector("#webhook-url-form")
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")
    const simpleWebhookBodyRadio = document.querySelector("#simple-webhook-body")
    const advancedWebhookBodyRadio = document.querySelector("#advanced-webhook-body")
    const recoverLastMeetingButton = document.querySelector("#recover-last-meeting")

    // Initial load of transcripts
    loadMeetings()

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadMeetings()
        }
    })

    if (recoverLastMeetingButton instanceof HTMLButtonElement) {
        recoverLastMeetingButton.addEventListener("click", function () {
            /** @type {ExtensionMessage} */
            const message = {
                type: "recover_last_meeting",
            }
            chrome.runtime.sendMessage(message, function (responseUntyped) {
                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                loadMeetings()
                scrollTo({ top: 0, behavior: "smooth" })
                if (response.success) {
                    if (response.message === "No recovery needed") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Last meeting recovered successfully!")
                    }
                }
                else {
                    if (response.message === "No meetings found. May be attend one?") {
                        alert(response.message)
                    }
                    else if (response.message === "Empty transcript and empty chatMessages") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Could not recover last meeting!")
                        console.error(response.message)
                    }
                }
            })
        })
    }

    if (saveButton instanceof HTMLButtonElement && webhookUrlForm instanceof HTMLFormElement && webhookUrlInput instanceof HTMLInputElement && autoPostCheckbox instanceof HTMLInputElement && simpleWebhookBodyRadio instanceof HTMLInputElement && advancedWebhookBodyRadio instanceof HTMLInputElement) {
        // Initially disable the save button
        saveButton.disabled = true

        // Load saved webhook URL, auto-post setting, and webhook body type
        chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "webhookBodyType"], function (resultSyncUntyped) {
            const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

            if (resultSync.webhookUrl) {
                webhookUrlInput.value = resultSync.webhookUrl
                saveButton.disabled = !webhookUrlInput.checkValidity()
            }
            // Set checkbox state, default to true if not set
            autoPostCheckbox.checked = resultSync.autoPostWebhookAfterMeeting !== false
            // Set radio button state, default to simple if not set
            if (resultSync.webhookBodyType === "advanced") {
                advancedWebhookBodyRadio.checked = true
            } else {
                simpleWebhookBodyRadio.checked = true
            }
        })

        // Handle URL input changes
        webhookUrlInput.addEventListener("input", function () {
            saveButton.disabled = !webhookUrlInput.value || !webhookUrlInput.checkValidity()
        })

        // Save webhook URL, auto-post setting, and webhook body type
        webhookUrlForm.addEventListener("submit", function (e) {
            e.preventDefault()
            const webhookUrl = webhookUrlInput.value
            if (webhookUrl && webhookUrlInput.checkValidity()) {
                // Request runtime permission for the webhook URL
                requestWebhookAndNotificationPermission(webhookUrl).then(() => {
                    // Save webhook URL and settings
                    chrome.storage.sync.set({
                        webhookUrl: webhookUrl,
                        autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
                        webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple"
                    }, function () {
                        alert("Webhook URL saved!")
                    })
                }).catch((error) => {
                    alert("Fine! No webhooks for you!")
                    console.error("Webhook permission error:", error)
                })
            }
        })

        // Auto save auto-post setting
        autoPostCheckbox.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({
                autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
            }, function () { })
        })

        // Auto save webhook body type
        simpleWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: "simple" }, function () { })
        })

        // Auto save webhook body type
        advancedWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple" }, function () { })
        })
    }
})


// Request runtime permission for webhook URL
/**
 * @param {string} url
 */
function requestWebhookAndNotificationPermission(url) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url)
            const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

            // Request both host and notifications permissions
            chrome.permissions.request({
                origins: [originPattern],
                permissions: ["notifications"]
            }).then((granted) => {
                if (granted) {
                    resolve("Permission granted")
                } else {
                    reject(new Error("Permission denied"))
                }
            }).catch((error) => {
                reject(error)
            })
        } catch (error) {
            reject(error)
        }
    })
}

// Load and display recent transcripts
function loadMeetings() {
    const meetingsTable = document.querySelector("#transcripts-table")

    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
        // Clear existing content
        if (meetingsTable) {
            meetingsTable.innerHTML = ""


            if (resultLocal.meetings && resultLocal.meetings.length > 0) {
                // Loop through the array in reverse order to list latest meeting first
                for (let i = resultLocal.meetings.length - 1; i >= 0; i--) {
                    const meeting = resultLocal.meetings[i]
                    const timestamp = new Date(meeting.meetingStartTimestamp).toLocaleString()
                    const durationString = getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp)

                    const row = document.createElement("tr")
                    row.innerHTML = `
                    <td>${meeting.meetingTitle || meeting.title || "Google Meet call"}</td>
                    <td>${timestamp} &nbsp; &#9679; &nbsp; ${durationString}</td>
                    <td>
                        ${(
                            () => {
                                switch (meeting.webhookPostStatus) {
                                    case "successful":
                                        return `<span class="status-success">Successful</span>`
                                    case "failed":
                                        return `<span class="status-failed">Failed</span>`
                                    case "new":
                                        return `<span class="status-new">New</span>`
                                    default:
                                        return `<span class="status-new">Unknown</span>`
                                }
                            }
                        )()}
                    </td>
                    <td>
                        <div style="min-width: 128px; display: flex; gap: 1rem;">
                            <button class="download-button" data-index="${i}">
                                <img src="./icons/download.svg" alt="Download this meeting transcript">
                            </button>
                            <button class="post-button" data-index="${i}">
                                ${meeting.webhookPostStatus === "new" ? `Post` : `Repost`}
                                <img src="./icons/webhook.svg" alt="" width="16px">
                            </button>
                        </div>
                    </td>
                `
                    meetingsTable.appendChild(row)

                    // Add event listener to the webhook post button
                    const downloadButton = row.querySelector(".download-button")
                    if (downloadButton instanceof HTMLButtonElement) {
                        downloadButton.addEventListener("click", function () {
                            // Send message to background script to download text file
                            const index = parseInt(downloadButton.getAttribute("data-index") ?? "-1")
                            /** @type {ExtensionMessage} */
                            const message = {
                                type: "download_transcript_at_index",
                                index: index
                            }
                            chrome.runtime.sendMessage(message, (responseUntyped) => {
                                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                loadMeetings()
                                if (!response.success) {
                                    alert("Could not download transcript")
                                }
                            })
                        })
                    }

                    // Add event listener to the webhook post button
                    const webhookPostButton = row.querySelector(".post-button")
                    if (webhookPostButton instanceof HTMLButtonElement) {
                        webhookPostButton.addEventListener("click", function () {
                            chrome.storage.sync.get(["webhookUrl"], function (resultSyncUntyped) {
                                const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                                if (resultSync.webhookUrl) {
                                    // Request runtime permission for the webhook URL. Needed for cases when user signs on a new browser—webhook URL and other sync variables are available, but runtime permissions will be missing.
                                    requestWebhookAndNotificationPermission(resultSync.webhookUrl).then(() => {
                                        // Disable button and update text
                                        webhookPostButton.disabled = true
                                        webhookPostButton.textContent = meeting.webhookPostStatus === "new" ? "Posting..." : "Reposting..."

                                        // Send message to background script to post webhook
                                        const index = parseInt(webhookPostButton.getAttribute("data-index") ?? "-1")
                                        /** @type {ExtensionMessage} */
                                        const message = {
                                            type: "retry_webhook_at_index",
                                            index: index
                                        }
                                        chrome.runtime.sendMessage(message, (responseUntyped) => {
                                            const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                            loadMeetings()
                                            if (response.success) {
                                                alert("Posted successfully!")
                                            }
                                            else {
                                                console.error(response.message)
                                            }
                                        })
                                    }).catch((error) => {
                                        alert("Fine! No webhooks for you!")
                                        console.error("Webhook permission error:", error)
                                    })
                                }
                                else {
                                    alert("Please provide a webhook URL")
                                }
                            })
                        })
                    }
                }
            }
            else {
                meetingsTable.innerHTML = `<tr><td colspan="4">Your next meeting will show up here</td></tr>`
            }
        }
    })
}

// Format duration between two timestamps, specified in milliseconds elapsed since the epoch
/**
 * @param {string} meetingStartTimestamp - ISO timestamp
 * @param {string} meetingEndTimestamp - ISO timestamp
 */
function getDuration(meetingStartTimestamp, meetingEndTimestamp) {
    const duration = new Date(meetingEndTimestamp).getTime() - new Date(meetingStartTimestamp).getTime()
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}

// AI Features functionality
document.addEventListener("DOMContentLoaded", function() {
    initializeAIFeatures()
})

function initializeAIFeatures() {
    const saveTemplateBtn = document.querySelector("#save-template")
    const templateNameInput = document.querySelector("#template-name")
    const templateContentInput = document.querySelector("#template-content")
    const quickPromptBtns = document.querySelectorAll(".quick-prompt-btn")
    const executeCustomPromptBtn = document.querySelector("#execute-custom-prompt")
    const customPromptInput = document.querySelector("#custom-prompt")
    const aiResponseDiv = document.querySelector("#ai-response")
    const copyResponseBtn = document.querySelector("#copy-response")
    const generatePdfBtn = document.querySelector("#generate-pdf")

    // Load existing templates
    loadTemplates()

    // Save template functionality
    if (saveTemplateBtn && templateNameInput && templateContentInput) {
        saveTemplateBtn.addEventListener("click", function() {
            const name = templateNameInput.value.trim()
            const content = templateContentInput.value.trim()
            
            if (!name || !content) {
                alert("Please fill in both template name and content")
                return
            }

            chrome.storage.sync.get(["aiTemplates"], function(result) {
                const templates = result.aiTemplates || []
                const newTemplate = {
                    id: Date.now().toString(),
                    name: name,
                    content: content,
                    createdAt: new Date().toISOString()
                }
                
                templates.push(newTemplate)
                chrome.storage.sync.set({ aiTemplates: templates }, function() {
                    templateNameInput.value = ""
                    templateContentInput.value = ""
                    loadTemplates()
                    alert("Template saved successfully!")
                })
            })
        })
    }

    // Quick prompts functionality
    quickPromptBtns.forEach(btn => {
        btn.addEventListener("click", function() {
            const prompt = this.dataset.prompt
            executePrompt(prompt)
        })
    })

    // Custom prompt functionality
    if (executeCustomPromptBtn && customPromptInput) {
        executeCustomPromptBtn.addEventListener("click", function() {
            const prompt = customPromptInput.value.trim()
            if (!prompt) {
                alert("Please enter a custom prompt")
                return
            }
            executePrompt(prompt)
        })
    }

    // Copy response functionality
    if (copyResponseBtn && aiResponseDiv) {
        copyResponseBtn.addEventListener("click", function() {
            const text = aiResponseDiv.textContent
            if (text && text !== "AI responses will appear here...") {
                navigator.clipboard.writeText(text).then(() => {
                    copyResponseBtn.textContent = "✓ Copied!"
                    setTimeout(() => {
                        copyResponseBtn.textContent = "📋 Copy"
                    }, 2000)
                })
            }
        })
    }

    // Generate PDF functionality
    if (generatePdfBtn && aiResponseDiv) {
        generatePdfBtn.addEventListener("click", function() {
            const content = aiResponseDiv.textContent
            if (content && content !== "AI responses will appear here...") {
                generatePDF(content)
            } else {
                alert("No AI response to generate PDF from")
            }
        })
    }
}

function loadTemplates() {
    chrome.storage.sync.get(["aiTemplates"], function(result) {
        const templates = result.aiTemplates || []
        const templatesList = document.querySelector("#templates-list")
        
        if (!templatesList) return

        if (templates.length === 0) {
            templatesList.innerHTML = '<p class="sub-text">No templates saved yet</p>'
            return
        }

        templatesList.innerHTML = templates.map(template => `
            <div class="template-item">
                <div>
                    <strong>${escapeHtml(template.name)}</strong>
                    <br>
                    <span class="sub-text">Created ${new Date(template.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="template-actions">
                    <button onclick="useTemplate('${template.id}')" style="background: #2A9ACA; color: white; border: none;">Use</button>
                    <button onclick="deleteTemplate('${template.id}')" style="background: #dc3545; color: white; border: none;">Delete</button>
                </div>
            </div>
        `).join('')
    })
}

function useTemplate(templateId) {
    chrome.storage.sync.get(["aiTemplates"], function(result) {
        const templates = result.aiTemplates || []
        const template = templates.find(t => t.id === templateId)
        
        if (template) {
            // Get current meeting data to populate template
            getCurrentMeetingData().then(meetingData => {
                if (meetingData) {
                    const prompt = `Using this template: ${template.content}
                    
                    Please generate a summary using the following meeting data:
                    Meeting Title: ${meetingData.title}
                    Date: ${meetingData.date}
                    Participants: ${meetingData.participants}
                    Transcript: ${meetingData.transcript}
                    
                    Replace the placeholders {{summary}}, {{date}}, {{participants}} with appropriate content.`
                    
                    executePrompt(prompt)
                } else {
                    alert("No active meeting found. Templates work best during or right after a meeting.")
                }
            })
        }
    })
}

function deleteTemplate(templateId) {
    if (confirm("Are you sure you want to delete this template?")) {
        chrome.storage.sync.get(["aiTemplates"], function(result) {
            const templates = result.aiTemplates || []
            const updatedTemplates = templates.filter(t => t.id !== templateId)
            
            chrome.storage.sync.set({ aiTemplates: updatedTemplates }, function() {
                loadTemplates()
            })
        })
    }
}

async function executePrompt(prompt) {
    const aiResponseDiv = document.querySelector("#ai-response")
    const executeBtn = document.querySelector("#execute-custom-prompt")
    
    if (!aiResponseDiv) return

    // Check if API key is configured
    chrome.storage.sync.get(["geminiApiKey"], async function(result) {
        if (!result.geminiApiKey) {
            aiResponseDiv.textContent = "Please configure your Gemini API key in the extension popup first."
            return
        }

        try {
            aiResponseDiv.textContent = "Generating response..."
            if (executeBtn) executeBtn.disabled = true

            // Get current meeting transcript for context
            const meetingData = await getCurrentMeetingData()
            const contextualPrompt = meetingData 
                ? `Context: Current meeting transcript: ${meetingData.transcript}\n\nUser request: ${prompt}`
                : prompt

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${result.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: contextualPrompt
                        }]
                    }]
                })
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json()
            const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated"
            aiResponseDiv.textContent = aiResponse

        } catch (error) {
            console.error("AI request failed:", error)
            aiResponseDiv.textContent = `Error: ${error.message}`
        } finally {
            if (executeBtn) executeBtn.disabled = false
        }
    })
}

async function getCurrentMeetingData() {
    return new Promise((resolve) => {
        // Try to get current meeting data from the extension
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const currentTab = tabs[0]
            if (currentTab && currentTab.url && currentTab.url.includes('meet.google.com')) {
                // Get the latest meeting data
                chrome.storage.local.get(null, function(items) {
                    const meetings = Object.keys(items)
                        .filter(key => key.startsWith('meeting_'))
                        .map(key => items[key])
                        .sort((a, b) => new Date(b.meetingStartTimestamp) - new Date(a.meetingStartTimestamp))
                    
                    if (meetings.length > 0) {
                        const latestMeeting = meetings[0]
                        resolve({
                            title: latestMeeting.meetingTitle || "Current Meeting",
                            date: new Date().toLocaleDateString(),
                            participants: latestMeeting.transcript ? 
                                [...new Set(latestMeeting.transcript.map(t => t.personName))].join(", ") : 
                                "Unknown",
                            transcript: latestMeeting.transcript ? 
                                latestMeeting.transcript.map(t => `${t.personName}: ${t.transcriptText}`).join("\n") :
                                "No transcript available"
                        })
                    } else {
                        resolve(null)
                    }
                })
            } else {
                resolve(null)
            }
        })
    })
}

function generatePDF(content) {
    // Create a simple HTML document for PDF generation
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Meeting Summary - TranscripTonic</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
                h1 { color: #2A9ACA; }
                .header { border-bottom: 2px solid #2A9ACA; padding-bottom: 10px; margin-bottom: 20px; }
                .content { white-space: pre-wrap; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Meeting Summary</h1>
                <p>Generated by TranscripTonic on ${new Date().toLocaleDateString()}</p>
            </div>
            <div class="content">${escapeHtml(content)}</div>
        </body>
        </html>
    `

    // Create a blob and download it
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting-summary-${new Date().toISOString().split('T')[0]}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}