import re


def clean_text(text):
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_into_paragraphs(text):
    text = clean_text(text)
    blocks = re.split(r"\n\s*\n", text)
    paragraphs = []

    for block in blocks:
        lines = block.split("\n")
        cleaned_lines = []

        for line in lines:
            line = line.strip()
            if len(line) > 0:
                cleaned_lines.append(line)

        if len(cleaned_lines) == 0:
            continue

        paragraph = " ".join(cleaned_lines)
        paragraph = re.sub(r"\s+", " ", paragraph)

        if len(paragraph) >= 5:
            paragraphs.append(paragraph)

    return paragraphs