from handwriting_ocr import extract_handwriting


image_file = "test.jpg"

print("=" * 70)
print("HANDWRITING OCR TEST")
print("=" * 70)

try:
    text = extract_handwriting(image_file)

    print("\nEXTRACTED HANDWRITTEN TEXT:")
    print("-" * 70)

    if text:
        print(text)

        with open(
            "handwritten_output.txt",
            "w",
            encoding="utf-8"
        ) as file:
            file.write(text)

        print("\nText saved to handwritten_output.txt")

    else:
        print("No handwritten text detected.")

except Exception as error:
    print("\nERROR:")
    print(error)