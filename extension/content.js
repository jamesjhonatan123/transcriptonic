// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />


//*********** GLOBAL VARIABLES **********//
/** @type {ExtensionStatusJSON} */
const extensionStatusJSON_bug = {
  "status": 400,
  "message": `<strong>TranscripTonic encountered a new error</strong> <br /> Please report it <a href="https://github.com/vivek-nexus/transcriptonic/issues" target="_blank">here</a>.`
}

const reportErrorMessage = "There is a bug in TranscripTonic. Please report it at https://github.com/vivek-nexus/transcriptonic/issues"
/** @type {MutationObserverInit} */
const mutationConfig = { childList: true, attributes: true, subtree: true, characterData: true }

// Name of the person attending the meeting
let userName = "You"

// Transcript array that holds one or more transcript blocks
/** @type {TranscriptBlock[]} */
let transcript = []

// Buffer variables to dump values, which get pushed to transcript array as transcript blocks, at defined conditions
let personNameBuffer = "", transcriptTextBuffer = "", timestampBuffer = ""

// Chat messages array that holds one or more chat messages of the meeting
/** @type {ChatMessage[]} */
let chatMessages = []

// Capture meeting start timestamp, stored in ISO format
let meetingStartTimestamp = new Date().toISOString()
let meetingTitle = document.title

// Capture invalid transcript and chatMessages DOM element error for the first time and silence for the rest of the meeting to prevent notification noise
let isTranscriptDomErrorCaptured = false
let isChatMessagesDomErrorCaptured = false

// Capture meeting begin to abort userName capturing interval
let hasMeetingStarted = false

// Capture meeting end to suppress any errors
let hasMeetingEnded = false

/** @type {ExtensionStatusJSON} */
let extensionStatusJSON

let canUseAriaBasedTranscriptSelector = true


//*********** AI ASSISTANT INTEGRATION **********//
let aiAssistantButton = null
let aiAssistantPanel = null

function createAIAssistant() {
    // Create floating AI assistant button
    aiAssistantButton = document.createElement('div')
    aiAssistantButton.id = 'transcriptonic-ai-assistant'
    aiAssistantButton.innerHTML = '🤖'
    aiAssistantButton.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: #2A9ACA;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        cursor: pointer;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(42, 154, 202, 0.3);
        transition: all 0.3s ease;
    `
    
    aiAssistantButton.addEventListener('click', toggleAIPanel)
    aiAssistantButton.addEventListener('mouseenter', () => {
        aiAssistantButton.style.transform = 'scale(1.1)'
    })
    aiAssistantButton.addEventListener('mouseleave', () => {
        aiAssistantButton.style.transform = 'scale(1)'
    })
    
    document.body.appendChild(aiAssistantButton)
    
    // Create AI assistant panel
    createAIPanel()
    
    // Update transcript status periodically
    setInterval(updateTranscriptStatus, 2000)
}

function createAIPanel() {
    aiAssistantPanel = document.createElement('div')
    aiAssistantPanel.id = 'transcriptonic-ai-panel'
    aiAssistantPanel.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        width: 350px;
        max-height: 500px;
        background: #071f29;
        border: 1px solid #2A9ACA;
        border-radius: 12px;
        padding: 20px;
        z-index: 10001;
        display: none;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        font-family: "SUSE", sans-serif;
        color: #C0C0C0;
    `
    
    aiAssistantPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3 style="margin: 0; color: #2A9ACA;">Assistente IA</h3>
            <button id="close-ai-panel" style="background: none; border: none; color: #C0C0C0; font-size: 18px; cursor: pointer;">✕</button>
        </div>
        
        <div id="transcript-status-indicator" style="background: rgba(42, 154, 202, 0.1); padding: 8px; border-radius: 4px; margin-bottom: 15px; font-size: 12px; font-weight: bold;">
            ⏳ Aguardando transcrição...
        </div>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold;">Ações Rápidas:</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button class="ai-quick-btn" data-prompt="Gere 5 perguntas relevantes sobre os tópicos discutidos até agora" style="padding: 8px; background: rgba(42, 154, 202, 0.1); border: 1px solid #2A9ACA; border-radius: 6px; color: #C0C0C0; font-size: 12px; cursor: pointer;">📝 Perguntas</button>
                <button class="ai-quick-btn" data-prompt="Resuma os pontos principais discutidos nesta reunião até agora" style="padding: 8px; background: rgba(42, 154, 202, 0.1); border: 1px solid #2A9ACA; border-radius: 6px; color: #C0C0C0; font-size: 12px; cursor: pointer;">📋 Resumo</button>
                <button class="ai-quick-btn" data-prompt="Liste os itens de ação e decisões tomadas nesta reunião" style="padding: 8px; background: rgba(42, 154, 202, 0.1); border: 1px solid #2A9ACA; border-radius: 6px; color: #C0C0C0; font-size: 12px; cursor: pointer;">✅ Ações</button>
                <button class="ai-quick-btn" data-prompt="Identifique os principais tópicos e temas discutidos" style="padding: 8px; background: rgba(42, 154, 202, 0.1); border: 1px solid #2A9ACA; border-radius: 6px; color: #C0C0C0; font-size: 12px; cursor: pointer;">🎯 Tópicos</button>
            </div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label for="custom-ai-prompt" style="display: block; margin-bottom: 8px; font-weight: bold;">Prompt Personalizado:</label>
            <textarea id="custom-ai-prompt" placeholder="Pergunte qualquer coisa sobre a reunião..." style="width: 100%; height: 60px; padding: 8px; border: 1px solid #a0a0a0; border-radius: 4px; background: rgba(255,255,255,0.1); color: #C0C0C0; font-family: inherit; resize: vertical;"></textarea>
            <button id="execute-ai-prompt" style="margin-top: 8px; padding: 8px 16px; background: #2A9ACA; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">Executar</button>
        </div>
        
        <div>
            <label style="display: block; margin-bottom: 8px; font-weight: bold;">Resposta:</label>
            <div id="ai-response-panel" style="min-height: 80px; max-height: 200px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 4px; border: 1px solid #a0a0a0; white-space: pre-wrap; font-size: 13px; overflow-y: auto;">
                As respostas da IA aparecerão aqui...
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button id="copy-ai-response" style="padding: 6px 12px; background: transparent; color: #2A9ACA; border: 1px solid #2A9ACA; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 Copiar</button>
                <button id="clear-ai-response" style="padding: 6px 12px; background: transparent; color: #a0a0a0; border: 1px solid #a0a0a0; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ Limpar</button>
            </div>
        </div>
    `
    
    document.body.appendChild(aiAssistantPanel)
    
    // Add event listeners
    setupAIPanelListeners()
}

function setupAIPanelListeners() {
    // Close panel
    document.getElementById('close-ai-panel')?.addEventListener('click', () => {
        aiAssistantPanel.style.display = 'none'
    })
    
    // Quick prompt buttons
    document.querySelectorAll('.ai-quick-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const prompt = this.dataset.prompt
            executeAIPromptInMeeting(prompt)
        })
    })
    
    // Custom prompt execution
    document.getElementById('execute-ai-prompt')?.addEventListener('click', () => {
        const customPrompt = document.getElementById('custom-ai-prompt')?.value.trim()
        if (customPrompt) {
            executeAIPromptInMeeting(customPrompt)
        }
    })
    
    // Copy response
    document.getElementById('copy-ai-response')?.addEventListener('click', () => {
        const responseText = document.getElementById('ai-response-panel')?.textContent
        if (responseText && responseText !== 'As respostas da IA aparecerão aqui...') {
            navigator.clipboard.writeText(responseText)
            const btn = document.getElementById('copy-ai-response')
            if (btn) {
                btn.textContent = '✓ Copiado!'
                setTimeout(() => {
                    btn.textContent = '📋 Copiar'
                }, 2000)
            }
        }
    })
    
    // Clear response
    document.getElementById('clear-ai-response')?.addEventListener('click', () => {
        const responseDiv = document.getElementById('ai-response-panel')
        if (responseDiv) {
            responseDiv.textContent = 'As respostas da IA aparecerão aqui...'
        }
        const customPrompt = document.getElementById('custom-ai-prompt')
        if (customPrompt) {
            customPrompt.value = ''
        }
    })
}

function toggleAIPanel() {
    if (aiAssistantPanel) {
        aiAssistantPanel.style.display = aiAssistantPanel.style.display === 'none' ? 'block' : 'none'
        // Update status when panel is opened
        if (aiAssistantPanel.style.display === 'block') {
            updateTranscriptStatus()
        }
    }
}

function updateTranscriptStatus() {
    const statusDiv = document.getElementById('transcript-status-indicator')
    if (!statusDiv) return
    
    const transcriptLength = transcript.length
    const isActiveTranscript = transcriptTextBuffer.length > 0
    const lastActivity = transcriptLength > 0 ? new Date(transcript[transcript.length - 1].timestamp) : null
    
    let statusMessage = ''
    let statusColor = '#a0a0a0'
    
    if (isActiveTranscript) {
        statusMessage = `🟢 Transcrevendo ao vivo... (${transcriptLength} blocos)`
        statusColor = '#28a745'
    } else if (transcriptLength > 0) {
        const timeSinceLastActivity = lastActivity ? Math.floor((Date.now() - lastActivity.getTime()) / 1000) : 0
        if (timeSinceLastActivity < 30) {
            statusMessage = `🟡 Transcrição pausada (${transcriptLength} blocos)`
            statusColor = '#ffc107'
        } else {
            statusMessage = `📝 ${transcriptLength} blocos capturados`
            statusColor = '#2A9ACA'
        }
    } else {
        statusMessage = '⏳ Aguardando transcrição...'
        statusColor = '#a0a0a0'
    }
    
    statusDiv.innerHTML = statusMessage
    statusDiv.style.color = statusColor
}

async function executeAIPromptInMeeting(prompt) {
    const responseDiv = document.getElementById('ai-response-panel')
    const executeBtn = document.getElementById('execute-ai-prompt')
    
    if (!responseDiv) return
    
    // Get API key from storage
    chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], async function(result) {
        if (!result.geminiApiKey) {
            responseDiv.textContent = 'Por favor, configure sua chave da API Gemini no popup da extensão primeiro.'
            return
        }
        
        const model = result.geminiModel || 'gemini-2.5-flash'
        
        try {
            responseDiv.textContent = 'Gerando resposta...'
            if (executeBtn) executeBtn.disabled = true
            
            // Get current meeting context
            const currentTranscript = transcript.map(t => `${t.personName}: ${t.transcriptText}`).join('\n')
            
            // Show context status to user
            const contextStatus = currentTranscript 
                ? `📝 Contexto disponível: ${transcript.length} blocos de transcrição`
                : '⚠️ Nenhuma transcrição disponível ainda'
            
            responseDiv.innerHTML = `
                <div style="background: rgba(42, 154, 202, 0.1); padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
                    ${contextStatus}
                </div>
                <div>Gerando resposta...</div>
            `
            
            const contextualPrompt = currentTranscript 
                ? `Contexto: Transcrição atual da reunião:\n${currentTranscript}\n\nSolicitação do usuário: ${prompt}`
                : `Solicitação do usuário: ${prompt}\n\nNota: Ainda não há transcrição disponível para esta reunião.`
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${result.geminiApiKey}`, {
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
            const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Nenhuma resposta gerada'
            
            // Show context status and response
            responseDiv.innerHTML = `
                <div style="background: rgba(42, 154, 202, 0.1); padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
                    ${contextStatus}
                </div>
                <div style="white-space: pre-wrap;">${aiResponse}</div>
            `
            
        } catch (error) {
            console.error('Falha na requisição AI:', error)
            responseDiv.textContent = `Erro: ${error.message}`
        } finally {
            if (executeBtn) executeBtn.disabled = false
        }
    })
}










// Attempt to recover last meeting, if any. Abort if it takes more than 2 seconds to prevent current meeting getting messed up.
Promise.race([
  recoverLastMeeting(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Recovery timed out')), 2000)
  )
]).
  catch((error) => {
    console.error(error)
  }).
  finally(() => {
    // Save current meeting data to chrome storage once recovery is complete or is aborted
    overWriteChromeStorage(["meetingStartTimestamp", "meetingTitle", "transcript", "chatMessages"], false)
  })




//*********** MAIN FUNCTIONS **********//
checkExtensionStatus().finally(() => {
  // Read the status JSON
  chrome.storage.local.get(["extensionStatusJSON"], function (resultLocalUntyped) {
    const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
    extensionStatusJSON = resultLocal.extensionStatusJSON
    console.log("Extension status " + extensionStatusJSON.status)

    // Enable extension functions only if status is 200
    if (extensionStatusJSON.status === 200) {
      // NON CRITICAL DOM DEPENDENCY. Attempt to get username before meeting starts. Abort interval if valid username is found or if meeting starts and default to "You".
      waitForElement(".awLEm").then(() => {
        // Poll the element until the textContent loads from network or until meeting starts
        const captureUserNameInterval = setInterval(() => {
          if (!hasMeetingStarted) {
            const capturedUserName = document.querySelector(".awLEm")?.textContent
            if (capturedUserName) {
              userName = capturedUserName
              clearInterval(captureUserNameInterval)
            }
          }
          else {
            clearInterval(captureUserNameInterval)
          }
        }, 100)
      })

      // 1. Meet UI prior to July/Aug 2024
      // meetingRoutines(1)

      // 2. Meet UI post July/Aug 2024
      meetingRoutines(2)
    }
    else {
      // Show downtime message as extension status is 400
      showNotification(extensionStatusJSON)
    }
  })
})


/**
 * @param {number} uiType
 */
function meetingRoutines(uiType) {
  const meetingEndIconData = {
    selector: "",
    text: ""
  }
  const captionsIconData = {
    selector: "",
    text: ""
  }
  // Different selector data for different UI versions
  switch (uiType) {
    case 1:
      meetingEndIconData.selector = ".google-material-icons"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".material-icons-extended"
      captionsIconData.text = "closed_caption_off"
      break
    case 2:
      meetingEndIconData.selector = ".google-symbols"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".google-symbols"
      captionsIconData.text = "closed_caption_off"
    default:
      break
  }

  // CRITICAL DOM DEPENDENCY. Wait until the meeting end icon appears, used to detect meeting start
  waitForElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
    console.log("Meeting started")
    /** @type {ExtensionMessage} */
    const message = {
      type: "new_meeting_started"
    }
    chrome.runtime.sendMessage(message, function () { })
    hasMeetingStarted = true


    //*********** MEETING START ROUTINES **********//
    // Initialize AI Assistant
    chrome.storage.sync.get(['geminiApiKey'], function(result) {
      createAIAssistant()
      // Show initial status based on API key availability
      setTimeout(() => {
        if (!result.geminiApiKey) {
          const statusDiv = document.getElementById('transcript-status-indicator')
          if (statusDiv) {
            statusDiv.innerHTML = '🔑 Configure sua chave da API Gemini no popup da extensão para usar recursos de IA'
            statusDiv.style.color = '#ffc107'
            statusDiv.style.background = 'rgba(255, 193, 7, 0.1)'
          }
        }
      }, 1000)
    })
    
    // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
    setTimeout(() => updateMeetingTitle(), 5000)

    /** @type {MutationObserver} */
    let transcriptObserver
    /** @type {MutationObserver} */
    let chatMessagesObserver

    // **** REGISTER TRANSCRIPT LISTENER **** //
    try {
      // CRITICAL DOM DEPENDENCY
      const captionsButton = selectElements(captionsIconData.selector, captionsIconData.text)[0]

      // Click captions icon for non manual operation modes. Async operation.
      chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
        if (resultSync.operationMode === "manual")
          console.log("Manual mode selected, leaving transcript off")
        else
          captionsButton.click()
      })

      // CRITICAL DOM DEPENDENCY. Grab the transcript element. This element is present, irrespective of captions ON/OFF, so this executes independent of operation mode.
      let transcriptTargetNode = document.querySelector(`div[role="region"][tabindex="0"]`)
      // For old captions UI
      if (!transcriptTargetNode) {
        transcriptTargetNode = document.querySelector(".a4cQT")
        canUseAriaBasedTranscriptSelector = false
      }

      if (transcriptTargetNode) {
        // Attempt to dim down the transcript
        canUseAriaBasedTranscriptSelector
          ? transcriptTargetNode.setAttribute("style", "opacity:0.2")
          : transcriptTargetNode.children[1].setAttribute("style", "opacity:0.2")

        // Create transcript observer instance linked to the callback function. Registered irrespective of operation mode, so that any visible transcript can be picked up during the meeting, independent of the operation mode.
        transcriptObserver = new MutationObserver(transcriptMutationCallback)

        // Start observing the transcript element and chat messages element for configured mutations
        transcriptObserver.observe(transcriptTargetNode, mutationConfig)
      }
      else {
        throw new Error("Transcript element not found in DOM")
      }
    } catch (err) {
      console.error(err)
      isTranscriptDomErrorCaptured = true
      showNotification(extensionStatusJSON_bug)

      logError("001", err)
    }

    // **** REGISTER CHAT MESSAGES LISTENER **** //
    try {
      const chatMessagesButton = selectElements(".google-symbols", "chat")[0]
      // Force open chat messages to make the required DOM to appear. Otherwise, the required chatMessages DOM element is not available.
      chatMessagesButton.click()

      // Allow DOM to be updated, close chat messages and then register chatMessage mutation observer
      waitForElement(`div[aria-live="polite"].Ge9Kpc`).then(() => {
        chatMessagesButton.click()
        // CRITICAL DOM DEPENDENCY. Grab the chat messages element. This element is present, irrespective of chat ON/OFF, once it appears for this first time.
        try {
          const chatMessagesTargetNode = document.querySelector(`div[aria-live="polite"].Ge9Kpc`)

          // Create chat messages observer instance linked to the callback function. Registered irrespective of operation mode.
          if (chatMessagesTargetNode) {
            chatMessagesObserver = new MutationObserver(chatMessagesMutationCallback)
            chatMessagesObserver.observe(chatMessagesTargetNode, mutationConfig)
          }
          else {
            throw new Error("Chat messages element not found in DOM")
          }
        } catch (err) {
          console.error(err)
          isChatMessagesDomErrorCaptured = true
          showNotification(extensionStatusJSON_bug)

          logError("002", err)
        }
      })
    } catch (err) {
      console.error(err)
      isChatMessagesDomErrorCaptured = true
      showNotification(extensionStatusJSON_bug)

      logError("003", err)
    }

    // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
    if (!isTranscriptDomErrorCaptured && !isChatMessagesDomErrorCaptured) {
      chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
        if (resultSync.operationMode === "manual") {
          showNotification({ status: 400, message: "<strong>TranscripTonic is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
        }
        else {
          showNotification(extensionStatusJSON)
        }
      })
    }

    //*********** MEETING END ROUTINES **********//
    try {
      // CRITICAL DOM DEPENDENCY. Event listener to capture meeting end button click by user
      selectElements(meetingEndIconData.selector, meetingEndIconData.text)[0].parentElement.parentElement.addEventListener("click", () => {
        // To suppress further errors
        hasMeetingEnded = true
        if (transcriptObserver) {
          transcriptObserver.disconnect()
        }
        if (chatMessagesObserver) {
          chatMessagesObserver.disconnect()
        }

        // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Needed to handle one or more speaking when meeting ends.
        if ((personNameBuffer !== "") && (transcriptTextBuffer !== "")) {
          pushBufferToTranscript()
        }
        // Save to chrome storage and send message to download transcript from background script
        overWriteChromeStorage(["transcript", "chatMessages"], true)
      })
    } catch (err) {
      console.error(err)
      showNotification(extensionStatusJSON_bug)

      logError("004", err)
    }
  })
}





//*********** CALLBACK FUNCTIONS **********//
// Callback function to execute when transcription mutations are observed. 
/**
 * @param {MutationRecord[]} mutationsList
 */
function transcriptMutationCallback(mutationsList) {
  mutationsList.forEach(() => {
    try {
      // CRITICAL DOM DEPENDENCY. Get all people in the transcript
      const people = canUseAriaBasedTranscriptSelector
        ? document.querySelector(`div[role="region"][tabindex="0"]`)?.children
        : document.querySelector(".a4cQT")?.childNodes[1]?.firstChild?.childNodes

      if (people) {
        /// In aria based selector case, the last people element is "Jump to bottom" button. So, pick up only if more than 1 element is available.
        if (canUseAriaBasedTranscriptSelector ? (people.length > 1) : (people.length > 0)) {
          // Get the last person
          const person = canUseAriaBasedTranscriptSelector
            ? people[people.length - 2]
            : people[people.length - 1]
          // CRITICAL DOM DEPENDENCY
          const currentPersonName = person.childNodes[0].textContent
          // CRITICAL DOM DEPENDENCY
          const currentTranscriptText = person.childNodes[1].textContent

          if (currentPersonName && currentTranscriptText) {
            // Starting fresh in a meeting or resume from no active transcript
            if (transcriptTextBuffer === "") {
              personNameBuffer = currentPersonName
              timestampBuffer = new Date().toISOString()
              transcriptTextBuffer = currentTranscriptText
            }
            // Some prior transcript buffer exists
            else {
              // New person started speaking 
              if (personNameBuffer !== currentPersonName) {
                // Push previous person's transcript as a block
                pushBufferToTranscript()

                // Update buffers for next mutation and store transcript block timestamp
                personNameBuffer = currentPersonName
                timestampBuffer = new Date().toISOString()
                transcriptTextBuffer = currentTranscriptText
              }
              // Same person speaking more
              else {
                if (canUseAriaBasedTranscriptSelector) {
                  // When the same person speaks for more than 30 min (approx), Meet drops very long transcript for current person and starts over, which is detected by current transcript string being significantly smaller than the previous one
                  if ((currentTranscriptText.length - transcriptTextBuffer.length) < -250) {
                    // Push the long transcript
                    pushBufferToTranscript()

                    // Store transcript block timestamp for next transcript block of same person
                    timestampBuffer = new Date().toISOString()
                  }
                }
                else {
                  // If a person is speaking for a long time, Google Meet does not keep the entire text in the spans. Starting parts are automatically removed in an unpredictable way as the length increases and TranscripTonic will miss them. So we force remove a lengthy transcript node in a controlled way. Google Meet will add a fresh person node when we remove it and continue transcription. TranscripTonic picks it up as a new person and nothing is missed.
                  if (currentTranscriptText.length > 250) {
                    person.remove()
                  }
                }

                // Update buffers for next mutation. This has to be done irrespective of any condition.
                transcriptTextBuffer = currentTranscriptText
              }
            }
          }
        }
        // No people found in transcript DOM
        else {
          // No transcript yet or the last person stopped speaking(and no one has started speaking next)
          console.log("No active transcript")
          // Push data in the buffer variables to the transcript array, but avoid pushing blank ones.
          if ((personNameBuffer !== "") && (transcriptTextBuffer !== "")) {
            pushBufferToTranscript()
          }
          // Update buffers for the next person in the next mutation
          personNameBuffer = ""
          transcriptTextBuffer = ""
        }
      }

      // Logs to indicate that the extension is working
      if (transcriptTextBuffer.length > 125) {
        console.log(transcriptTextBuffer.slice(0, 50) + " ... " + transcriptTextBuffer.slice(-50))
      }
      else {
        console.log(transcriptTextBuffer)
      }
    } catch (err) {
      console.error(err)
      if (!isTranscriptDomErrorCaptured && !hasMeetingEnded) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)

        logError("005", err)
      }
      isTranscriptDomErrorCaptured = true
    }
  })
}

// Callback function to execute when chat messages mutations are observed. 
/**
 * @param {MutationRecord[]} mutationsList
 */
function chatMessagesMutationCallback(mutationsList) {
  mutationsList.forEach(() => {
    try {
      // CRITICAL DOM DEPENDENCY
      const chatMessagesElement = document.querySelector(`div[aria-live="polite"].Ge9Kpc`)
      // Attempt to parse messages only if at least one message exists
      if (chatMessagesElement && chatMessagesElement.children.length > 0) {
        // CRITICAL DOM DEPENDENCY. Get the last message that was sent/received.
        const chatMessageElement = chatMessagesElement.lastChild
        // CRITICAL DOM DEPENDENCY
        const personName = chatMessageElement?.firstChild?.firstChild?.textContent
        const timestamp = new Date().toISOString()
        // CRITICAL DOM DEPENDENCY. Some mutations will have some noisy text at the end, which is handled in pushUniqueChatBlock function.
        const chatMessageText = chatMessageElement?.lastChild?.lastChild?.textContent

        if (personName && chatMessageText) {
          /**@type {ChatMessage} */
          const chatMessageBlock = {
            "personName": personName === "You" ? userName : personName,
            "timestamp": timestamp,
            "chatMessageText": chatMessageText
          }

          // Lot of mutations fire for each message, pick them only once
          pushUniqueChatBlock(chatMessageBlock)
        }
      }
    }
    catch (err) {
      console.error(err)
      if (!isChatMessagesDomErrorCaptured && !hasMeetingEnded) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)

        logError("006", err)
      }
      isChatMessagesDomErrorCaptured = true
    }
  })
}










//*********** HELPER FUNCTIONS **********//
// Pushes data in the buffer to transcript array as a transcript block
function pushBufferToTranscript() {
  transcript.push({
    "personName": personNameBuffer === "You" ? userName : personNameBuffer,
    "timestamp": timestampBuffer,
    "transcriptText": transcriptTextBuffer
  })
  overWriteChromeStorage(["transcript"], false)
  
  // Update AI panel status if it exists
  if (aiAssistantPanel) {
    updateTranscriptStatus()
  }
}

// Pushes object to array only if it doesn't already exist. chatMessage is checked for substring since some trailing text(keep Pin message) is present from a button that allows to pin the message.
/**
 * @param {ChatMessage} chatBlock
 */
function pushUniqueChatBlock(chatBlock) {
  const isExisting = chatMessages.some(item =>
    item.personName === chatBlock.personName &&
    chatBlock.chatMessageText.includes(item.chatMessageText)
  )
  if (!isExisting) {
    console.log(chatBlock)
    chatMessages.push(chatBlock)
    overWriteChromeStorage(["chatMessages"], false)
  }
}

// Saves specified variables to chrome storage. Optionally, can send message to background script to download, post saving.
/**
 * @param {Array<"transcript" | "meetingTitle" | "meetingStartTimestamp" | "chatMessages">} keys
 * @param {boolean} sendDownloadMessage
 */
function overWriteChromeStorage(keys, sendDownloadMessage) {
  const objectToSave = {}
  // Hard coded list of keys that are accepted
  if (keys.includes("transcript")) {
    objectToSave.transcript = transcript
  }
  if (keys.includes("meetingTitle")) {
    objectToSave.meetingTitle = meetingTitle
  }
  if (keys.includes("meetingStartTimestamp")) {
    objectToSave.meetingStartTimestamp = meetingStartTimestamp
  }
  if (keys.includes("chatMessages")) {
    objectToSave.chatMessages = chatMessages
  }

  chrome.storage.local.set(objectToSave, function () {
    // Helps people know that the extension is working smoothly in the background
    pulseStatus()
    if (sendDownloadMessage) {
      /** @type {ExtensionMessage} */
      const message = {
        type: "meeting_ended"
      }
      chrome.runtime.sendMessage(message, (responseUntyped) => {
        const response = /** @type {ExtensionResponse} */ (responseUntyped)
        if (!response.success) {
          console.error(response.message)
        }
      })
    }
  })
}

function pulseStatus() {
  const statusActivityCSS = `position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    z-index: 100;
    transition: background-color 0.3s ease-in
  `

  /** @type {HTMLDivElement | null}*/
  let activityStatus = document.querySelector(`#transcriptonic-status`)
  if (!activityStatus) {
    let html = document.querySelector("html")
    activityStatus = document.createElement("div")
    activityStatus.setAttribute("id", "transcriptonic-status")
    activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
    html?.appendChild(activityStatus)
  }
  else {
    activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
  }

  setTimeout(() => {
    activityStatus.style.cssText = `background-color: transparent; ${statusActivityCSS}`
  }, 3000)
}


// Grabs updated meeting title, if available
function updateMeetingTitle() {
  try {
    // NON CRITICAL DOM DEPENDENCY
    const meetingTitleElement = document.querySelector(".u6vdEc")
    if (meetingTitleElement?.textContent) {
      meetingTitle = meetingTitleElement.textContent
      overWriteChromeStorage(["meetingTitle"], false)
    } else {
      throw new Error("Meeting title element not found in DOM")
    }
  } catch (err) {
    console.error(err)

    if (!hasMeetingEnded) {
      logError("007", err)
    }
  }
}

// Returns all elements of the specified selector type and specified textContent. Return array contains the actual element as well as all the parents. 
/**
 * @param {string} selector
 * @param {string | RegExp} text
 */
function selectElements(selector, text) {
  var elements = document.querySelectorAll(selector)
  return Array.prototype.filter.call(elements, function (element) {
    return RegExp(text).test(element.textContent)
  })
}

// Efficiently waits until the element of the specified selector and textContent appears in the DOM. Polls only on animation frame change
/**
 * @param {string} selector
 * @param {string | RegExp} [text]
 */
async function waitForElement(selector, text) {
  if (text) {
    // loops for every animation frame change, until the required element is found
    while (!Array.from(document.querySelectorAll(selector)).find(element => element.textContent === text)) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  }
  else {
    // loops for every animation frame change, until the required element is found
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  }
  return document.querySelector(selector)
}

// Shows a responsive notification of specified type and message
/**
 * @param {ExtensionStatusJSON} extensionStatusJSON
 */
function showNotification(extensionStatusJSON) {
  // Banner CSS
  let html = document.querySelector("html")
  let obj = document.createElement("div")
  let logo = document.createElement("img")
  let text = document.createElement("p")

  logo.setAttribute(
    "src",
    "https://ejnana.github.io/transcripto-status/icon.png"
  )
  logo.setAttribute("height", "32px")
  logo.setAttribute("width", "32px")
  logo.style.cssText = "border-radius: 4px"

  // Remove banner after 5s
  setTimeout(() => {
    obj.style.display = "none"
  }, 5000)

  if (extensionStatusJSON.status === 200) {
    obj.style.cssText = `color: #2A9ACA; ${commonCSS}`
    text.innerHTML = extensionStatusJSON.message
  }
  else {
    obj.style.cssText = `color: orange; ${commonCSS}`
    text.innerHTML = extensionStatusJSON.message
  }

  obj.prepend(text)
  obj.prepend(logo)
  if (html)
    html.append(obj)
}

// CSS for notification
const commonCSS = `background: rgb(255 255 255 / 10%); 
    backdrop-filter: blur(16px); 
    position: fixed;
    top: 5%; 
    left: 0; 
    right: 0; 
    margin-left: auto; 
    margin-right: auto;
    max-width: 780px;  
    z-index: 1000; 
    padding: 0rem 1rem;
    border-radius: 8px; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    gap: 16px;  
    font-size: 1rem; 
    line-height: 1.5; 
    font-family: "Google Sans",Roboto,Arial,sans-serif; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`


// Logs anonymous errors to a Google sheet for swift debugging   
/**
 * @param {string} code
 * @param {any} err
 */
function logError(code, err) {
  fetch(`https://script.google.com/macros/s/AKfycbxiyQSDmJuC2onXL7pKjXgELK1vA3aLGZL5_BLjzCp7fMoQ8opTzJBNfEHQX_QIzZ-j4Q/exec?version=${chrome.runtime.getManifest().version}&code=${code}&error=${encodeURIComponent(err)}`, { mode: "no-cors" })
}


// Fetches extension status from GitHub and saves to chrome storage. Defaults to 200, if remote server is unavailable.
function checkExtensionStatus() {
  return new Promise((resolve, reject) => {
    // Set default value as 200
    chrome.storage.local.set({
      extensionStatusJSON: { status: 200, message: "<strong>TranscripTonic is running</strong> <br /> Do not turn off captions" },
    })

    // https://stackoverflow.com/a/42518434
    fetch(
      "https://ejnana.github.io/transcripto-status/status-prod-unpacked.json",
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .then((result) => {
        // Write status to chrome local storage
        chrome.storage.local.set({ extensionStatusJSON: result }, function () {
          console.log("Extension status fetched and saved")
          resolve("Extension status fetched and saved")
        })
      })
      .catch((err) => {
        console.error(err)
        reject("Could not fetch extension status")

        logError("008", err)
      })
  })
}

function recoverLastMeeting() {
  return new Promise((resolve, reject) => {
    /** @type {ExtensionMessage} */
    const message = {
      type: "recover_last_meeting",
    }
    chrome.runtime.sendMessage(message, function (responseUntyped) {
      const response = /** @type {ExtensionResponse} */ (responseUntyped)
      if (response.success) {
        resolve("Last meeting recovered successfully or recovery not needed")
      }
      else {
        reject(response.message)
      }
    })
  })
}





// CURRENT GOOGLE MEET TRANSCRIPT DOM. TO BE UPDATED.

{/* <div class="a4cQT kV7vwc eO2Zfd" jscontroller="D1tHje" jsaction="bz0DVc:HWTqGc;E18dRb:lUFH9b;QBUr8:lUFH9b;stc2ve:oh3Xke" style="">
  // CAPTION LANGUAGE SETTINGS. MAY OR MAY NOT HAVE CHILDREN
  <div class="NmXUuc  P9KVBf" jscontroller="rRafu" jsaction="F41Sec:tsH52e;OmFrlf:xfAI6e(zHUIdd)"></div>
  <div class="DtJ7e">
    <span class="frX3lc-vlkzWd  P9KVBf"></span>
    <div jsname="dsyhDe" class="iOzk7 uYs2ee " style="">
      //PERSON 1
      <div class="nMcdL bj4p3b" style="">
        <div class="adE6rb M6cG9d">
          <img alt="" class="Z6byG r6DyN" src="https://lh3.googleusercontent.com/a/some-url" data-iml="63197.699999999255">
            <div class="KcIKyf jxFHg">Person 1</div>
        </div>
        <div jsname="YSxPC" class="bYevke wY1pdd" style="height: 27.5443px;">
          <div jsname="tgaKEf" class="bh44bd VbkSUe">
            Some transcript text.
            Some more text.</div>
        </div>
      </div>
      //PERSON 2
      <div class="nMcdL bj4p3b" style="">
        <div class="adE6rb M6cG9d">
          <img alt="" class="Z6byG r6DyN" src="https://lh3.googleusercontent.com/a/some-url" data-iml="63197.699999999255">
            <div class="KcIKyf jxFHg">Person 2</div>
        </div>
        <div jsname="YSxPC" class="bYevke wY1pdd" style="height: 27.5443px;">
          <div jsname="tgaKEf" class="bh44bd VbkSUe">
            Some transcript text.
            Some more text.</div>
        </div>
      </div>
    </div>
    <div jsname="APQunf" class="iOzk7 uYs2ee" style="display: none;">
    </div>
  </div>
  <div jscontroller="mdnBv" jsaction="stc2ve:MO88xb;QBUr8:KNou4c">
  </div>
</div> */}

// CURRENT GOOGLE MEET CHAT MESSAGES DOM
{/* <div jsname="xySENc" aria-live="polite" jscontroller="Mzzivb" jsaction="nulN2d:XL2g4b;vrPT5c:XL2g4b;k9UrDc:ClCcUe"
  class="Ge9Kpc z38b6">
  <div class="Ss4fHf" jsname="Ypafjf" tabindex="-1" jscontroller="LQRnv"
    jsaction="JIbuQc:sCzVOd(aUCive),T4Iwcd(g21v4c),yyLnsd(iJEnyb),yFT8A(RNMM1e),Cg1Rgf(EZbOH)" style="order: 0;">
    <div class="QTyiie">
      <div class="poVWob">You</div>
      <div jsname="biJjHb" class="MuzmKe">17:00</div>
    </div>
    <div class="beTDc">
      <div class="er6Kjc chmVPb">
        <div class="ptNLrf">
          <div jsname="dTKtvb">
            <div jscontroller="RrV5Ic" jsaction="rcuQ6b:XZyPzc" data-is-tv="false">Hello</div>
          </div>
          <div class="pZBsfc">Hover over a message to pin it<i class="google-material-icons VfPpkd-kBDsod WRc1Nb"
              aria-hidden="true">keep</i></div>
          <div class="MMfG3b"><span tooltip-id="ucc-17"></span><span data-is-tooltip-wrapper="true"><button
                class="VfPpkd-Bz112c-LgbsSe yHy1rc eT1oJ tWDL4c Brnbv pFZkBd" jscontroller="soHxf"
                jsaction="click:cOuCgd; mousedown:UX7yZ; mouseup:lbsD7e; mouseenter:tfO1Yc; mouseleave:JywGue; touchstart:p6p2H; touchmove:FwuNnf; touchend:yfqBxc; touchcancel:JMtRjd; focus:AHmuwe; blur:O22p3e; contextmenu:mg9Pef;mlnRJb:fLiPzd"
                jsname="iJEnyb" data-disable-idom="true" aria-label="Pin message" data-tooltip-enabled="true"
                data-tooltip-id="ucc-17" data-tooltip-x-position="3" data-tooltip-y-position="2" role="button"
                data-message-id="1714476309237">
                <div jsname="s3Eaab" class="VfPpkd-Bz112c-Jh9lGc"></div>
                <div class="VfPpkd-Bz112c-J1Ukfc-LhBDec"></div><i class="google-material-icons VfPpkd-kBDsod VjEpdd"
                  aria-hidden="true">keep</i>
              </button>
              <div class="EY8ABd-OWXEXe-TAWMXe" role="tooltip" aria-hidden="true" id="ucc-17">Pin message</div>
            </span></div>
        </div>
      </div>
    </div>
  </div>
</div> */}