// @ts-check
/// <reference path="../types/chrome.d.ts" />

(function () {
  const chooseBtn = document.getElementById('choose-image')
  const resetBtn = document.getElementById('reset-image')
  const fileInput = /** @type {HTMLInputElement|null} */(document.getElementById('assistant-image'))
  const preview = document.getElementById('assistant-preview')

  function updatePreviewWithEmoji() {
    if (!preview) return
    preview.innerHTML = '<span style="font-size:28px;">🤖</span>'
  }

  function updatePreviewWithImage(dataUrl) {
    if (!preview) return
    preview.innerHTML = ''
    const img = document.createElement('img')
    img.src = dataUrl
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    preview.appendChild(img)
  }

  // Load current settings
  chrome.storage.sync.get(['aiAssistantIconType', 'aiAssistantEmoji'], syncCfg => {
    chrome.storage.local.get(['aiAssistantImageDataUrl'], localCfg => {
      if (syncCfg.aiAssistantIconType === 'image' && localCfg.aiAssistantImageDataUrl) {
        updatePreviewWithImage(localCfg.aiAssistantImageDataUrl)
      } else {
        updatePreviewWithEmoji()
      }
    })
  })

  if (chooseBtn && fileInput) {
    chooseBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = /** @type {string} */(reader.result)
        updatePreviewWithImage(dataUrl)
        // Save automatically
        chrome.storage.local.set({ aiAssistantImageDataUrl: dataUrl }, () => {
          chrome.storage.sync.set({ aiAssistantIconType: 'image' })
        })
      }
      reader.readAsDataURL(file)
    })
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      chrome.storage.sync.set({ aiAssistantIconType: 'emoji', aiAssistantEmoji: '🤖' }, () => {
        updatePreviewWithEmoji()
      })
    })
  }
})()
