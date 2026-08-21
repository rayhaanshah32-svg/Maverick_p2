import re


def clean_text(text):
    """
    Clean raw extracted text.
    """

    # Convert Windows line endings
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Remove extra spaces
    text = re.sub(r"[ \t]+", " ", text)

    # Remove spaces at the beginning/end of lines
    text = re.sub(r" *\n *", "\n", text)

    # Remove excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def split_into_paragraphs(text):
    """
    Convert cleaned text into readable paragraphs.
    """

    text = clean_text(text)

    # Split where there is a blank line
    blocks = re.split(r"\n\s*\n", text)

    paragraphs = []

    for block in blocks:

        lines = block.split("\n")

        cleaned_lines = []

        for line in lines:

            line = line.strip()

            if line:
                cleaned_lines.append(line)

        if not cleaned_lines:
            continue

        # Join broken PDF lines
        paragraph = " ".join(cleaned_lines)

        # Remove multiple spaces
        paragraph = re.sub(
            r"\s+",
            " ",
            paragraph
        )

        # Ignore extremely short garbage
        if len(paragraph) >= 10:
            paragraphs.append(paragraph)

    return paragraphs