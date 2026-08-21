# Adaptive Reader - Person D Integration

Unified application integrating the CV pipeline, FastAPI backend document ingestion, and adaptive UI.

## Architecture

**UPLOAD → FASTAPI BACKEND INGESTION → STRUCTURED PARAGRAPHS → RENDER → ADAPT**

### Components

1. **Document Ingestion Backend** (`backend/`)
   - FastAPI server (`main.py`, `extractor.py`, `cleaner.py`)
   - Multi-format ingestion: PDF (PyMuPDF), DOCX (python-docx), PPTX (python-pptx), TXT, MD, Images (OCR)
   - Structured JSON response (`filename`, `type`, `wordCount`, `paragraphs`, `plainText`)

2. **Application UI** (`app-ui.js`)
   - Connects to `POST /api/upload`
   - Manages UI state, transitions, and text adaptation settings
   - Renders structured paragraphs

3. **Main Application Coordinator** (`main.js`)
   - Coordinates reading sessions and metrics
   - Dispatches adaptation recommendations

4. **CV Pipeline** (`adaptive-reader-cv/`)
   - Authoritative gaze tracking, eye mesh, and reading state engine