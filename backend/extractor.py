# pyrefly: ignore [missing-import]
import pymupdf

from pptx import Presentation

from cleaner import split_into_paragraphs


def extract_pdf(file_path):
    """
    Extract text from a PDF and convert it
    into structured paragraphs.
    """

    results = []

    document = pymupdf.open(file_path)

    paragraph_id = 1

    for page_number, page in enumerate(
        document,
        start=1
    ):

        text = page.get_text("text")

        if text.strip():

            paragraphs = split_into_paragraphs(text)

            for paragraph in paragraphs:

                results.append({
                    "id": paragraph_id,
                    "page": page_number,
                    "text": paragraph
                })

                paragraph_id += 1

    document.close()

    return results


def extract_ppt(file_path):
    """
    Extract text from PPT/PPTX slide by slide.
    """

    results = []

    presentation = Presentation(file_path)

    paragraph_id = 1

    for slide_number, slide in enumerate(
        presentation.slides,
        start=1
    ):

        slide_text = []

        for shape in slide.shapes:

            if hasattr(shape, "text"):

                text = shape.text.strip()

                if text:
                    slide_text.append(text)

        combined_text = "\n".join(slide_text)

        paragraphs = split_into_paragraphs(
            combined_text
        )

        for paragraph in paragraphs:

            results.append({
                "id": paragraph_id,
                "slide": slide_number,
                "text": paragraph
            })

            paragraph_id += 1

    return results