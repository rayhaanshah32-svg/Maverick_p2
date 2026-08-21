import os
from pypdf import PdfReader
from pptx import Presentation
from PIL import Image
import pytesseract


# Tesseract path for Windows
pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)


def extract_pdf(file_path):
    """Extract text from PDF."""
    reader = PdfReader(file_path)

    text = []

    for page_number, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text()

        if page_text:
            text.append(f"\n--- PAGE {page_number} ---\n")
            text.append(page_text)

    return "\n".join(text).strip()


def extract_pptx(file_path):
    """Extract text from PPT/PPTX."""
    presentation = Presentation(file_path)

    text = []

    for slide_number, slide in enumerate(
        presentation.slides, start=1
    ):
        slide_text = []

        for shape in slide.shapes:
            if hasattr(shape, "text"):
                if shape.text.strip():
                    slide_text.append(shape.text.strip())

        if slide_text:
            text.append(
                f"\n--- SLIDE {slide_number} ---\n"
            )
            text.append("\n".join(slide_text))

    return "\n".join(text).strip()


def extract_image(file_path):
    """Extract text from JPG/JPEG/PNG using Tesseract OCR."""
    image = Image.open(file_path)

    text = pytesseract.image_to_string(image)

    return text.strip()


def extract_text(file_path):
    """
    Automatically detect the file type
    and extract its text.
    """

    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"File not found: {file_path}"
        )

    extension = os.path.splitext(file_path)[1].lower()

    if extension == ".pdf":
        return extract_pdf(file_path)

    elif extension in [".ppt", ".pptx"]:
        return extract_pptx(file_path)

    elif extension in [".jpg", ".jpeg", ".png"]:
        return extract_image(file_path)

    else:
        raise ValueError(
            f"Unsupported file type: {extension}"
        )