import os
<<<<<<< HEAD
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
=======
from cleaner import clean_text, split_into_paragraphs


def extract_pdf(file_path):
    try:
        import fitz
        document = fitz.open(file_path)
        page_results = []
        full_text_list = []

        page_index = 1
        for page in document:
            page_text = page.get_text()
            if page_text and len(page_text.strip()) > 0:
                paragraphs = split_into_paragraphs(page_text)
                for paragraph in paragraphs:
                    page_results.append({
                        "page": page_index,
                        "text": paragraph
                    })
                    full_text_list.append(paragraph)
            page_index = page_index + 1

        document.close()
        combined_text = "\n\n".join(full_text_list)
        return combined_text, page_results
    except ImportError:
        import pypdf
        reader = pypdf.PdfReader(file_path)
        page_results = []
        full_text_list = []

        page_index = 1
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text and len(page_text.strip()) > 0:
                paragraphs = split_into_paragraphs(page_text)
                for paragraph in paragraphs:
                    page_results.append({
                        "page": page_index,
                        "text": paragraph
                    })
                    full_text_list.append(paragraph)
            page_index = page_index + 1

        combined_text = "\n\n".join(full_text_list)
        return combined_text, page_results


def extract_docx(file_path):
    import docx
    document = docx.Document(file_path)
    paragraph_list = []

    for paragraph_item in document.paragraphs:
        cleaned_item = paragraph_item.text.strip()
        if len(cleaned_item) > 0:
            paragraph_list.append(cleaned_item)

    combined_text = "\n\n".join(paragraph_list)
    return combined_text


def extract_pptx(file_path):
    import pptx
    presentation = pptx.Presentation(file_path)
    slide_results = []
    full_text_list = []

    slide_index = 1
    for slide in presentation.slides:
        slide_text_pieces = []
        for shape in slide.shapes:
            if hasattr(shape, "text"):
                shape_text = shape.text.strip()
                if len(shape_text) > 0:
                    slide_text_pieces.append(shape_text)

        joined_slide_text = "\n".join(slide_text_pieces)
        if len(joined_slide_text.strip()) > 0:
            paragraphs = split_into_paragraphs(joined_slide_text)
            for paragraph in paragraphs:
                slide_results.append({
                    "slide": slide_index,
                    "text": paragraph
                })
                full_text_list.append(paragraph)
        slide_index = slide_index + 1

    combined_text = "\n\n".join(full_text_list)
    return combined_text, slide_results


def extract_image_ocr(file_path):
    from PIL import Image
    import pytesseract

    image = Image.open(file_path)
    extracted_text = pytesseract.image_to_string(image)
    return clean_text(extracted_text)


def read_text_file(file_path):
    encoding_list = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
    for current_encoding in encoding_list:
        try:
            with open(file_path, "r", encoding=current_encoding) as text_file:
                return clean_text(text_file.read())
        except UnicodeDecodeError:
            continue

    with open(file_path, "r", encoding="utf-8", errors="replace") as text_file:
        return clean_text(text_file.read())
>>>>>>> 22fc5f8ddab57ad4f531daf1a9dd4e848e6fec58
