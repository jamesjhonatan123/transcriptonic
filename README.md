# TranscripTonic

Simple Google Meet transcripts. Private and open source.

## Features

### Core Functionality
- **Auto mode**: Get transcripts of all meetings automatically
- **Manual mode**: Switch on transcript as needed using the CC icon in Google Meet
- **Webhook integration**: Integrate with your favorite tools
- **Download transcripts**: Automatically download as text files at the end of each meeting

### 🤖 AI-Powered Features
- **Gemini API Integration**: Secure API key storage and testing
- **AI Templates**: Create custom HTML templates for AI-generated summaries
- **Quick Prompts**: Instant AI actions during meetings:
  - Generate relevant questions
  - Summarize key points
  - List action items
  - Identify main topics
- **Custom Prompts**: Ask anything about your meeting
- **Real-time AI Assistant**: Floating AI panel during Google Meet sessions
- **PDF Export**: Generate HTML summaries and export them

## Setup

### Basic Setup
1. Install the extension
2. Choose between Auto or Manual mode
3. Start your Google Meet session

### AI Features Setup
1. **Get a Gemini API Key**:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the key

2. **Configure the Extension**:
   - Click the extension icon
   - Paste your Gemini API key
   - Click "Test" to verify it works
   - Click "Save Key"

3. **Create Templates** (Optional):
   - Go to the "Last 10 meetings" page
   - Scroll to "AI Templates" section
   - Create custom HTML templates with placeholders:
     - `{{summary}}` - AI-generated summary
     - `{{date}}` - Meeting date
     - `{{participants}}` - List of participants

## Using AI Features

### During a Meeting
- A floating 🤖 button appears in the top-right corner
- Click it to open the AI Assistant panel
- Use Quick Actions for common tasks:
  - **📝 Questions**: Generate relevant questions
  - **📋 Summary**: Summarize discussion so far
  - **✅ Actions**: List action items and decisions
  - **🎯 Topics**: Identify main themes
- Or use the Custom Prompt field for specific requests

### After a Meeting
- Go to "Last 10 meetings" page
- Use the AI Templates section to generate formatted summaries
- Use Quick Prompts for detailed analysis
- Copy responses or generate PDF exports

## Templates

The extension comes with 3 default templates:
- **Executive Summary**: Professional summary format
- **Meeting Minutes**: Traditional meeting minutes layout
- **Project Update**: Project-focused update format

You can create your own templates using HTML and these placeholders:
- `{{summary}}` - AI-generated content
- `{{date}}` - Meeting date
- `{{participants}}` - Participant list

## Privacy & Security

- Your Gemini API key is stored locally in your browser
- Transcripts are processed locally and only sent to Gemini when you use AI features
- No data is sent to external servers except for AI processing
- All AI requests are made directly to Google's Gemini API

## Webhook Integration

Set up webhooks to integrate TranscripTonic with your favorite tools like Google Docs, Notion, or n8n.

## Support

- [Get help](https://github.com/vivek-nexus/transcriptonic#readme)
- [Report a bug](https://github.com/vivek-nexus/transcriptonic/issues)

## License

[License details](LICENSE)
