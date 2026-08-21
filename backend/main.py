import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError

from extractor import (
    extract_pdf,
    extract_docx,
    extract_pptx,
    extract_image_ocr,
    read_text_file
)
from cleaner import split_into_paragraphs

app = FastAPI(
    title="Document Ingestion API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

SUPPORTED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "Invalid request parameters or missing file",
            "code": "VALIDATION_ERROR"
        }
    )


@app.get("/")
def get_root():
    return {
        "service": "Document Ingestion API",
        "version": "1.0.0",
        "status": "running",
        "supported_formats": list(SUPPORTED_EXTENSIONS.keys())
    }


@app.get("/health")
def get_health():
    return {
        "status": "healthy"
    }


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename or len(file.filename.strip()) == 0:
        return JSONResponse(
            status_code=422,
            content={
                "error": "No filename provided",
                "code": "NO_FILENAME"
            }
        )

    file_extension = Path(file.filename).suffix.lower()

    if file_extension not in SUPPORTED_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={
                "error": "Unsupported file type: " + file_extension,
                "code": "UNSUPPORTED_FILE_TYPE",
                "supported_types": list(SUPPORTED_EXTENSIONS.keys())
            }
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        return JSONResponse(
            status_code=422,
            content={
                "error": "The uploaded file is empty",
                "code": "EMPTY_FILE"
            }
        )

    temporary_file_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            temp_file.write(file_bytes)
            temporary_file_path = temp_file.name

        plain_text = ""
        metadata_pages = None
        metadata_slides = None

        if file_extension == ".pdf":
            plain_text, metadata_pages = extract_pdf(temporary_file_path)
        elif file_extension == ".docx":
            plain_text = extract_docx(temporary_file_path)
        elif file_extension == ".pptx":
            plain_text, metadata_slides = extract_pptx(temporary_file_path)
        elif file_extension == ".txt" or file_extension == ".md":
            plain_text = read_text_file(temporary_file_path)
        elif file_extension in [".jpg", ".jpeg", ".png"]:
            try:
                plain_text = extract_image_ocr(temporary_file_path)
            except Exception as ocr_error:
                return JSONResponse(
                    status_code=422,
                    content={
                        "error": "OCR failed: " + str(ocr_error),
                        "code": "OCR_FAILURE"
                    }
                )

        if not plain_text or len(plain_text.strip()) == 0:
            return JSONResponse(
                status_code=422,
                content={
                    "error": "No readable text found in document",
                    "code": "NO_TEXT_FOUND"
                }
            )

        paragraphs_list = split_into_paragraphs(plain_text)
        if len(paragraphs_list) == 0:
            return JSONResponse(
                status_code=422,
                content={
                    "error": "No readable paragraphs found in document",
                    "code": "NO_TEXT_FOUND"
                }
            )

        words_in_text = plain_text.split()
        word_count_number = len(words_in_text)

        response_data = {
            "filename": file.filename,
            "type": SUPPORTED_EXTENSIONS[file_extension],
            "wordCount": word_count_number,
            "paragraphs": paragraphs_list,
            "plainText": plain_text
        }

        if metadata_pages is not None:
            response_data["pages"] = metadata_pages

        if metadata_slides is not None:
            response_data["slides"] = metadata_slides

        return JSONResponse(
            status_code=200,
            content=response_data
        )

    except Exception as general_error:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to parse document: " + str(general_error),
                "code": "PARSER_FAILURE"
            }
        )
    finally:
        if temporary_file_path and os.path.exists(temporary_file_path):
            try:
                os.unlink(temporary_file_path)
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)