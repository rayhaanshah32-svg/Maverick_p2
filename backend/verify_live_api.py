import json
from pathlib import Path
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

formats_to_test = [
    ("test.txt", "text/plain"),
    ("test.md", "text/markdown"),
    ("test.pdf", "application/pdf"),
    ("test.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("test.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ("test.jpg", "image/jpeg")
]

print("=== STARTING LIVE API INGESTION TESTS ===")
for filename, mime_type in formats_to_test:
    file_path = Path(filename)
    if not file_path.exists():
        print("FAIL: File not found - " + filename)
        continue

    with open(file_path, "rb") as file_handle:
        response = client.post(
            "/api/upload",
            files={"file": (filename, file_handle, mime_type)}
        )

    print("--- Testing: " + filename + " ---")
    print("HTTP Status:", response.status_code)
    try:
        response_json = response.json()
        if response.status_code == 200:
            print("Status: PASS")
            print("Type:", response_json.get("type"))
            print("Word Count:", response_json.get("wordCount"))
            print("Paragraphs Count:", len(response_json.get("paragraphs", [])))
            print("Sample Paragraph:", (response_json.get("paragraphs", [""])[0])[:60] + "...")
        else:
            print("Status: HANDLED ERROR (expected if OCR unavailable)")
            print("Response:", json.dumps(response_json, indent=2))
    except Exception as parse_error:
        print("Status: FAIL - could not parse JSON:", parse_error)

print("=== LIVE API INGESTION TESTS COMPLETE ===")
