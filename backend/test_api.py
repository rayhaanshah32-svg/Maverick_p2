import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["service"] == "Document Ingestion API"
    assert "supported_formats" in json_data


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_upload_no_file():
    response = client.post("/api/upload")
    assert response.status_code == 422
    json_data = response.json()
    assert "code" in json_data


def test_upload_unsupported_type():
    dummy_file_path = "sample_test.unsupported"
    with open(dummy_file_path, "w", encoding="utf-8") as dummy_file:
        dummy_file.write("dummy text content")

    try:
        with open(dummy_file_path, "rb") as dummy_file:
            response = client.post(
                "/api/upload",
                files={"file": ("sample_test.unsupported", dummy_file, "application/octet-stream")}
            )
        assert response.status_code == 400
        json_data = response.json()
        assert json_data["code"] == "UNSUPPORTED_FILE_TYPE"
        assert "error" in json_data
    finally:
        if os.path.exists(dummy_file_path):
            os.unlink(dummy_file_path)


def test_upload_empty_file():
    empty_file_path = "sample_empty.txt"
    with open(empty_file_path, "w", encoding="utf-8") as empty_file:
        empty_file.write("")

    try:
        with open(empty_file_path, "rb") as empty_file:
            response = client.post(
                "/api/upload",
                files={"file": ("sample_empty.txt", empty_file, "text/plain")}
            )
        assert response.status_code == 422
        json_data = response.json()
        assert json_data["code"] == "EMPTY_FILE"
    finally:
        if os.path.exists(empty_file_path):
            os.unlink(empty_file_path)


def test_upload_txt_file():
    txt_path = Path("test.txt")
    with open(txt_path, "rb") as file_object:
        response = client.post(
            "/api/upload",
            files={"file": ("test.txt", file_object, "text/plain")}
        )
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["filename"] == "test.txt"
    assert json_data["type"] == "text/plain"
    assert json_data["wordCount"] > 0
    assert len(json_data["paragraphs"]) > 0
    assert len(json_data["plainText"]) > 0


def test_upload_md_file():
    md_path = Path("test.md")
    with open(md_path, "rb") as file_object:
        response = client.post(
            "/api/upload",
            files={"file": ("test.md", file_object, "text/markdown")}
        )
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["filename"] == "test.md"
    assert json_data["type"] == "text/markdown"
    assert json_data["wordCount"] > 0
    assert len(json_data["paragraphs"]) > 0
    assert len(json_data["plainText"]) > 0


def test_upload_pdf_file():
    pdf_path = Path("test.pdf")
    with open(pdf_path, "rb") as file_object:
        response = client.post(
            "/api/upload",
            files={"file": ("test.pdf", file_object, "application/pdf")}
        )
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["filename"] == "test.pdf"
    assert json_data["type"] == "application/pdf"
    assert json_data["wordCount"] > 0
    assert len(json_data["paragraphs"]) > 0
    assert len(json_data["plainText"]) > 0
    assert "pages" in json_data


def test_upload_docx_file():
    docx_path = Path("test.docx")
    with open(docx_path, "rb") as file_object:
        response = client.post(
            "/api/upload",
            files={"file": ("test.docx", file_object, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        )
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["filename"] == "test.docx"
    assert "wordprocessingml" in json_data["type"]
    assert json_data["wordCount"] > 0
    assert len(json_data["paragraphs"]) > 0
    assert len(json_data["plainText"]) > 0


def test_upload_pptx_file():
    pptx_path = Path("test.pptx")
    with open(pptx_path, "rb") as file_object:
        response = client.post(
            "/api/upload",
            files={"file": ("test.pptx", file_object, "application/vnd.openxmlformats-officedocument.presentationml.presentation")}
        )
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["filename"] == "test.pptx"
    assert "presentationml" in json_data["type"]
    assert json_data["wordCount"] > 0
    assert len(json_data["paragraphs"]) > 0
    assert len(json_data["plainText"]) > 0
    assert "slides" in json_data


def test_upload_image_file():
    image_path = Path("test.jpg")
    with open(image_path, "rb") as file_object:
        response = client.post(
            "/api/upload",
            files={"file": ("test.jpg", file_object, "image/jpeg")}
        )
    assert response.status_code in [200, 422]
    json_data = response.json()
    if response.status_code == 200:
        assert json_data["filename"] == "test.jpg"
        assert json_data["type"] == "image/jpeg"
        assert json_data["wordCount"] > 0
    else:
        assert "error" in json_data
        assert json_data["code"] in ["OCR_FAILURE", "NO_TEXT_FOUND"]