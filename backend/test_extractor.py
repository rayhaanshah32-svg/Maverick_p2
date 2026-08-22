from extractor import extract_text
import os


def extract_and_save(input_file, output_file):
    print("\n" + "=" * 70)
    print("INPUT FILE:", input_file)
    print("=" * 70)

    try:
        text = extract_text(input_file)

        if text:
            print("\nEXTRACTED TEXT:\n")
            print(text)

            # Save extracted text to a TXT file
            with open(output_file, "w", encoding="utf-8") as file:
                file.write(text)

            print("\n" + "=" * 70)
            print("TEXT SAVED SUCCESSFULLY")
            print("OUTPUT FILE:", output_file)
            print("=" * 70)

        else:
            print("\nNo text was detected.")

    except Exception as e:
        print("\nERROR:", e)


# PDF
extract_and_save("test.pdf", "extracted_pdf.txt")

# PowerPoint
extract_and_save("test.pptx", "extracted_ppt.txt")

# JPG/JPEG
extract_and_save("test.jpg", "extracted_image.txt")