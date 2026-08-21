import os
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