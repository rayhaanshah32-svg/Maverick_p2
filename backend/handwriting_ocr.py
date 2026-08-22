import os
import cv2
import fitz
import numpy as np
import torch

from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel


device = "cuda" if torch.cuda.is_available() else "cpu"

MODEL_NAME = "microsoft/trocr-base-handwritten"

_processor = None
_model = None


def _load_model_if_needed():
    global _processor, _model
    if _processor is not None and _model is not None:
        return

    print("Loading handwriting OCR model...")
    _processor = TrOCRProcessor.from_pretrained(MODEL_NAME)
    _model = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)
    _model.to(device)
    _model.eval()
    print("Handwriting OCR model loaded.")



# --------------------------------------------------
# RECOGNIZE ONE LINE
# --------------------------------------------------

def recognize_line(image):
    """Recognize handwritten text from one image/line."""

    _load_model_if_needed()

    if not isinstance(image, Image.Image):
        image = Image.fromarray(image)

    image = image.convert("RGB")

    pixel_values = _processor(
        images=image,
        return_tensors="pt"
    ).pixel_values

    pixel_values = pixel_values.to(device)

    with torch.no_grad():
        generated_ids = _model.generate(
            pixel_values,
            max_new_tokens=128
        )

    text = _processor.batch_decode(
        generated_ids,
        skip_special_tokens=True
    )[0]

    return text.strip()


# --------------------------------------------------
# FIND TEXT LINES
# --------------------------------------------------

def find_lines(image):
    """Detect possible handwritten text lines."""

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    gray = cv2.GaussianBlur(
        gray,
        (3, 3),
        0
    )

    _, binary = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (30, 3)
    )

    connected = cv2.morphologyEx(
        binary,
        cv2.MORPH_CLOSE,
        kernel
    )

    contours, _ = cv2.findContours(
        connected,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    lines = []

    height, width = gray.shape

    for contour in contours:

        x, y, w, h = cv2.boundingRect(contour)

        if w < width * 0.05:
            continue

        if h < 10:
            continue

        if h > height * 0.25:
            continue

        padding = 10

        x1 = max(0, x - padding)
        y1 = max(0, y - padding)

        x2 = min(width, x + w + padding)
        y2 = min(height, y + h + padding)

        crop = image[y1:y2, x1:x2]

        lines.append((y1, crop))

    lines.sort(key=lambda item: item[0])

    return [crop for _, crop in lines]


# --------------------------------------------------
# IMAGE HANDWRITING OCR
# --------------------------------------------------

def extract_handwriting_from_image(file_path):

    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"Image not found: {file_path}"
        )

    image = cv2.imread(file_path)

    if image is None:
        raise ValueError(
            f"Could not read image: {file_path}"
        )

    lines = find_lines(image)

    print(
        f"Detected {len(lines)} possible text lines."
    )

    results = []

    for index, line in enumerate(
        lines,
        start=1
    ):

        print(
            f"Processing line {index}/{len(lines)}..."
        )

        text = recognize_line(line)

        if text:
            results.append(text)

    return "\n".join(results)


# --------------------------------------------------
# PDF HANDWRITING OCR
# --------------------------------------------------

def extract_handwriting_from_pdf(file_path):

    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"PDF not found: {file_path}"
        )

    pdf = fitz.open(file_path)

    all_text = []

    print(
        f"PDF contains {len(pdf)} page(s)."
    )

    for page_number, page in enumerate(
        pdf,
        start=1
    ):

        print(
            f"\nProcessing PDF page {page_number}..."
        )

        # Render PDF page as high-resolution image
        matrix = fitz.Matrix(2.5, 2.5)

        pix = page.get_pixmap(
            matrix=matrix,
            alpha=False
        )

        image = Image.frombytes(
            "RGB",
            [pix.width, pix.height],
            pix.samples
        )

        image_cv = cv2.cvtColor(
            np.array(image),
            cv2.COLOR_RGB2BGR
        )

        lines = find_lines(image_cv)

        print(
            f"Detected {len(lines)} possible text lines."
        )

        page_text = []

        for index, line in enumerate(
            lines,
            start=1
        ):

            print(
                f"Processing page {page_number}, "
                f"line {index}/{len(lines)}..."
            )

            text = recognize_line(line)

            if text:
                page_text.append(text)

        if page_text:

            all_text.append(
                f"--- PAGE {page_number} ---"
            )

            all_text.extend(page_text)

    pdf.close()

    return "\n".join(all_text)


# --------------------------------------------------
# MAIN FUNCTION
# --------------------------------------------------

def extract_handwriting(file_path):
    """
    Automatically detect whether the file is
    an image or PDF and extract handwriting.
    """

    extension = os.path.splitext(
        file_path
    )[1].lower()

    if extension in [
        ".jpg",
        ".jpeg",
        ".png"
    ]:

        return extract_handwriting_from_image(
            file_path
        )

    elif extension == ".pdf":

        return extract_handwriting_from_pdf(
            file_path
        )

    else:

        raise ValueError(
            "Unsupported file type. "
            "Use JPG, JPEG, PNG, or PDF."
        )